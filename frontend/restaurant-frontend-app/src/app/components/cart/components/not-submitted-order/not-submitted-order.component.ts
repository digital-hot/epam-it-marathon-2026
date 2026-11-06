import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { Order } from '@app/models/orders/order.model';
import { isPreOrderClosed } from '@app/shared/helpers/pre-order-cutoff';

@Component({
  selector: 'app-not-submitted-order',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './not-submitted-order.component.html',
  styleUrl: './not-submitted-order.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotSubmittedOrderComponent {
  readonly order = input.required<Order>();

  readonly submitted = output<string>();
  readonly openGroup = output<string>();
  readonly addDish = output<void>();
  readonly removeDish = output<string>();
  readonly updateQuantity = output<{
    itemId: string;
    quantity: number;
  }>();

  readonly customerTotalPrice = computed(() =>
    this.order().orderItems.reduce(
      (total, item) => total + item.dish.price * item.quantity,
      0,
    ),
  );

  readonly totalPrice = this.customerTotalPrice;

  readonly groupReadyTotal = computed(() =>
    this.order().groupState?.submittedTotal ?? 0,
  );

  readonly isEmpty = computed(() => {
    const order = this.order();

    return (
      order.orderItems.length === 0 &&
      (order.groupState?.orderedGuests ?? 0) === 0
    );
  });

  // The reservation time already starts with the table name, which the card header shows on its own.
  readonly scheduleLabel = computed(() => {
    const { reservationTime, tableName } = this.order();
    const prefix = `${tableName} • `;

    return tableName && reservationTime.startsWith(prefix)
      ? reservationTime.slice(prefix.length)
      : reservationTime;
  });

  // Pre-orders can only be changed up to 30 minutes before the reservation starts.
  readonly preOrderClosed = computed(() => isPreOrderClosed(this.order().startTime));

  readonly readinessPercent = computed(() => {
    const state = this.order().groupState;
    return state?.totalGuests
      ? Math.round((state.orderedGuests / state.totalGuests) * 100)
      : 0;
  });

  readonly tableGrandTotal = computed(() => {
    if (this.order().isGroupOrder && this.order().groupState) {
      return this.customerTotalPrice() + this.groupReadyTotal();
    }
    return this.customerTotalPrice();
  });

  incrementItemQuantity(itemId: string): void {
    const item = this.findOrderItem(itemId);

    if (item) {
      this.updateItemQuantity(itemId, item.quantity + 1);
    }
  }

  decrementItemQuantity(itemId: string): void {
    const item = this.findOrderItem(itemId);

    if (item && item.quantity > 1) {
      this.updateItemQuantity(itemId, item.quantity - 1);
    }
  }

  openGroupOrder(reservationId: string): void {
    this.openGroup.emit(reservationId);
  }

  submit(): void {
    this.submitted.emit(this.order().orderId);
  }

  addDishToOrder(): void {
    this.addDish.emit();
  }

  removeDishFromOrder(itemId: string): void {
    this.removeDish.emit(itemId);
  }

  private findOrderItem(itemId: string) {
    return this.order().orderItems.find(
      (item) => item.dish.id === itemId,
    );
  }

  private updateItemQuantity(itemId: string, quantity: number): void {
    this.updateQuantity.emit({ itemId, quantity });
  }
}
