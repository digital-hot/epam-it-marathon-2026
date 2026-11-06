import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { Order } from '@app/models/orders/order.model';
import { Reservation } from '@app/models/reservations/reservation.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';

import { CartComponent } from './cart.component';

describe('CartComponent', () => {
  let component: CartComponent;
  let fixture: ComponentFixture<CartComponent>;

  let preOrdersServiceMock: jasmine.SpyObj<PreOrdersService>;
  let reservationServiceMock: jasmine.SpyObj<ReservationService>;
  let groupOrdersServiceMock: jasmine.SpyObj<GroupOrdersService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    preOrdersServiceMock =
      jasmine.createSpyObj<PreOrdersService>(
        'PreOrdersService',
        [
          'getPreOrders',
          'cancelPreOrderByReservationId',
          'unsubmitPreOrderByReservationId',
          'submitPreOrderByReservationId',
          'editPreOrderByReservationId',
        ],
      );

    reservationServiceMock =
      jasmine.createSpyObj<ReservationService>(
        'ReservationService',
        ['getReservationsForUser$'],
      );

    groupOrdersServiceMock =
      jasmine.createSpyObj<GroupOrdersService>(
        'GroupOrdersService',
        ['getGroupInvite$', 'getSessions$', 'getStatus$', 'getOwnerSessionId$'],
      );

    routerMock = jasmine.createSpyObj<Router>(
      'Router',
      ['navigate'],
    );

    preOrdersServiceMock.getPreOrders.and.returnValue(of([]));
    reservationServiceMock.getReservationsForUser$.and.returnValue(of([]));
    groupOrdersServiceMock.getGroupInvite$.and.returnValue(of({
      GroupReservationId: 'group-1',
      LocationId: 'loc-1',
      RestaurantName: 'Green & Tasty',
      LocationAddress: 'Rustaveli 48',
      StartTime: '2026-11-01T12:00:00Z',
      EndTime: '2026-11-01T14:00:00Z',
      MaxGuestCount: 4,
      TableNumber: 1,
      InviterName: 'Host',
    }));
    groupOrdersServiceMock.getSessions$.and.returnValue(of({
      participants: [],
      total: 0,
    }));
    groupOrdersServiceMock.getOwnerSessionId$.and.returnValue(of(''));

    await TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [
        {
          provide: PreOrdersService,
          useValue: preOrdersServiceMock,
        },
        {
          provide: ReservationService,
          useValue: reservationServiceMock,
        },
        {
          provide: GroupOrdersService,
          useValue: groupOrdersServiceMock,
        },
        {
          provide: Router,
          useValue: routerMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CartComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit closeCartEvent when closeCart is called', () => {
    spyOn(component.closeCartEvent, 'emit');

    component.closeCart();

    expect(
      component.closeCartEvent.emit,
    ).toHaveBeenCalled();
  });

  it('should return submitted orders with statuses 1 and 3', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 1,
      },
      {
        orderId: 'order-2',
        status: 2,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
      {
        orderId: 'order-4',
        status: 0,
      },
    ] as Order[]);

    expect(
      component
        .submittedOrders()
        .map((order) => order.status),
    ).toEqual([1, 3]);
  });

  it('should return unsubmitted orders with status 0', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 0,
      },
      {
        orderId: 'order-2',
        status: 1,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
    ] as Order[]);

    expect(
      component
        .unsubmittedOrders()
        .map((order) => order.status),
    ).toEqual([0]);
  });

  it('keeps owner dishes from /orders and counts only guests in group totals', () => {
    const dish = { id: 'd1', name: 'Salad', price: 10 };
    preOrdersServiceMock.getPreOrders.and.returnValue(of([{
      orderId: 'order-1',
      reservationId: 'res-1',
      reservationAddress: 'Rustaveli 48',
      reservationTime: '12:00',
      status: 0,
      orderItems: [{ dish, quantity: 2, state: 0 }],
    }] as Order[]));
    reservationServiceMock.getReservationsForUser$.and.returnValue(of([{
      id: 'res-1',
      status: 0,
      guestCount: 3,
      tableId: 'table-1',
    }] as unknown as Reservation[]));
    groupOrdersServiceMock.getSessions$.and.returnValue(of({
      participants: [
        { id: 'o', type: 'Owner', name: 'Owner', items: [], total: 0, isSubmitted: false },
        { id: 'g1', type: 'Guest', name: 'A', items: [{ dish, quantity: 1 }], total: 10, isSubmitted: true },
        { id: 'g2', type: 'Guest', name: 'B', items: [{ dish, quantity: 2 }], total: 20, isSubmitted: false },
      ],
      total: 30,
    } as unknown as GroupSessionsResponse));

    component.ngOnInit();

    const order = component.orders()[0];
    expect(order.orderItems.length).toBe(1);
    expect(order.orderItems[0].quantity).toBe(2);
    expect(order.groupState).toEqual(jasmine.objectContaining({
      orderedGuests: 3,
      submittedGuests: 1,
      groupTotal: 30,
      submittedTotal: 10,
    }));
    expect(groupOrdersServiceMock.getOwnerSessionId$).not.toHaveBeenCalled();
  });

  it('hides tables and dishes of reservations that are already over', () => {
    const dish = { id: 'd1', name: 'Salad', price: 10 };
    preOrdersServiceMock.getPreOrders.and.returnValue(of([
      { orderId: 'old', reservationId: 'past', reservationAddress: '', reservationTime: '', status: 0, orderItems: [{ dish, quantity: 1, state: 0 }] },
      { orderId: 'new', reservationId: 'next', reservationAddress: '', reservationTime: '', status: 0, orderItems: [{ dish, quantity: 1, state: 0 }] },
    ] as Order[]));
    reservationServiceMock.getReservationsForUser$.and.returnValue(of([
      { id: 'past', status: 0, guestCount: 1, tableId: 'table-1', startTime: new Date(Date.now() - 3 * 3_600_000), endTime: new Date(Date.now() - 3_600_000) },
      { id: 'next', status: 0, guestCount: 1, tableId: 'table-2', startTime: new Date(Date.now() + 3_600_000), endTime: new Date(Date.now() + 2 * 3_600_000) },
      { id: 'empty-past', status: 0, guestCount: 1, tableId: 'table-3', startTime: new Date(Date.now() - 3 * 3_600_000), endTime: new Date(Date.now() - 3_600_000) },
    ] as unknown as Reservation[]));

    component.ngOnInit();

    expect(component.activeTables().map((order) => order.reservationId)).toEqual(['next']);
  });

  it('lists every active table soonest first, including tables without dishes', () => {
    component.orders.set([
      { orderId: 'late', status: 0, orderItems: [], startTime: '2026-11-02T18:00:00Z' },
      { orderId: 'submitted', status: 1, orderItems: [] },
      { orderId: 'early', status: 0, orderItems: [{}], startTime: '2026-11-01T10:00:00Z' },
      { orderId: 'unknown', status: 0, orderItems: [] },
    ] as unknown as Order[]);

    expect(component.activeTables().map((order) => order.orderId)).toEqual([
      'early',
      'late',
      'unknown',
    ]);
  });

  it('should navigate to reservations when goToReservations is called', () => {
    component.goToReservations();

    expect(routerMock.navigate).toHaveBeenCalledWith([
      '/reservations',
    ]);
  });

  it('should navigate to group order and close cart when navigateToGroupOrder is called', () => {
    spyOn(component.closeCartEvent, 'emit');

    component.navigateToGroupOrder('res-123');

    expect(component.closeCartEvent.emit).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith([
      '/reservations',
      'res-123',
      'group-order',
    ]);
  });
});
