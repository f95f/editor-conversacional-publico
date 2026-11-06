import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ZoomControlsComponent } from './zoom-controls.component';

describe('ZoomControlsComponent', () => {
  let component: ZoomControlsComponent;
  let fixture: ComponentFixture<ZoomControlsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoomControlsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ZoomControlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('deve criar o componente', () => {
    expect(component).toBeTruthy();
  });

  it('deve emitir evento zoomIn ao clicar no botão de mais', () => {
    const emitSpy = vi.spyOn(component.zoomIn, 'emit');
    component.zoomIn.emit();
    expect(emitSpy).toHaveBeenCalled();
  });
});
