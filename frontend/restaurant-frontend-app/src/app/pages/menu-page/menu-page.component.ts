import { HttpErrorResponse } from '@angular/common/http';
import {Component, OnInit, ChangeDetectionStrategy, inject} from '@angular/core';
import { DishCardComponent } from '@app/shared/custom-components/dish-card/dish-card.component';
import { tableShortLabel } from '@app/shared/helpers/reservation-label';
import { DishesService } from '@app/services/dishes/dishes.service';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { MainCoverImageComponent } from '@app/shared/custom-components/main-cover-image/main-cover-image.component';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { DishSort } from '@app/models/enums/dish-sort.model';
import { DishType } from '@app/models/enums/dish-type.model';
import { DishSortingLabels, DishTypeLabels } from '@app/shared/mappers/dish-enum.mapper';
import { DishModalComponent } from '@app/components/dish-modal/dish-modal.component';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import {ToastService} from '@app/services/toast/toast.service';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';
import { Roles } from '@app/shared/constants/roles';
import { CartUiService } from '@app/services/cart-ui/cart-ui.service';
import { isPreOrderClosed, PRE_ORDER_LEAD_MS } from '@app/shared/helpers/pre-order-cutoff';

export interface PreOrderTableOption {
  reservationId: string;
  label: string;
  start: string;
}

@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [
    RouterModule,
    DishCardComponent,
    MainCoverImageComponent,
    DishModalComponent
  ],
  templateUrl: './menu-page.component.html',
  styleUrl: './menu-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [DishesService],
})
export class MenuPageComponent implements OnInit {
  private toast = inject(ToastService);
  dishes: DishListResponse[] = [];
  filteredDishes: DishListResponse[] = [];

  isPreOrderEnabled = false;
  preOrderReservationId?: string;
  preOrderReservationLabel?: string;
  preOrderTables: PreOrderTableOption[] = [];

  sortOptions = Object.values(DishSort);
  sortLabels = DishSortingLabels;

  menuCategories = Object.values(DishType);
  menuCategoryLabels = DishTypeLabels;

  selectedCategory: DishType | null = null; // initially show all
  selectedSort: DishSort = DishSort.PopularityDescending;

  private readonly dishesService = inject(DishesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private  readonly orderService = inject(PreOrdersService);
  private readonly authService = inject(AuthenticationService);
  private readonly reservationService = inject(ReservationService);
  private readonly cartUi = inject(CartUiService);

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const preOrder = params['preOrder'];
      this.isPreOrderEnabled = !!preOrder;
      if (this.isPreOrderEnabled) {
        this.preOrderReservationId = params['reservationId'];
        this.preOrderReservationLabel = params['reservationLabel'];
        if (!this.preOrderReservationId) {
          console.error('Pre-order is enabled but no reservation ID provided.');
          this.toast.error('Pre-order is enabled but no reservation ID provided.', 'Error');
          this.isPreOrderEnabled = false;
        }
      }

      const category = params['category'] as DishType;
      const sort = params['sort'] as DishSort;

      this.selectedCategory =
        category && Object.values(DishType).includes(category) ? category : null;
      this.selectedSort =
        sort && Object.values(DishSort).includes(sort) ? sort : DishSort.PopularityDescending;

      this.loadDishes();

      if (this.isPreOrderEnabled) {
        this.cartUi.refreshCount();
        this.leaveClosedPreOrderTable(params['reservationStart']);
      }

      if (!this.isPreOrderEnabled && !preOrder) {
        this.enablePreOrderForUpcomingTables();
      }
    });
  }

  /**
   * A signed-in customer who opens the menu directly (not from the cart) can still add dishes:
   * the menu switches to pre-order mode for their nearest upcoming table.
   */
  private enablePreOrderForUpcomingTables(): void {
    const user = this.authService.getUser();
    if (!user || user.role !== Roles.CUSTOMER) {
      return;
    }

    this.reservationService.getReservationsForUser$().subscribe({
      next: (reservations) => {
        this.preOrderTables = this.toPreOrderTables(reservations);
        if (this.preOrderTables.length > 0) {
          this.selectPreOrderTable(this.preOrderTables[0], true);
        }
      },
      error: () => {
        this.preOrderTables = [];
      },
    });
  }

  /**
   * A link may point to a table whose pre-order is already closed (starts in less than 30 minutes
   * or is over). Then the menu explains it and moves to the nearest open table, or leaves pre-order mode.
   */
  private leaveClosedPreOrderTable(knownStart?: string): void {
    const reservationId = this.preOrderReservationId;
    const user = this.authService.getUser();
    if (!reservationId || !user || user.role !== Roles.CUSTOMER) {
      return;
    }
    if (knownStart && !isPreOrderClosed(knownStart)) {
      return;
    }

    this.reservationService.getReservationsForUser$().subscribe({
      next: (reservations) => {
        const current = reservations.find((r) => r.id === reservationId);
        if (!current || !isPreOrderClosed(current.startTime)) {
          return;
        }

        this.toast.info('Pre-order for this table is closed: dishes can be changed only up to 30 minutes before the reservation.');
        this.preOrderTables = this.toPreOrderTables(reservations);
        if (this.preOrderTables.length > 0) {
          this.selectPreOrderTable(this.preOrderTables[0], true);
          return;
        }

        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { preOrder: null, reservationId: null, reservationLabel: null, reservationStart: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      },
      error: () => undefined,
    });
  }

  private toPreOrderTables(reservations: Reservation[]): PreOrderTableOption[] {
    const earliest = Date.now() + PRE_ORDER_LEAD_MS;

    return reservations
      .filter((r) => r.status === ReservationStatus.Reserved && new Date(r.startTime).getTime() >= earliest)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map((r) => ({
        reservationId: r.id,
        start: new Date(r.startTime).toISOString(),
        label: [r.locationAddress, `Table ${r.tableId}`, new Date(r.startTime).toDateString()]
          .filter(Boolean)
          .join(', '),
      }));
  }

  selectPreOrderTable(table: PreOrderTableOption, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        preOrder: 'true',
        reservationId: table.reservationId,
        reservationLabel: table.label,
        reservationStart: table.start,
      },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  onPreOrderTableChanged(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const table = this.preOrderTables.find((t) => t.reservationId === id);
    if (table) {
      this.selectPreOrderTable(table);
    }
  }

  loadDishes(): void {
    const category = this.selectedCategory ?? undefined;
    const sort = this.selectedSort;

    this.dishesService.getDishes(category, sort).subscribe((data) => {
      this.dishes = data.map((dish) => ({
        ...dish,
        imageUrl: dish.imageUrl || 'assets/img/dish.png',
        name: dish.name || 'Unknown Dish',
        price: dish.price || 0,
        weight: dish.weight || 'N/A',
        description: dish.description || 'N/A',
        state: dish.state || 'N/A',
        dishType: dish.dishType || 'N/A',
        calories: dish.calories || '0',
        proteins: dish.proteins || '0',
        fats: dish.fats || '0',
        carbohydrates: dish.carbohydrates || '0',
        vitamins: dish.vitamins || '0',
      }));

      this.filteredDishes = this.dishes;
    });
  }

  bookTableWithDish(dish: DishListResponse): void {
    void this.router.navigate(['/tables'], {
      queryParams: { dishId: dish.id, autoSelect: 'true' },
    });
  }

  onCategorySelected(category: DishType): void {
    this.selectedCategory = this.selectedCategory === category ? null : category;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: this.selectedCategory || null,
        sort: this.selectedSort,
      },
      queryParamsHandling: 'merge',
    });
  }

  onSortChanged(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const sort = selectElement.value as DishSort;
    this.selectedSort = sort;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: this.selectedCategory || null,
        sort: this.selectedSort,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  selectedDish: DishListResponse | null = null;

  openModal(dish: DishListResponse) {
    this.selectedDish = dish;
  }

  closeModal() {
    this.selectedDish = null;
  }

  addDishToCart(dish: DishListResponse): void {
    this.orderService
      .addDishToPreOrderByReservationId(this.preOrderReservationId!, dish, 1)
      .subscribe({
        next: () => {
          const table = tableShortLabel(this.preOrderReservationLabel);
          this.cartUi.refreshCount();
          this.toast.success(
            table ? `Dish added to ${table}` : 'Dish added to cart successfully!',
            'Success',
            { label: 'View cart', handler: () => this.cartUi.requestOpen() }
          );
        },
        error: (err: HttpErrorResponse | Error) => {
          const msg =
            (err as HttpErrorResponse).error?.Message ||
            (err as HttpErrorResponse).error?.message ||
            (err as HttpErrorResponse).error?.error ||
            err.message ||
            'Failed to add dish to pre-order';
          this.toast.error(msg, 'Error');
        },
      });
  }
}
