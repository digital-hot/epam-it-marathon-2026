import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter, Router } from '@angular/router';
import { UserModel } from '@app/auth/models/user.model';
import { Roles } from '@app/shared/constants/roles';

import { HeaderComponent } from './header.component';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { NotificationsService } from '@app/services/notifications/notifications.service';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  let authMock: jasmine.SpyObj<AuthenticationService>;
  let notificationsMock: jasmine.SpyObj<NotificationsService>;

  beforeEach(async () => {
    authMock = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['signOut'],
    {
      user$: of(null),
      isAuthorised$: of(false),
    },
  );
  
  notificationsMock = jasmine.createSpyObj<NotificationsService>(
    'NotificationsService',
    ['loadNotifications', 'markAsRead'],
  );

  notificationsMock.loadNotifications.and.returnValue(of([]));
  notificationsMock.markAsRead.and.returnValue(of(void 0));

  await TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: 'https://test.api' },
      { provide: AuthenticationService, useValue: authMock },
      { provide: NotificationsService, useValue: notificationsMock },
      provideRouter([{ path: 'menu', children: [] }]),
    ],
    imports: [HeaderComponent],
  }).compileComponents();

  fixture = TestBed.createComponent(HeaderComponent);
  component = fixture.componentInstance;
  fixture.detectChanges();
});

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('table chip', () => {
    const menuUrl =
      '/menu?preOrder=true&reservationId=r1&reservationLabel=' +
      encodeURIComponent('48 Rustaveli Ave, Table table-4, Sat Nov 01 2026');

    it('names the table a customer is adding dishes to', async () => {
      component.user.set({ role: Roles.CUSTOMER } as UserModel);
      await TestBed.inject(Router).navigateByUrl(menuUrl);
      fixture.detectChanges();

      expect(component.preOrderTable()?.short).toBe('Table 4');
      expect(fixture.nativeElement.querySelector('.actions .pre-order-chip')?.textContent).toContain(
        'Adding to Table 4'
      );
    });

    it('shows the start time of the reservation when it is known', async () => {
      component.user.set({ role: Roles.CUSTOMER } as UserModel);
      const start = new Date(2026, 10, 4, 17, 0);
      await TestBed.inject(Router).navigateByUrl(`${menuUrl}&reservationStart=${encodeURIComponent(start.toISOString())}`);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.actions .pre-order-chip')?.textContent).toContain(
        'Table 4 · Nov 4, 17:00'
      );
    });

    it('is hidden outside the pre-order menu', async () => {
      component.user.set({ role: Roles.CUSTOMER } as UserModel);
      await TestBed.inject(Router).navigateByUrl('/menu');
      fixture.detectChanges();

      expect(component.preOrderTable()).toBeNull();
      expect(fixture.nativeElement.querySelector('.pre-order-chip')).toBeNull();
    });

    it('is hidden for users who are not customers', async () => {
      component.user.set(null);
      await TestBed.inject(Router).navigateByUrl(menuUrl);
      fixture.detectChanges();

      expect(component.preOrderTable()).toBeNull();
    });
  });
});
