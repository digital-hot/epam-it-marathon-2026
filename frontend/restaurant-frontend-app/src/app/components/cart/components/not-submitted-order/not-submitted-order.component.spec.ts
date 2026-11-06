import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import { Order } from '@app/models/orders/order.model';

import { NotSubmittedOrderComponent } from './not-submitted-order.component';

describe('NotSubmittedOrderComponent', () => {
  let component: NotSubmittedOrderComponent;
  let fixture: ComponentFixture<NotSubmittedOrderComponent>;

  const order = {
    orderId: 'order-1',
    status: 0,
    reservationId: 'res-1',
    reservationAddress: 'Test address',
    reservationTime: '2026-09-07T12:15:00Z',
    orderItems: [
      {
        quantity: 2,
        dish: {
          id: 'dish-1',
          price: 10,
        },
      },
    ],
  } as Order;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotSubmittedOrderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(
      NotSubmittedOrderComponent,
    );

    component = fixture.componentInstance;

    fixture.componentRef.setInput('order', order);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit submitted with the order ID', () => {
    spyOn(component.submitted, 'emit');

    component.submit();

    expect(
      component.submitted.emit,
    ).toHaveBeenCalledWith('order-1');
  });

  it('locks dish edits and submit when the reservation starts in less than 30 minutes', () => {
    fixture.componentRef.setInput('order', { ...order, startTime: new Date(Date.now() + 10 * 60_000).toISOString() });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('.order-item button, .submit-btn'));

    expect(element.textContent).toContain('Pre-order is closed');
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBeTrue();
  });

  it('should calculate the total price', () => {
    expect(component.totalPrice()).toBe(20);
  });

  it('should emit openGroup with the reservation ID when openGroupOrder is called', () => {
    spyOn(component.openGroup, 'emit');

    component.openGroupOrder('res-1');

    expect(component.openGroup.emit).toHaveBeenCalledWith('res-1');
  });

  it('should render owner dishes, guests and totals for a group order', () => {
    fixture.componentRef.setInput('order', {
      ...order,
      isGroupOrder: true,
      groupState: {
        totalGuests: 4,
        orderedGuests: 2,
        submittedGuests: 1,
        groupTotal: 50,
        submittedTotal: 30,
        guests: [{ id: 'g1', name: 'Olena', isSubmitted: true, total: 30 }],
      },
    });
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.quantity-buttons')).not.toBeNull();
    expect(element.querySelector('.readiness-count')?.textContent).toContain('2 of 4 guests ordered');
    expect(element.querySelector('.guest-row')?.textContent).toContain('Olena');
    expect(component.readinessPercent()).toBe(50);
    expect(component.tableGrandTotal()).toBe(50); // 20 (my dishes) + 30 (group ready)
  });

  describe('table without dishes', () => {
    const emptyOrder = {
      ...order,
      orderItems: [],
      tableName: 'Table 4',
      reservationTime: 'Table 4 • Nov 1, 2026, 7:00 PM - 9:00 PM',
    };

    it('shows the table header and an add button but no totals or submit button', () => {
      fixture.componentRef.setInput('order', emptyOrder);
      fixture.detectChanges();

      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.not-submitted-order--empty')).not.toBeNull();
      expect(element.querySelector('.table-name')?.textContent).toContain('Table 4');
      expect(element.querySelector('.table-header')?.textContent).toContain('Nov 1, 2026, 7:00 PM');
      expect(element.querySelector('.table-header')?.textContent).not.toContain('Table 4 •');
      expect(element.querySelector('.submit-btn')).toBeNull();
      expect(element.querySelector('.order-footer')).toBeNull();
    });

    it('disables adding dishes when the reservation starts in less than 30 minutes', () => {
      fixture.componentRef.setInput('order', {
        ...emptyOrder,
        startTime: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      fixture.detectChanges();

      const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.empty-table button');
      expect(component.preOrderClosed()).toBeTrue();
      expect(addButton.disabled).toBeTrue();
    });

    it('keeps adding dishes enabled for a later reservation', () => {
      fixture.componentRef.setInput('order', {
        ...emptyOrder,
        startTime: new Date(Date.now() + 3 * 3600_000).toISOString(),
      });
      fixture.detectChanges();

      const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.empty-table button');
      expect(addButton.disabled).toBeFalse();
    });
  });
});
