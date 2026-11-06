import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  OnDestroy,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, EMPTY, exhaustMap, forkJoin, interval, map, Observable, of, Subscription, switchMap, tap } from 'rxjs';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { Participant, ParticipantItem } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { ToastService } from '@app/services/toast/toast.service';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { isPreOrderClosed } from '@app/shared/helpers/pre-order-cutoff';
import { GROUP_ORDER_PREVIEW } from '@app/shared/mocks/group-orders/group-order.preview';

const SYNC_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-group-order-page',
  imports: [CurrencyPipe, DatePipe, ParticipantCardComponent, ModalComponent],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });

  private groupOrdersService: GroupOrdersService | null = null;
  private toastService: ToastService | null = null;
  private syncSubscription: Subscription | null = null;
  private loadSubscription: Subscription | null = null;

  readonly reservationId = this.route?.snapshot.paramMap.get('reservationId') ?? '';
  readonly isPreviewMode = signal(!this.reservationId);

  readonly invite = signal<GuestInvite | null>(GROUP_ORDER_PREVIEW.invite);
  readonly participants = signal<Participant[]>(GROUP_ORDER_PREVIEW.sessions.participants);
  readonly previewTotal = signal<number>(GROUP_ORDER_PREVIEW.sessions.total);
  readonly groupStatus = signal<GroupReservationStatus>('Open');

  readonly isLoading = signal(false);
  readonly errorState = signal<'none' | 'not-found' | 'submitted' | 'generic'>('none');

  readonly lastUpdatedAt = signal<Date | null>(null);
  readonly refreshError = signal(false);

  readonly isSubmitModalOpen = signal(false);
  readonly isSubmitting = signal(false);

  readonly participantToRemove = signal<Participant | null>(null);
  readonly isRemoving = signal(false);

  readonly linkCopied = signal(false);

  // The owner adds dishes to the order itself (menu, cart); the group sessions only hold guests' dishes.
  private ownerOrderItems: ParticipantItem[] = [];

  readonly consolidatedOrder = computed(() => consolidatePreOrder(this.participants()));

  readonly grandTotal = computed(() =>
    this.isPreviewMode() ? this.previewTotal() : this.consolidatedOrder().total,
  );

  readonly submittedCount = computed(
    () => this.participants().filter((person) => person.isSubmitted).length,
  );

  readonly unsubmittedCount = computed(
    () => this.participants().filter((person) => !person.isSubmitted).length,
  );

  // Guests who have not joined yet count as not ready, so the bar is measured against the booked guests.
  readonly readinessTotal = computed(() =>
    Math.max(this.participants().length, this.invite()?.MaxGuestCount ?? 0),
  );

  readonly readinessPercent = computed(() => {
    const total = this.readinessTotal();
    return total > 0 ? Math.round((this.submittedCount() / total) * 100) : 0;
  });

  readonly hasAnyDishes = computed(() =>
    this.participants().some((person) => person.items.length > 0),
  );

  readonly statusBadgeText = computed(() => {
    const currentStatus = this.groupStatus();
    if (currentStatus === 'Submitted') {
      return 'Sent to Restaurant';
    }
    if (currentStatus === 'Closed') {
      return 'Closed';
    }
    return 'Collecting pre-orders';
  });

  // Mirrors the backend rule: pre-orders can change only up to 30 minutes before the reservation starts.
  readonly preOrderClosed = computed(() => isPreOrderClosed(this.invite()?.StartTime));

  readonly isEditable = computed(() => this.groupStatus() === 'Open' && !this.preOrderClosed());

  readonly canSubmit = computed(
    () =>
      this.isEditable() &&
      this.consolidatedOrder().items.length > 0 &&
      !this.isSubmitting(),
  );

  constructor() {
    if (!this.isPreviewMode()) {
      this.groupOrdersService = this.injector.get(GroupOrdersService);
      this.toastService = this.injector.get(ToastService, null);
      this.loadData();
    }
  }

  ngOnDestroy(): void {
    this.stopSync();
    this.loadSubscription?.unsubscribe();
  }

  loadData(): void {
    if (!this.groupOrdersService || !this.reservationId) {
      return;
    }

    this.stopSync();
    this.loadSubscription?.unsubscribe();
    this.isLoading.set(true);
    this.errorState.set('none');

    const service = this.groupOrdersService;
    this.loadSubscription = service
      // Silent: load errors are rendered by the page itself (submitted / not-found states).
      .getGroupInvite$(this.reservationId, { silent: true })
      .pipe(
        switchMap((inviteData) => {
          // Set first: the owner card takes its name from the invite.
          this.invite.set(inviteData);
          return this.fetchSnapshot$(inviteData.GroupReservationId).pipe(
            tap(({ statusInfo }) => {
              this.isLoading.set(false);

              if (statusInfo.status === 'Open') {
                this.startSync(inviteData.GroupReservationId);
              }
            }),
          );
        }),
      )
      .subscribe({
        error: (err: unknown) => {
          this.isLoading.set(false);
          const errorBody = err instanceof HttpErrorResponse ? err.error : null;
          const errorMessage =
            typeof errorBody === 'string'
              ? errorBody
              : ((errorBody?.Message as string | undefined) ||
                 (errorBody?.message as string | undefined) ||
                 (errorBody?.error as string | undefined) ||
                 '');
          if (err instanceof HttpErrorResponse && err.status === 404) {
            this.errorState.set('not-found');
          } else if (errorMessage.toLowerCase().includes('submitted')) {
            this.errorState.set('submitted');
          } else {
            this.errorState.set('generic');
          }
        },
      });
  }

  refreshNow(): void {
    const currentInvite = this.invite();
    if (!currentInvite || !this.groupOrdersService) {
      return;
    }
    this.fetchSilentSnapshot$(currentInvite.GroupReservationId).subscribe();
  }

  backToReservations(): void {
    void this.router?.navigate(['/reservations']);
  }

  openMyPreOrder(): void {
    if (!this.reservationId || !this.router) {
      return;
    }
    const currentInvite = this.invite();
    const label = currentInvite?.LocationAddress ?? this.reservationId;
    void this.router.navigate(['/menu'], {
      queryParams: {
        preOrder: 'true',
        reservationId: this.reservationId,
        reservationLabel: label,
      },
    });
  }

  onRemindGuest(guest: Participant): void {
    this.copyInviteLink(guest);
  }

  /** Copies the group invite link; with a guest the toast says whom to send it to. */
  copyInviteLink(guest?: Participant): void {
    if (!this.reservationId) {
      return;
    }
    // Лінива ін'єкція: сервіс потрібен лише по кліку, тож тести без API_BASE_URL не падають.
    const guestInviteService = this.injector.get(GuestInviteService, null);
    if (!guestInviteService) {
      return;
    }
    guestInviteService.getInviteToken$(this.reservationId).subscribe({
      next: ({ token }) => {
        void navigator.clipboard?.writeText(`${window.location.origin}/join/${token}`);
        this.toastService?.success(guest ? `Send it to ${guest.name}.` : 'Share it with your friends.', 'Link copied!');
        if (!guest) {
          this.linkCopied.set(true);
          setTimeout(() => this.linkCopied.set(false), 2000);
        }
      },
      error: () => {
        this.toastService?.error(guest ? `Could not copy invite link for ${guest.name}.` : 'Could not copy the invite link.');
      },
    });
  }

  openSubmitModal(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.isSubmitModalOpen.set(true);
  }

  closeSubmitModal(): void {
    if (this.isSubmitting()) {
      return;
    }
    this.isSubmitModalOpen.set(false);
  }

  confirmSubmit(): void {
    const currentInvite = this.invite();
    if (this.isSubmitting() || !currentInvite || !this.groupOrdersService) {
      return;
    }

    this.isSubmitting.set(true);
    this.groupOrdersService
      .submit$(currentInvite.GroupReservationId, this.reservationId)
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.isSubmitModalOpen.set(false);
          this.groupStatus.set('Submitted');
          this.stopSync();
          this.toastService?.success('Pre-order sent to the restaurant');
        },
        error: () => {
          this.isSubmitting.set(false);
          this.isSubmitModalOpen.set(false);
        },
      });
  }

  openRemoveModal(participant: Participant): void {
    if (!this.isEditable() || participant.type !== 'Guest') {
      return;
    }
    this.participantToRemove.set(participant);
  }

  closeRemoveModal(): void {
    if (this.isRemoving()) {
      return;
    }
    this.participantToRemove.set(null);
  }

  confirmRemoveGuest(): void {
    const targetGuest = this.participantToRemove();
    const currentInvite = this.invite();
    if (this.isRemoving() || !targetGuest || !currentInvite || !this.groupOrdersService) {
      return;
    }

    this.isRemoving.set(true);
    this.groupOrdersService
      .removeSession$(currentInvite.GroupReservationId, targetGuest.id)
      .subscribe({
        next: (updatedSessions) => {
          this.participants.set(this.withOwnerOrder(updatedSessions.participants));
          this.participantToRemove.set(null);
          this.isRemoving.set(false);
        },
        error: () => {
          this.participantToRemove.set(null);
          this.isRemoving.set(false);
        },
      });
  }

  // Dishes the owner put into the reservation's order. Without the service (or an order) the
  // owner's own session dishes are shown unchanged.
  private fetchOwnerOrderItems$(): Observable<ParticipantItem[]> {
    let preOrders: PreOrdersService;
    try {
      preOrders = this.injector.get(PreOrdersService);
    } catch {
      return of([]);
    }

    return preOrders.getPreOrders().pipe(
      map((orders) => {
        const order = orders.find(
          (candidate) => candidate.reservationId === this.reservationId && candidate.status !== 2,
        );

        return (order?.orderItems ?? []).map(({ dish, quantity }) => ({
          dish: { id: dish.id, name: dish.name, price: dish.price, imageUrl: dish.imageUrl, weight: dish.weight },
          quantity,
        }));
      }),
      catchError(() => of([])),
    );
  }

  private withOwnerOrder(participants: Participant[]): Participant[] {
    const items = this.ownerOrderItems;
    if (items.length === 0) {
      return participants;
    }

    const total = items.reduce((sum, item) => sum + item.dish.price * item.quantity, 0);
    // The owner's dishes are already part of the order, so they count as ready to send.
    const ownerOrder = { items, total, isSubmitted: true };

    // A group without an owner session still shows the owner's own dishes as the first card.
    if (!participants.some((person) => person.type === 'Owner')) {
      const owner: Participant = { id: 'owner', type: 'Owner', name: this.invite()?.InviterName || 'Owner', ...ownerOrder };
      return [owner, ...participants];
    }

    return participants.map((person) => (person.type === 'Owner' ? { ...person, ...ownerOrder } : person));
  }

  private startSync(groupReservationId: string): void {
    this.stopSync();
    if (this.groupStatus() !== 'Open') {
      return;
    }

    this.syncSubscription = interval(SYNC_INTERVAL_MS)
      .pipe(exhaustMap(() => this.fetchSilentSnapshot$(groupReservationId)))
      .subscribe();
  }

  private stopSync(): void {
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = null;
  }

  // Background refresh: errors only flag the "couldn't refresh" hint and never break the page.
  private fetchSilentSnapshot$(groupReservationId: string) {
    return this.fetchSnapshot$(groupReservationId, { silent: true }).pipe(
      tap(({ statusInfo }) => {
        if (statusInfo.status !== 'Open') {
          this.stopSync();
        }
      }),
      catchError(() => {
        this.refreshError.set(true);
        return EMPTY;
      }),
    );
  }

  // Sessions, status and the owner's own order, applied to the page state in one go.
  private fetchSnapshot$(groupReservationId: string, options?: { silent: boolean }) {
    const service = this.groupOrdersService;
    if (!service) {
      return EMPTY;
    }

    return forkJoin({
      sessions: service.getSessions$(groupReservationId, options),
      statusInfo: service.getStatus$(groupReservationId, options),
      ownerItems: this.fetchOwnerOrderItems$(),
    }).pipe(
      tap(({ sessions, statusInfo, ownerItems }) => {
        this.ownerOrderItems = ownerItems;
        this.participants.set(this.withOwnerOrder(sessions.participants));
        this.groupStatus.set(statusInfo.status);
        this.lastUpdatedAt.set(new Date());
        this.refreshError.set(false);
      }),
    );
  }
}

