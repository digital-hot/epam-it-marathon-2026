import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Order } from '@app/models/orders/order.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupOrderPageComponent } from './group-order-page.component';

const salad = { id: 'dish3', name: 'Fresh Strawberry Mint Salad', price: 17 };
const tart = { id: 'dish7', name: 'Citrus Berry Tart', price: 9 };

const SESSIONS: GroupSessionsResponse = {
  participants: [
    { id: 'owner', type: 'Owner', name: 'Owner', isSubmitted: false, total: 0, items: [] },
    { id: 'olena', type: 'Guest', name: 'Olena', isSubmitted: true, total: 9, items: [{ dish: tart, quantity: 1 }] },
  ],
  total: 9,
};
const INVITE = { GroupReservationId: 'grp-1', LocationAddress: 'Rustaveli Avenue 48', MaxGuestCount: 2 } as GuestInvite;

describe('GroupOrderPageComponent · owner dishes from the order', () => {
  let preOrders: jasmine.SpyObj<PreOrdersService>;

  function create(sessions: GroupSessionsResponse = SESSIONS) {
    const service = jasmine.createSpyObj<GroupOrdersService>('GroupOrdersService', [
      'getGroupInvite$', 'getSessions$', 'getOwnerSessionId$', 'getStatus$',
    ]);
    service.getGroupInvite$.and.returnValue(of(INVITE));
    service.getSessions$.and.returnValue(of(structuredClone(sessions)));
    service.getOwnerSessionId$.and.returnValue(of('owner'));
    service.getStatus$.and.returnValue(of({ currentParticipants: 2, maxCapacity: 2, status: 'Open' as const }));

    TestBed.configureTestingModule({
      imports: [GroupOrderPageComponent],
      providers: [
        { provide: GroupOrdersService, useValue: service },
        { provide: PreOrdersService, useValue: preOrders },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ reservationId: 'res-1' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(GroupOrderPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    preOrders = jasmine.createSpyObj<PreOrdersService>('PreOrdersService', ['getPreOrders']);
  });

  it('shows the dishes the owner added to the order and counts them in the total', () => {
    preOrders.getPreOrders.and.returnValue(of([
      { reservationId: 'res-1', status: 0, orderItems: [{ dish: salad, quantity: 2, state: 0 }] },
    ] as unknown as Order[]));

    const page = create();
    const owner = page.participants().find((person) => person.type === 'Owner');

    expect(owner?.items.length).toBe(1);
    expect(owner?.total).toBe(34);
    expect(owner?.isSubmitted).toBeTrue();
    expect(page.grandTotal()).toBe(43);
    expect(page.canSubmit()).toBeTrue();
  });

  it('adds the owner card when the group has no owner session yet', () => {
    preOrders.getPreOrders.and.returnValue(of([
      { reservationId: 'res-1', status: 0, orderItems: [{ dish: salad, quantity: 1, state: 0 }] },
    ] as unknown as Order[]));

    const page = create({ participants: SESSIONS.participants.filter((person) => person.type === 'Guest'), total: 9 });
    const [first] = page.participants();

    expect(first.type).toBe('Owner');
    expect(first.items.length).toBe(1);
    expect(page.grandTotal()).toBe(26);
  });

  it('ignores a cancelled order and orders of other reservations', () => {
    preOrders.getPreOrders.and.returnValue(of([
      { reservationId: 'res-1', status: 2, orderItems: [{ dish: salad, quantity: 1, state: 0 }] },
      { reservationId: 'res-2', status: 0, orderItems: [{ dish: salad, quantity: 1, state: 0 }] },
    ] as unknown as Order[]));

    const owner = create().participants().find((person) => person.type === 'Owner');

    expect(owner?.items).toEqual([]);
    expect(owner?.isSubmitted).toBeFalse();
  });

  it('keeps the page working when the order cannot be loaded', () => {
    preOrders.getPreOrders.and.returnValue(throwError(() => new Error('offline')));

    const page = create();

    expect(page.participants().length).toBe(2);
    expect(page.errorState()).toBe('none');
  });

  it('measures readiness against the booked guests, not only those who have joined', () => {
    preOrders.getPreOrders.and.returnValue(of([
      { reservationId: 'res-1', status: 0, orderItems: [{ dish: salad, quantity: 1, state: 0 }] },
    ] as unknown as Order[]));

    const page = create();
    page.participants.set(page.participants().filter((person) => person.type === 'Owner'));

    expect(page.submittedCount()).toBe(1);
    expect(page.readinessTotal()).toBe(2);
    expect(page.readinessPercent()).toBe(50);
  });
});
