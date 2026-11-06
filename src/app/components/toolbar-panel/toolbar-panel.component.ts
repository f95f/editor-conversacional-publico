import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toolbar-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbar-panel.component.html',
  styleUrl: './toolbar-panel.component.css',
})
export class ToolbarPanelComponent {
  @Input() viewMode: 'path' | 'focus' | 'map' = 'map';
  @Input() canUndo: boolean = false;
  @Input() canRedo: boolean = false;

  @Output() addNode = new EventEmitter<void>();
  @Output() togglePathList = new EventEmitter<void>();
  @Output() centerPath = new EventEmitter<void>();
  @Output() viewModeChange = new EventEmitter<'path' | 'focus' | 'map'>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
}
