import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocationCardComponent } from './location-card.component';
import { LocationResponse } from '@app/models/locations/location-response.model';

describe('LocationCardComponent', () => {
  let component: LocationCardComponent;
  let fixture: ComponentFixture<LocationCardComponent>;

  const location: LocationResponse = {
    id: 'location-1',
    address: '14 Baratashvili Street',
    description: 'Test restaurant',
    totalCapacity: 50,
    averageOccupancy: '75%',
    imageUrl: 'assets/img/location.jpg',
    rating: 4.5,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationCardComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('location', location);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('puts Book (automatic table search) first and View (location page) second, like the hero', () => {
    const links: HTMLAnchorElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.card-actions a')
    );

    expect(links.map((link) => link.textContent?.trim())).toEqual(['Book', 'View']);
    expect(links[0].getAttribute('href')).toBe('/tables?locationId=location-1&autoSelect=true');
    expect(links[1].getAttribute('href')).toBe('/locations/location-1');
  });
});
