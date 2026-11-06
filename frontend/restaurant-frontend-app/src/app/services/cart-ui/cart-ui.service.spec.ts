import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Order } from '@app/models/orders/order.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { CartUiService } from './cart-ui.service';

function order(status: number, quantities: number[], reservationId = 'r'): Order {
  return {
    orderId: `o${status}${quantities.length}`,
    reservationAddress: '',
    reservationTime: '',
    reservationId,
    status,
    orderItems: quantities.map((quantity) => ({ dish: {} as never, quantity, state: 0 })),
  };
}

describe('CartUiService', () => {
  it('counts dishes of unsubmitted pre-orders only', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PreOrdersService, useValue: { getPreOrders: () => of([order(0, [2, 1]), order(0, [1]), order(1, [5])]) } },
        { provide: ReservationService, useValue: { getReservationsForUser$: () => of([]) } },
      ],
    });
    const service = TestBed.inject(CartUiService);

    service.refreshCount();

    expect(service.count()).toBe(4);
  });

  it('skips dishes of reservations that are already over', () => {
    const reservations = [
      { id: 'past', endTime: new Date(Date.now() - 60_000) },
      { id: 'next', endTime: new Date(Date.now() + 3_600_000) },
    ];
    TestBed.configureTestingModule({
      providers: [
        { provide: PreOrdersService, useValue: { getPreOrders: () => of([order(0, [2], 'past'), order(0, [3], 'next')]) } },
        { provide: ReservationService, useValue: { getReservationsForUser$: () => of(reservations) } },
      ],
    });
    const service = TestBed.inject(CartUiService);

    service.refreshCount();

    expect(service.count()).toBe(3);
  });

  it('signals every open request', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PreOrdersService, useValue: {} },
        { provide: ReservationService, useValue: {} },
      ],
    });
    const service = TestBed.inject(CartUiService);

    service.requestOpen();
    service.requestOpen();

    expect(service.openRequests()).toBe(2);
  });
});
