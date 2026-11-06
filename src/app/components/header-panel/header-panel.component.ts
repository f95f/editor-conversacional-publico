import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-header-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './header-panel.component.html',
  styleUrl: './header-panel.component.css',
})
export class HeaderPanelComponent {
  @Input() title: string = '';
  @Input() hasUnexportedChanges: boolean = false;
  @Input() draftRecovered: boolean = false;
  @Input() isOpeningDocument: boolean = false;

  @Output() titleChange = new EventEmitter<string>();
  @Output() newDocument = new EventEmitter<void>();
  @Output() openDocument = new EventEmitter<void>();
  @Output() loadExample = new EventEmitter<void>();
  @Output() exportDocument = new EventEmitter<void>();

  public onTitleChange(newTitle: string): void {
    this.titleChange.emit(newTitle);
  }
}
