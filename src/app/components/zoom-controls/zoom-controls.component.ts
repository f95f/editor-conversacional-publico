import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-zoom-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './zoom-controls.component.html',
  styleUrl: './zoom-controls.component.css',
})
export class ZoomControlsComponent {
  @Input() zoom: number = 1.0;
  @Input() isDarkTheme: boolean = true;

  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() zoomReset = new EventEmitter<void>();
  @Output() fitView = new EventEmitter<void>();
  @Output() toggleTheme = new EventEmitter<void>();
}
