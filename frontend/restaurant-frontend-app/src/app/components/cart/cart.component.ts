import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, defaultIfEmpty, map, switchMap } from 'rxjs/operators';

import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupOrderState, Order } from '@app/models/orders/order.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { Reservation } from '@app/models/reservations/reservation.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';

import { CancelOrderModalComponent } from './components/cancel-order-modal/cancel-order-modal.component';
import { NotSubmittedOrderComponent } from './components/not-submitted-order/not-submitted-order.component';
import { SubmitOrderModalComponent } from './components/submit-order-modal/submit-order-modal.component';
import { SubmittedOrderComponent } from './components/submitted-order/submitted-order.component';
import { CartUiService, countCartDishes } from '@app/services/cart-ui/cart-ui.service';
import { endedReservationIds } from '@app/shared/helpers/ended-reservations';

interface GroupLookup {
  invite: GuestInvite;
  sessions: GroupSessionsResponse | null;
}

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    SubmittedOrderComponent,
    NotSubmittedOrderComponent,
    CancelOrderModalComponent,
    SubmitOrderModalComponent,
  ],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent implements OnInit {
  private readonly preOrdersService =
    inject(PreOrdersService);
  private readonly reservationService =
    inject(ReservationService, { optional: true });
  private readonly groupOrdersService =
    inject(GroupOrdersService, { optional: true });

  private readonly router = inject(Router);
  private readonly cartUi = inject(CartUiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly closeCartEvent = output<void>();

  readonly orders = signal<Order[]>([]);

  readonly cancelOrderId = signal<string | null>(null);
  readonly submitOrderId = signal<string | null>(null);

  readonly submittedOrders = computed(() =>
    this.orders().filter(
      (order) => order.status === 1 || order.status === 3,
    ),
  );

  readonly unsubmittedOrders = computed(() =>
    this.orders().filter((order) => order.status === 0),
  );

  // Every active table, soonest first, so tables without dishes stay visible next to the others.
  readonly activeTables = computed(() =>
    [...this.unsubmittedOrders()].sort(
      (left, right) =>
        this.startMillis(left) - this.startMillis(right),
    ),
  );

  readonly submittedOrder = computed(() => {
    const orderId = this.submitOrderId();

    if (!orderId) {
      return undefined;
    }

    return this.orders().find(
      (order) => order.orderId === orderId,
    );
  });

  constructor() {
    // keeps the header badge in step with edits made inside the cart
    effect(() => this.cartUi.count.set(countCartDishes(this.orders())));
  }

  ngOnInit(): void {
    this.loadOrders();
  }

  closeCart(): void {
    this.closeCartEvent.emit();
  }

  openCancelModal(orderId: string): void {
    this.cancelOrderId.set(orderId);
    this.submitOrderId.set(null);
  }

  closeCancelModal(): void {
    this.cancelOrderId.set(null);
  }

  closeSubmitModal(): void {
    this.submitOrderId.set(null);
  }

  editOrderModal(): void {
    const orderId = this.submitOrderId();

    if (!orderId) {
      console.error('No order selected for editing');
      return;
    }

    this.editOrder(orderId);
    this.closeSubmitModal();
  }

  goToReservations(): void {
    this.closeCart();
    void this.router.navigate(['/reservations']);
  }

  navigateToGroupOrder(reservationId: string): void {
    this.closeCart();
    void this.router.navigate(['/reservations', reservationId, 'group-order']);
  }

  cancelOrder(orderId: string): void {
    const order = this.findOrder(orderId);

    if (!order) {
      return;
    }

    if (order.orderId.startsWith('table-')) {
      this.closeCancelModal();
      return;
    }

    this.preOrdersService
      .cancelPreOrderByReservationId(order.reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeCancelModal();
          this.loadOrders();
        },
        error: (error) => {
          console.error(
            `Error cancelling order ${orderId}:`,
            error,
          );
        },
      });
  }

  editOrder(orderId: string): void {
    const order = this.findOrder(orderId);

    if (!order) {
      return;
    }

    this.preOrdersService
      .unsubmitPreOrderByReservationId(order.reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadOrders();
        },
        error: (error) => {
          console.error(
            `Error un-submitting order ${orderId}:`,
            error,
          );
        },
      });
  }

  submitOrder(orderId: string): void {
    const order = this.findOrder(orderId);

    if (!order || order.orderItems.length === 0 || order.orderId.startsWith('table-')) {
      return;
    }

    this.preOrdersService
      .submitPreOrderByReservationId(order.reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitOrderId.set(orderId);
          this.loadOrders();
        },
        error: (error) => {
          console.error(
            `Error submitting order ${orderId}:`,
            error,
          );
        },
      });
  }

  addDishToOrder(orderId: string): void {
    const order = this.findOrder(orderId);
    this.closeCart();

    if (!order) {
      void this.router.navigate(['/menu']);
      return;
    }

    void this.router.navigate(['/menu'], {
      queryParams: {
        preOrder: 'true',
        reservationId: order.reservationId,
        reservationStart: order.startTime ? new Date(order.startTime).toISOString() : null,
        reservationLabel: [
          order.reservationAddress,
          order.reservationTime,
        ]
          .filter(Boolean)
          .join(', '),
      },
    });
  }

  updateDishQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): void {
    if (quantity <= 0) {
      return;
    }

    const originalOrder = this.findOrder(orderId);

    if (!originalOrder) {
      return;
    }

    const updatedOrder: Order = {
      ...originalOrder,
      orderItems: originalOrder.orderItems.map((item) =>
        item.dish.id === itemId
          ? {
            ...item,
            quantity,
          }
          : item,
      ),
    };

    this.preOrdersService
      .editPreOrderByReservationId(
        updatedOrder.reservationId,
        updatedOrder,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadOrders();
        },
        error: (error) => {
          console.error(
            `Error updating item ${itemId}:`,
            error,
          );
        },
      });
  }

  removeDishFromOrder(
    orderId: string,
    itemId: string,
  ): void {
    const originalOrder = this.findOrder(orderId);

    if (!originalOrder) {
      return;
    }

    const updatedOrder: Order = {
      ...originalOrder,
      orderItems: originalOrder.orderItems.filter(
        (item) => item.dish.id !== itemId,
      ),
    };

    this.preOrdersService
      .editPreOrderByReservationId(
        updatedOrder.reservationId,
        updatedOrder,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadOrders();
        },
        error: (error) => {
          console.error(
            `Error removing item ${itemId}:`,
            error,
          );
        },
      });
  }

  private findOrder(orderId: string): Order | undefined {
    const order = this.orders().find(
      (item) => item.orderId === orderId,
    );

    if (!order) {
      console.error(`Order with ID ${orderId} not found`);
    }

    return order;
  }

  private loadOrders(): void {
    const orders$ = this.preOrdersService
      .getPreOrders()
      .pipe(catchError(() => of([])));

    const reservations$ = this.reservationService
      ? this.reservationService
          .getReservationsForUser$()
          .pipe(catchError(() => of([])))
      : of([]);

    forkJoin({ orders: orders$, reservations: reservations$ })
      .pipe(
        switchMap(({ orders: allOrders, reservations }) => {
          // Tables whose reservation is already over are hidden together with their dishes.
          const endedIds = endedReservationIds(reservations);
          const orders = allOrders.filter((o) => !endedIds.has(o.reservationId));
          const activeReservations = reservations.filter(
            (r) => (r.status as number) === 0 && !endedIds.has(r.id),
          );

          return forkJoin(activeReservations.map((res) => this.lookupGroup$(res))).pipe(
            defaultIfEmpty([] as { resId: string; groupData: GroupLookup | null }[]),
            map((results) => {
              const groupMap = new Map<string, GroupLookup>();
              results.forEach(({ resId, groupData }) => groupData && groupMap.set(resId, groupData));
              return { orders, activeReservations, groupMap };
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ orders, activeReservations, groupMap }) =>
        this.processOrders(orders, activeReservations, groupMap),
      );
  }

  // Invite and guest sessions of a group table; single tables and failed lookups give null.
  private lookupGroup$(res: Reservation): Observable<{ resId: string; groupData: GroupLookup | null }> {
    const service = this.groupOrdersService;
    if (!service || (res.guestCount ?? 1) < 2) {
      return of({ resId: res.id, groupData: null });
    }

    return service.getGroupInvite$(res.id, { silent: true }).pipe(
      switchMap((invite) =>
        service.getSessions$(invite.GroupReservationId, { silent: true }).pipe(
          catchError(() => of(null)),
          map((sessions) => ({ resId: res.id, groupData: { invite, sessions } })),
        ),
      ),
      catchError(() => of({ resId: res.id, groupData: null })),
    );
  }

  private processOrders(
    orders: Order[],
    activeReservations: Reservation[],
    groupMap: Map<string, GroupLookup>,
  ): void {
    const nonCancelledOrders = orders.filter((o) => o.status !== 2);
    const activeOrderResIds = new Set(
      nonCancelledOrders.map((o) => o.reservationId),
    );

    const resMap = new Map(
      activeReservations.map((r) => [r.id, r]),
    );

    const enhancedOrders: Order[] = nonCancelledOrders.map((order) => {
      const res = resMap.get(order.reservationId);
      const groupInfo = groupMap.get(order.reservationId);
      const tableLabel = this.getTableLabel(res?.tableId);

      let timeStr = order.reservationTime || '';
      if (tableLabel && !timeStr.includes(tableLabel)) {
        timeStr = `${tableLabel} • ${timeStr}`;
      }

      return {
        ...order,
        reservationAddress:
          order.reservationAddress || res?.locationAddress || '',
        reservationTime: timeStr,
        startTime: res?.startTime,
        isGroupOrder: Boolean(order.isGroupOrder || groupInfo),
        groupState: groupInfo
          ? this.buildGroupState(groupInfo, res, order.orderItems.length > 0)
          : order.groupState,
        tableName: tableLabel || 'Table',
      };
    });

    for (const res of activeReservations) {
      if (activeOrderResIds.has(res.id)) {
        continue;
      }

      const tableLabel = this.getTableLabel(res.tableId) || 'Table';
      const groupInfo = groupMap.get(res.id);

      enhancedOrders.push({
        orderId: `table-${res.id}`,
        reservationId: res.id,
        reservationAddress: res.locationAddress || '',
        reservationTime: `${tableLabel} • ${this.formatReservationTime(res.startTime, res.endTime)}`,
        orderItems: [],
        status: 0,
        startTime: res.startTime,
        isGroupOrder: Boolean(groupInfo),
        groupState: groupInfo
          ? this.buildGroupState(groupInfo, res, false)
          : undefined,
        tableName: tableLabel,
      });
    }

    this.orders.set(enhancedOrders);
  }

  // Страви власника живуть у /orders; сесії групи дають лише страви гостей.
  private buildGroupState(
    { invite, sessions }: GroupLookup,
    res: Reservation | undefined,
    ownerHasDishes: boolean,
  ): GroupOrderState {
    const guests = (sessions?.participants ?? []).filter(
      (p) => p.type !== 'Owner',
    );
    const guestsWithDishes = guests.filter((p) => p.items?.length > 0).length;
    const submittedGuests = guests.filter((p) => p.isSubmitted);

    return {
      totalGuests: res?.guestCount || invite.MaxGuestCount || 2,
      orderedGuests: guestsWithDishes + (ownerHasDishes ? 1 : 0),
      submittedGuests: submittedGuests.length,
      groupReservationId: invite.GroupReservationId,
      groupTotal: guests.reduce((sum, p) => sum + (p.total ?? 0), 0),
      submittedTotal: submittedGuests.reduce(
        (sum, p) => sum + (p.total ?? 0),
        0,
      ),
      guests: guests.map(({ id, name, isSubmitted, total }) => ({
        id,
        name,
        isSubmitted,
        total: total ?? 0,
      })),
    };
  }

  private startMillis(order: Order): number {
    const time = order.startTime
      ? new Date(order.startTime).getTime()
      : Number.NaN;

    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  }

  private getTableLabel(tableId?: string): string {
    return tableId ? `Table ${tableId.replace('table-', '')}` : '';
  }

  private formatReservationTime(
    startTime: Date | string,
    endTime: Date | string,
  ): string {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const dateStr = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const startStr = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const endStr = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateStr}, ${startStr} - ${endStr}`;
  }
}
