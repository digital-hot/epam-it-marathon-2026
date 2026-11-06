import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Params, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { Roles } from '@app/shared/constants/roles';
import { MenuPageComponent } from './menu-page.component';

function reservation(id: string, tableId: string, hoursAhead: number, status = ReservationStatus.Reserved): Reservation {
  const start = new Date(Date.now() + hoursAhead * 3_600_000);
  return {
    id,
    tableId,
    customerId: 'u1',
    startTime: start,
    endTime: new Date(start.getTime() + 2 * 3_600_000),
    guestCount: 2,
    status,
    locationAddress: '48 Rustaveli Ave',
    tableCapacity: 4,
    waiterId: 'w1',
  };
}

describe('MenuPageComponent pre-order for a signed-in customer', () => {
  function setup(role: string | null, reservations: Reservation[], queryParams?: Params) {
    TestBed.configureTestingModule({
      imports: [MenuPageComponent],
      providers: [
        { provide: API_BASE_URL, useValue: 'https://test.api' },
        { provide: AuthenticationService, useValue: { getUser: () => (role ? { id: 'u1', role } : null) } },
        { provide: ReservationService, useValue: { getReservationsForUser$: () => of(reservations) } },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(queryParams ? [{ provide: ActivatedRoute, useValue: { queryParams: of(queryParams) } }] : []),
      ],
    });
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(MenuPageComponent);
    fixture.detectChanges();
    return { fixture, navigate };
  }

  it('switches to the nearest upcoming table and ignores cancelled or too-close ones', () => {
    const { navigate } = setup(Roles.CUSTOMER, [
      reservation('late', 'table-5', 48),
      reservation('soon', 'table-2', 0.2),
      reservation('cancelled', 'table-1', 3, ReservationStatus.Cancelled),
      reservation('next', 'table-3', 5),
    ]);

    const extras = navigate.calls.mostRecent().args[1]!;
    expect(extras.queryParams).toEqual(jasmine.objectContaining({ preOrder: 'true', reservationId: 'next' }));
    expect(extras.replaceUrl).toBeTrue();
  });

  it('does nothing for a guest or when there are no upcoming tables', () => {
    expect(setup(null, [reservation('r', 'table-1', 5)]).navigate).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(setup(Roles.CUSTOMER, []).navigate).not.toHaveBeenCalled();
  });

  it('moves from a closed table in the link to the nearest open one', () => {
    const { navigate } = setup(
      Roles.CUSTOMER,
      [reservation('past', 'table-1', -48), reservation('next', 'table-3', 5)],
      { preOrder: 'true', reservationId: 'past', reservationLabel: 'Table 1' },
    );

    const extras = navigate.calls.mostRecent().args[1]!;
    expect(extras.queryParams).toEqual(jasmine.objectContaining({ preOrder: 'true', reservationId: 'next' }));
  });

  it('leaves pre-order mode when the linked table is closed and no other table is open', () => {
    const { navigate } = setup(
      Roles.CUSTOMER,
      [reservation('past', 'table-1', -48)],
      { preOrder: 'true', reservationId: 'past' },
    );

    const extras = navigate.calls.mostRecent().args[1]!;
    expect(extras.queryParams).toEqual(jasmine.objectContaining({ preOrder: null, reservationId: null }));
  });

  it('keeps an open table from the link', () => {
    const { navigate } = setup(
      Roles.CUSTOMER,
      [reservation('next', 'table-3', 5)],
      { preOrder: 'true', reservationId: 'next' },
    );

    expect(navigate).not.toHaveBeenCalled();
  });
});
