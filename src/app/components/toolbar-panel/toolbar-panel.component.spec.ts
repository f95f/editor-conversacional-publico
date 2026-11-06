import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToolbarPanelComponent } from './toolbar-panel.component';

describe('ToolbarPanelComponent', () => {
  let component: ToolbarPanelComponent;
  let fixture: ComponentFixture<ToolbarPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolbarPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('deve criar o componente', () => {
    expect(component).toBeTruthy();
  });

  it('deve emitir o evento addNode ao clicar no botão de bloco', () => {
    const emitSpy = vi.spyOn(component.addNode, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.action-btn.primary')?.click();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('alterna o modo pela seção vertical', () => {
    const emitSpy = vi.spyOn(component.viewModeChange, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.action-btn')?.click();
    expect(emitSpy).toHaveBeenCalledWith('path');
  });

  it('offers a center command in path mode', () => {
    fixture.componentRef.setInput('viewMode', 'path');
    fixture.detectChanges();
    const emit = vi.spyOn(component.centerPath, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Centralizar percurso"]')?.click();
    expect(emit).toHaveBeenCalledOnce();
  });
});
