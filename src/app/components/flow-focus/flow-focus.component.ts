import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlowDocument, FlowEdge, FlowNode } from '../../core/models/flow-contracts';

type SearchResult =
  | { kind: 'node'; node: FlowNode; matchedIn: string; snippet: string }
  | { kind: 'edge'; edge: FlowEdge; source: FlowNode; target: FlowNode; matchedIn: string; snippet: string };

@Component({
  selector: 'app-flow-focus',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flow-focus.component.html',
  styleUrl: './flow-focus.component.css',
})
export class FlowFocusComponent {
  @ViewChild('titleEditor') titleEditor?: ElementRef<HTMLInputElement>;
  @ViewChild('focusMain') focusMain?: ElementRef<HTMLElement>;
  private currentDocument!: FlowDocument;
  private nodesById = new Map<string, FlowNode>();
  private outgoingById = new Map<string, FlowEdge[]>();
  private incomingById = new Map<string, FlowEdge[]>();
  private cachedQuery = '';
  private cachedResults: SearchResult[] = [];

  @Input({ required: true }) set document(value: FlowDocument) {
    this.currentDocument = value;
    this.nodesById = new Map(value.content.nodes.map((node) => [node.id, node]));
    this.outgoingById = new Map();
    this.incomingById = new Map();
    for (const edge of value.content.edges) {
      const outgoing = this.outgoingById.get(edge.source) || [];
      outgoing.push(edge);
      this.outgoingById.set(edge.source, outgoing);
      const incoming = this.incomingById.get(edge.target) || [];
      incoming.push(edge);
      this.incomingById.set(edge.target, incoming);
    }
    this.cachedQuery = '';
    this.cachedResults = [];
  }
  get document(): FlowDocument { return this.currentDocument; }
  private currentNodeId: string | null = null;
  @Input() set activeNodeId(value: string | null) {
    if (value !== this.currentNodeId) {
      this.currentNodeId = value;
      this.showAddResponse = false;
      this.targetEditorEdgeId = null;
      this.editingMappedNodeId = null;
      setTimeout(() => { if (this.focusMain) this.focusMain.nativeElement.scrollTop = 0; });
    }
  }
  get activeNodeId(): string | null { return this.currentNodeId; }
  @Input() selectedEdgeIds: string[] = [];
  @Input() canGoBack = false;
  @Input() history: string[] = [];
  @Input() query = '';
  @Input() responseFilter = '';

  @Output() queryChange = new EventEmitter<string>();
  @Output() responseFilterChange = new EventEmitter<string>();
  @Output() navigate = new EventEmitter<string>();
  @Output() goBack = new EventEmitter<void>();
  @Output() goHome = new EventEmitter<void>();
  @Output() selectNode = new EventEmitter<string>();
  @Output() selectEdge = new EventEmitter<string>();
  @Output() toggleEdge = new EventEmitter<string>();
  @Output() clearSelection = new EventEmitter<void>();
  @Output() updateNode = new EventEmitter<{ id: string; changes: Partial<Omit<FlowNode, 'id'>> }>();
  @Output() updateEdge = new EventEmitter<{ id: string; changes: Partial<Omit<FlowEdge, 'id'>> }>();
  @Output() addEdge = new EventEmitter<{ source: string; target: string; baseMessage: string }>();

  isEditing = false;
  showAddResponse = false;
  draftMessage = '';
  draftTargetId: string | null = null;
  draftTargetQuery = '';
  targetEditorEdgeId: string | null = null;
  editingMappedNodeId: string | null = null;
  targetQuery = '';
  dragTargetEdgeId: string | null = null;
  draftDragOver = false;
  visibleIndexCount = 100;
  visibleResultCount = 50;

  get activeNode(): FlowNode | null { return this.activeNodeId ? this.nodesById.get(this.activeNodeId) || null : null; }
  get outgoingCount(): number { return this.outgoingById.get(this.activeNodeId || '')?.length || 0; }
  get outgoing(): FlowEdge[] {
    const edges = this.outgoingById.get(this.activeNodeId || '') || [];
    const filter = this.normalize(this.responseFilter);
    return filter ? edges.filter((edge) => this.normalize([edge.baseMessage, edge.description, edge.examples?.join(' '), this.nodeTitle(edge.target)].join(' ')).includes(filter)) : edges;
  }
  get incoming(): FlowEdge[] { return this.incomingById.get(this.activeNodeId || '') || []; }
  get recentPath(): string[] { return [...this.history.slice(-3), ...(this.activeNodeId ? [this.activeNodeId] : [])]; }
  get indexNodes(): FlowNode[] {
    const shown = this.document.content.nodes.slice(0, this.visibleIndexCount);
    const active = this.activeNode;
    return active && !shown.some((node) => node.id === active.id) ? [active, ...shown] : shown;
  }
  get searchResults(): SearchResult[] {
    const query = this.normalize(this.query);
    if (!query) return [];
    if (query === this.cachedQuery) return this.cachedResults;
    this.cachedQuery = query;
    const results: SearchResult[] = [];
    for (const node of this.document.content.nodes) {
      const fields = [['Título', node.title], ['Mensagem', node.message || ''], ['ID', node.id]];
      const match = fields.find(([, value]) => this.normalize(value).includes(query));
      if (match) results.push({ kind: 'node', node, matchedIn: match[0], snippet: match[1] });
    }
    for (const edge of this.document.content.edges) {
      const fields = [['Resposta', edge.baseMessage], ['Descrição', edge.description || ''], ['Exemplos', edge.examples?.join(' ') || '']];
      const match = fields.find(([, value]) => this.normalize(value).includes(query));
      if (!match) continue;
      const source = this.nodesById.get(edge.source);
      const target = this.nodesById.get(edge.target);
      if (source && target) results.push({ kind: 'edge', edge, source, target, matchedIn: match[0], snippet: match[1] });
    }
    this.cachedResults = results;
    return results;
  }
  get shownResults(): SearchResult[] { return this.searchResults.slice(0, this.visibleResultCount); }
  get draftOptions(): FlowNode[] { return this.findNodes(this.draftTargetQuery); }
  get targetOptions(): FlowNode[] { return this.findNodes(this.targetQuery); }

  nodeTitle(id: string): string { return this.nodesById.get(id)?.title || id; }
  nodePreview(node: FlowNode): string { return node.message?.trim() || 'Sem mensagem do agente.'; }
  trackNode(_index: number, node: FlowNode): string { return node.id; }
  trackEdge(_index: number, edge: FlowEdge): string { return edge.id; }
  trackResult(_index: number, result: SearchResult): string { return result.kind === 'node' ? `node:${result.node.id}` : `edge:${result.edge.id}`; }
  trackPart(index: number): number { return index; }

  onResponseClick(event: MouseEvent, edgeId: string): void {
    if (event.ctrlKey || event.metaKey) this.toggleEdge.emit(edgeId);
    else this.selectEdge.emit(edgeId);
  }

  onWorkspaceClick(event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) return;
    if ((event.target as Element).closest('button, input, textarea, select, a')) return;
    this.clearSelection.emit();
  }

  selectSearchResult(result: SearchResult): void {
    if (result.kind === 'node') this.navigate.emit(result.node.id);
    else { this.navigate.emit(result.source.id); this.selectEdge.emit(result.edge.id); }
    this.queryChange.emit('');
    this.visibleResultCount = 50;
  }

  toggleEdit(): void {
    this.isEditing = !this.isEditing;
    if (this.isEditing && this.activeNodeId) {
      this.selectNode.emit(this.activeNodeId);
      setTimeout(() => this.titleEditor?.nativeElement.focus());
    } else {
      this.showAddResponse = false;
      this.targetEditorEdgeId = null;
      this.editingMappedNodeId = null;
    }
  }

  changeNode(changes: Partial<Omit<FlowNode, 'id'>>): void {
    if (this.activeNodeId) this.updateNode.emit({ id: this.activeNodeId, changes });
  }
  changeMappedNode(id: string, changes: Partial<Omit<FlowNode, 'id'>>): void { this.updateNode.emit({ id, changes }); }
  editMappedNode(id: string): void { this.editingMappedNodeId = this.editingMappedNodeId === id ? null : id; this.selectNode.emit(id); }
  mappedNode(id: string): FlowNode | null { return this.nodesById.get(id) || null; }
  changeEdge(id: string, changes: Partial<Omit<FlowEdge, 'id'>>): void { this.updateEdge.emit({ id, changes }); }

  beginAddResponse(): void {
    this.showAddResponse = true;
    this.draftMessage = '';
    this.draftTargetId = null;
    this.draftTargetQuery = '';
  }
  chooseDraftTarget(node: FlowNode): void { this.draftTargetId = node.id; this.draftTargetQuery = node.title; }
  onDraftQuery(value: string): void { this.draftTargetQuery = value; this.draftTargetId = null; }
  createResponse(): void {
    if (!this.activeNodeId || !this.draftTargetId || !this.draftMessage.trim()) return;
    this.addEdge.emit({ source: this.activeNodeId, target: this.draftTargetId, baseMessage: this.draftMessage.trim() });
    this.showAddResponse = false;
  }

  beginTargetEdit(edge: FlowEdge): void {
    this.targetEditorEdgeId = edge.id;
    this.targetQuery = this.nodeTitle(edge.target);
    this.selectEdge.emit(edge.id);
  }
  chooseTarget(edgeId: string, node: FlowNode): void {
    this.changeEdge(edgeId, { target: node.id });
    this.targetEditorEdgeId = null;
  }

  dragNode(event: DragEvent, node: FlowNode): void {
    event.dataTransfer?.setData('application/x-flow-node-id', node.id);
    event.dataTransfer?.setData('text/plain', node.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
  allowDrop(event: DragEvent, edgeId: string | null): void {
    event.preventDefault();
    this.dragTargetEdgeId = edgeId;
    this.draftDragOver = edgeId === null;
  }
  leaveDrop(): void { this.dragTargetEdgeId = null; this.draftDragOver = false; }
  dropNode(event: DragEvent, edgeId: string | null): void {
    event.preventDefault();
    const id = event.dataTransfer?.getData('application/x-flow-node-id') || event.dataTransfer?.getData('text/plain');
    const node = id ? this.nodesById.get(id) : null;
    if (node) {
      if (edgeId) this.changeEdge(edgeId, { target: node.id });
      else this.chooseDraftTarget(node);
    }
    this.leaveDrop();
  }

  highlightParts(value: string): { text: string; match: boolean }[] {
    const query = this.normalize(this.query);
    const index = this.normalize(value).indexOf(query);
    if (!query || index < 0) return [{ text: value, match: false }];
    return [
      { text: value.slice(0, index), match: false },
      { text: value.slice(index, index + query.length), match: true },
      { text: value.slice(index + query.length), match: false },
    ];
  }

  private findNodes(value: string): FlowNode[] {
    const query = this.normalize(value);
    return this.document.content.nodes.filter((node) => !query || this.normalize(`${node.title} ${node.id}`).includes(query)).slice(0, 30);
  }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim(); }
}
