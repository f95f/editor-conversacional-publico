import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowEdge, FlowNode } from '../../core/models/flow-contracts';

@Component({
  selector: 'app-property-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './property-panel.component.html',
  styleUrl: './property-panel.component.css',
})
export class PropertyPanelComponent {
  @Input() selectedNode: FlowNode | null = null;
  @Input() selectedEdge: FlowEdge | null = null;
  @Input() closable = false;
  @Output() close = new EventEmitter<void>();

  @Output() updateNode = new EventEmitter<{ id: string; changes: Partial<Omit<FlowNode, 'id'>> }>();
  @Output() updateEdge = new EventEmitter<{ id: string; changes: Partial<Omit<FlowEdge, 'id'>> }>();
  @Output() deleteNode = new EventEmitter<string>();
  @Output() deleteEdge = new EventEmitter<string>();

  public isCollapsed: boolean = false;

  public getPanelIcon(): string {
    if (this.selectedNode) return 'chat';
    if (this.selectedEdge) return 'trending_flat';
    return 'edit';
  }

  public getPanelTitle(): string {
    if (this.selectedNode) return 'Ação do Agente';
    if (this.selectedEdge) return 'Intenção do Cliente';
    return '';
  }

  public onNodeChange(changes: Partial<Omit<FlowNode, 'id'>>): void {
    if (this.selectedNode) {
      this.updateNode.emit({ id: this.selectedNode.id, changes });
    }
  }

  public onEdgeChange(changes: Partial<Omit<FlowEdge, 'id'>>): void {
    if (this.selectedEdge) {
      this.updateEdge.emit({ id: this.selectedEdge.id, changes });
    }
  }

  public addExample(): void {
    if (this.selectedEdge) {
      const examples = [...(this.selectedEdge.examples || []), ''];
      this.updateEdge.emit({ id: this.selectedEdge.id, changes: { examples } });
    }
  }

  public updateExample(index: number, val: string): void {
    if (this.selectedEdge && this.selectedEdge.examples) {
      const examples = [...this.selectedEdge.examples];
      examples[index] = val;
      this.updateEdge.emit({ id: this.selectedEdge.id, changes: { examples } });
    }
  }

  public removeExample(index: number): void {
    if (this.selectedEdge && this.selectedEdge.examples) {
      const examples = this.selectedEdge.examples.filter((_, i) => i !== index);
      this.updateEdge.emit({ id: this.selectedEdge.id, changes: { examples } });
    }
  }

  public trackByIndex(index: number): number {
    return index;
  }
}
