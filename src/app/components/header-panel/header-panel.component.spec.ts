import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HeaderPanelComponent } from './header-panel.component';

describe('HeaderPanelComponent', () => {
  let component: HeaderPanelComponent;
  let fixture: ComponentFixture<HeaderPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('deve criar o componente', () => {
    expect(component).toBeTruthy();
  });

  it('deve emitir alteração no título', () => {
    const emitSpy = vi.spyOn(component.titleChange, 'emit');
    component.onTitleChange('Novo Título');
    expect(emitSpy).toHaveBeenCalledWith('Novo Título');
  });
});
