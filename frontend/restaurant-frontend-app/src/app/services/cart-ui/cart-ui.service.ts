import { Injectable, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { Order } from '@app/models/orders/order.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { endedReservationIds } from '@app/shared/helpers/ended-reservations';

/** Dishes in not yet submitted pre-orders: the number shown on the cart button. */
export function countCartDishes(orders: Order[]): number {
  return orders
    .filter((order) => order.status === 0)
    .reduce((sum, order) => sum + order.orderItems.reduce((items, item) => items + item.quantity, 0), 0);
}

/** Shared state between the menu, the header cart button and the cart panel. */
@Injectable({ providedIn: 'root' })
export class CartUiService {
  private readonly preOrdersService = inject(PreOrdersService);
  private readonly reservationService = inject(ReservationService, { optional: true });

  /** Dishes in not yet submitted pre-orders, shown as a badge on the cart button. */
  readonly count = signal(0);

  /** Increments on every request to open the cart panel; the header reacts to it. */
  readonly openRequests = signal(0);

  requestOpen(): void {
    this.openRequests.update((value) => value + 1);
  }

  refreshCount(): void {
    const reservations$ = this.reservationService
      ? this.reservationService.getReservationsForUser$().pipe(catchError(() => of([])))
      : of([]);

    forkJoin({
      orders: this.preOrdersService.getPreOrders().pipe(catchError(() => of([]))),
      reservations: reservations$,
    })
      .subscribe(({ orders, reservations }) => {
        // Dishes of tables that are already over are not in the cart, so they are not counted.
        const endedIds = endedReservationIds(reservations);
        this.count.set(countCartDishes(orders.filter((order) => !endedIds.has(order.reservationId))));
      });
  }
}
