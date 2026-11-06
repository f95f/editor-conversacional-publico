import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PropertyPanelComponent } from './property-panel.component';

describe('PropertyPanelComponent', () => {
  let component: PropertyPanelComponent;
  let fixture: ComponentFixture<PropertyPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PropertyPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('deve criar o componente', () => {
    expect(component).toBeTruthy();
  });

  it('deve alternar estado de recolhido', () => {
    expect(component.isCollapsed).toBe(false);
    component.isCollapsed = true;
    expect(component.isCollapsed).toBe(true);
  });

  it('edita a intenção e fecha o inspetor sem mostrar destinos', () => {
    fixture.componentRef.setInput('selectedEdge', { id: 'e1', source: 'n1', target: 'n2', baseMessage: 'Sim' });
    fixture.componentRef.setInput('closable', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.destination-options')).toBeNull();
    const remove = vi.spyOn(component.deleteEdge, 'emit');
    const close = vi.spyOn(component.close, 'emit');
    root.querySelector<HTMLButtonElement>('.delete-edge')?.click();
    expect(remove).toHaveBeenCalledWith('e1');
    root.querySelector<HTMLButtonElement>('.toggle-btn')?.click();
    expect(close).toHaveBeenCalled();
  });

  it('emite exclusão do bloco no painel de ação do agente', () => {
    fixture.componentRef.setInput('selectedNode', { id: 'n1', title: 'Confirma nome', message: 'Olá' });
    fixture.detectChanges();
    const remove = vi.spyOn(component.deleteNode, 'emit');
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.delete-node')?.click();

    expect(remove).toHaveBeenCalledWith('n1');
  });
});
