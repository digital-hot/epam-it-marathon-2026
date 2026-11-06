import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DishCardComponent } from './dish-card.component';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { DishState } from '@app/models/enums/dish-state.model';

describe('DishCardComponent', () => {
  let component: DishCardComponent;
  let fixture: ComponentFixture<DishCardComponent>;

  const dish: DishListResponse = {
    id: 'dish-1',
    name: 'Khachapuri',
    imageUrl: 'assets/img/dish.png',
    price: 15,
    state: DishState.Available,
    weight: '350',
    dishType: 'MainCourse',
    description: 'Georgian cheese bread',
    calories: '500',
    proteins: '20',
    carbohydrates: '45',
    fats: '25',
    vitamins: 'A, B',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DishCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DishCardComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('dish', dish);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits bookClicked without opening the dish details', () => {
    fixture.componentRef.setInput('bookEnabled', true);
    fixture.detectChanges();
    spyOn(component.bookClicked, 'emit');
    spyOn(component.dishClicked, 'emit');

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('app-custom-button button');
    button.click();

    expect(component.bookClicked.emit).toHaveBeenCalled();
    expect(component.dishClicked.emit).not.toHaveBeenCalled();
  });

  it('does not show the booking button unless it is enabled', () => {
    expect(fixture.nativeElement.querySelector('app-custom-button')).toBeNull();
  });
});
