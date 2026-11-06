import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlowDocument, FlowEdge, FlowNode } from '../../core/models/flow-contracts';

export interface PathStep {
  key: number;
  nodeId: string;
  viaEdgeId: string | null;
}

interface PathCardTransition {
  fromNodeId: string;
  toNodeId: string;
  direction: 'forward' | 'back';
  fromRect: DOMRect;
  selectedRect: DOMRect;
  fromPanX: number;
  fromPanY: number;
  stageGhost: HTMLElement;
  fromGhost: HTMLElement;
  selectedGhost: HTMLElement;
  cleanupTimer: number;
}

@Component({
  selector: 'app-flow-path',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flow-path.component.html',
  styleUrl: './flow-path.component.css',
})
export class FlowPathComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  @ViewChild('workspace') workspace?: ElementRef<HTMLElement>;
  @ViewChild('stage') stage?: ElementRef<HTMLElement>;
  @ViewChild('timeline') timeline?: ElementRef<HTMLElement>;
  @Input({ required: true }) document!: FlowDocument;
  @Input() steps: PathStep[] = [];
  @Input() inspectorOpen = false;
  @Input() selectedNodeIds: string[] = [];
  @Input() selectedEdgeIds: string[] = [];
  @Input() navigationTick = 0;
  @Input() navigationDirection: 'forward' | 'back' | 'reset' = 'reset';
  @Input() resetEpoch = 0;

  @Output() followEdge = new EventEmitter<string>();
  @Output() jumpToStep = new EventEmitter<number>();
  @Output() jumpToNode = new EventEmitter<string>();
  @Output() jumpToEdge = new EventEmitter<string>();
  @Output() editNode = new EventEmitter<string>();
  @Output() editEdge = new EventEmitter<string>();
  @Output() connectNode = new EventEmitter<string>();
  @Output() addResponseNode = new EventEmitter<void>();
  @Output() updateEdge = new EventEmitter<{ id: string; changes: Partial<Omit<FlowEdge, 'id'>> }>();
  @Output() selectionChange = new EventEmitter<{ nodeIds: string[]; edgeIds: string[] }>();

  private nodesById = new Map<string, FlowNode>();
  private outgoingById = new Map<string, FlowEdge[]>();
  private incomingById = new Map<string, FlowNode[]>();
  private connectionFrameId: number | null = null;
  private visualFrameId: number | null = null;
  private lastAnimatedTick = 0;
  private pendingTransition: PathCardTransition | null = null;
  private activeAnimations: Animation[] = [];
  private gridAnimation: Animation | null = null;
  private dragPointerId: number | null = null;
  private selectionPointerId: number | null = null;
  private selectionStartX = 0;
  private selectionStartY = 0;
  private selectionBaseCards: string[] = [];
  private selectionBaseLines: string[] = [];
  private selectedCardKeys = new Set<string>();
  private selectedLineIds = new Set<string>();
  private ignoreNextCanvasClick = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panPointerStartX = 0;
  private panPointerStartY = 0;
  private resizeObserver: ResizeObserver | null = null;
  private observedElements: Element[] = [];
  incomingConnectionPaths: string[] = [];
  outgoingConnectionPaths: { id: string; path: string; selectFromX?: number; selectToX?: number; selectY?: number }[] = [];
  hoveredEdgeId: string | null = null;
  dragX = 0;
  dragY = 0;
  isDragging = false;
  selectionRect: { left: number; top: number; width: number; height: number } | null = null;
  listOpen = false;
  visibleIndexCount = 100;
  swapEdgeId: string | null = null;
  swapQuery = '';
  swapVisibleCount = 100;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['document']) {
      if (this.swapEdgeId && !this.document.content.edges.some((edge) => edge.id === this.swapEdgeId)) this.swapEdgeId = null;
      this.nodesById = new Map(this.document.content.nodes.map((node) => [node.id, node]));
      this.outgoingById = new Map();
      this.incomingById = new Map();
      for (const edge of this.document.content.edges) {
        const outgoing = this.outgoingById.get(edge.source) || [];
        outgoing.push(edge);
        this.outgoingById.set(edge.source, outgoing);
        const source = this.nodesById.get(edge.source);
        const incoming = this.incomingById.get(edge.target) || [];
        if (source && !incoming.some((node) => node.id === source.id)) incoming.push(source);
        this.incomingById.set(edge.target, incoming);
      }
    }
    if (changes['resetEpoch'] && !changes['resetEpoch'].firstChange) {
      this.listOpen = false;
      this.swapEdgeId = null;
      this.centerView();
    }
    if (changes['steps']) {
      const previous = changes['steps'].previousValue as PathStep[] | undefined;
      if (previous?.at(-1)?.key !== this.steps.at(-1)?.key) {
        this.swapEdgeId = null;
        this.selectedCardKeys.clear();
        this.selectedLineIds.clear();
      }
    }
    if ((changes['selectedNodeIds'] || changes['selectedEdgeIds']) && !this.selectedNodeIds.length && !this.selectedEdgeIds.length) {
      this.selectedCardKeys.clear();
      this.selectedLineIds.clear();
    }
    if (changes['navigationTick'] && !changes['navigationTick'].firstChange && !this.pendingTransition) this.centerView();
    if (changes['document'] || changes['steps'] || changes['navigationTick'] || changes['inspectorOpen']) this.scheduleVisualUpdate();
  }

  ngAfterViewInit(): void { this.scheduleVisualUpdate(); }
  ngOnDestroy(): void {
    if (this.connectionFrameId !== null) cancelAnimationFrame(this.connectionFrameId);
    if (this.visualFrameId !== null) cancelAnimationFrame(this.visualFrameId);
    this.resizeObserver?.disconnect();
    this.clearTransition();
  }

  get currentStep(): PathStep | null { return this.steps.at(-1) || null; }
  get currentNode(): FlowNode | null { return this.currentStep ? this.nodesById.get(this.currentStep.nodeId) || null : null; }
  get incomingNodes(): FlowNode[] { return this.incomingById.get(this.currentStep?.nodeId || '') || []; }
  get outgoingCount(): number { return this.outgoingById.get(this.currentStep?.nodeId || '')?.length || 0; }
  get outgoing(): FlowEdge[] {
    return this.outgoingById.get(this.currentStep?.nodeId || '') || [];
  }
  get indexNodes(): FlowNode[] { return this.document.content.nodes.slice(0, this.visibleIndexCount); }
  get swapOptions(): FlowNode[] {
    const query = this.normalize(this.swapQuery);
    return this.document.content.nodes.filter((node) => !query || this.normalize(`${node.title} ${node.id}`).includes(query)).slice(0, this.swapVisibleCount);
  }
  nodeTitle(id: string): string { return this.nodesById.get(id)?.title || id; }
  nodePreview(node: FlowNode): string { return node.message?.trim() || 'Sem mensagem do agente.'; }
  isRepeated(id: string): boolean { return this.steps.some((step) => step.nodeId === id); }
  isRepeatedStep(index: number): boolean { return this.steps.slice(0, index).some((step) => step.nodeId === this.steps[index].nodeId); }
  trackStep(_index: number, step: PathStep): number { return step.key; }
  trackEdge(_index: number, edge: FlowEdge): string { return edge.id; }
  trackNode(_index: number, node: FlowNode): string { return node.id; }

  goToNode(id: string): void { this.listOpen = false; this.jumpToNode.emit(id); }
  followNext(edge: FlowEdge, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) { this.toggleCard(`next:${edge.id}`); return; }
    this.captureTransition(edge.target, 'forward', event.currentTarget as HTMLElement);
    this.followEdge.emit(edge.id);
  }
  openIncoming(node: FlowNode, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) { this.toggleCard(`previous:${node.id}`); return; }
    this.captureTransition(node.id, 'back', event.currentTarget as HTMLElement);
    this.jumpToNode.emit(node.id);
  }
  toggleList(): void { this.listOpen = !this.listOpen; }
  centerView(): void {
    this.dragX = 0;
    this.dragY = 0;
    this.changeDetector.markForCheck();
  }
  connectListedNode(id: string): void { this.listOpen = false; this.connectNode.emit(id); }
  isStart(id: string): boolean { return id === this.document.document.startNodeId; }
  isEnd(id: string): boolean { return !this.outgoingById.get(id)?.length; }
  onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as Element).closest('button, input, textarea, article, nav, aside, .create-panel, .path-connection-selectable')) return;
    if (event.ctrlKey || event.metaKey) {
      this.selectionPointerId = event.pointerId;
      this.selectionStartX = event.clientX;
      this.selectionStartY = event.clientY;
      this.selectionBaseCards = [...this.selectedCardKeys];
      this.selectionBaseLines = [...this.selectedLineIds];
      this.selectionRect = null;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    this.gridAnimation?.cancel();
    this.gridAnimation = null;
    this.dragPointerId = event.pointerId;
    this.panPointerStartX = event.clientX;
    this.panPointerStartY = event.clientY;
    this.dragStartX = event.clientX - this.dragX;
    this.dragStartY = event.clientY - this.dragY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  onCanvasPointerMove(event: PointerEvent): void {
    if (event.pointerId === this.selectionPointerId) {
      const left = Math.min(this.selectionStartX, event.clientX);
      const top = Math.min(this.selectionStartY, event.clientY);
      const width = Math.abs(event.clientX - this.selectionStartX);
      const height = Math.abs(event.clientY - this.selectionStartY);
      if (width > 3 || height > 3) {
        const workspace = this.workspace?.nativeElement.getBoundingClientRect();
        if (workspace) this.selectionRect = { left: left - workspace.left, top: top - workspace.top, width, height };
        this.selectInsideRect({ left, top, right: left + width, bottom: top + height });
      }
      return;
    }
    if (event.pointerId !== this.dragPointerId) return;
    this.dragX = event.clientX - this.dragStartX;
    this.dragY = event.clientY - this.dragStartY;
    this.isDragging = true;
    if (Math.abs(event.clientX - this.panPointerStartX) > 3 || Math.abs(event.clientY - this.panPointerStartY) > 3) this.ignoreNextCanvasClick = true;
  }
  onCanvasPointerUp(event: PointerEvent): void {
    if (event.pointerId === this.selectionPointerId) {
      this.selectionPointerId = null;
      this.selectionRect = null;
      const workspace = this.workspace?.nativeElement;
      if (workspace?.hasPointerCapture?.(event.pointerId)) workspace.releasePointerCapture(event.pointerId);
      return;
    }
    if (event.pointerId !== this.dragPointerId) return;
    this.dragPointerId = null;
    this.isDragging = false;
    const bounds = this.getPanBounds();
    this.dragX = Math.max(bounds.minX, Math.min(bounds.maxX, this.dragX));
    this.dragY = Math.max(bounds.minY, Math.min(bounds.maxY, this.dragY));
    const workspace = event.currentTarget as HTMLElement;
    if (workspace.hasPointerCapture(event.pointerId)) workspace.releasePointerCapture(event.pointerId);
    if (this.ignoreNextCanvasClick) setTimeout(() => { this.ignoreNextCanvasClick = false; });
  }

  onWorkspaceClick(event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || this.ignoreNextCanvasClick) return;
    if ((event.target as Element).closest('button, input, textarea, nav, aside, .path-connection-selectable')) return;
    this.selectedCardKeys.clear();
    this.selectedLineIds.clear();
    this.selectionChange.emit({ nodeIds: [], edgeIds: [] });
  }

  private getPanBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const workspace = this.workspace?.nativeElement;
    const stage = this.stage?.nativeElement;
    const items = stage?.querySelectorAll<HTMLElement>('.previous-node, .current-node, .next-row');
    if (!workspace || !items?.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const view = workspace.getBoundingClientRect();
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    items.forEach((item) => {
      const box = item.getBoundingClientRect();
      left = Math.min(left, box.left);
      right = Math.max(right, box.right);
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    });
    left -= this.dragX;
    right -= this.dragX;
    top -= this.dragY;
    bottom -= this.dragY;
    const visibleLeft = view.left + 88;
    const visibleRight = view.right - (this.inspectorOpen ? 392 : 24);
    const visibleTop = view.top + 166;
    const visibleBottom = view.bottom - 24;
    return {
      minX: Math.min(0, visibleRight - right),
      maxX: Math.max(0, visibleLeft - left),
      minY: Math.min(0, visibleBottom - bottom),
      maxY: Math.max(0, visibleTop - top),
    };
  }
  openSwap(edgeId: string): void {
    this.swapEdgeId = edgeId;
    this.swapQuery = '';
    this.swapVisibleCount = 100;
  }
  chooseSwapTarget(nodeId: string): void {
    if (!this.swapEdgeId) return;
    this.updateEdge.emit({ id: this.swapEdgeId, changes: { target: nodeId } });
    this.swapEdgeId = null;
  }
  isActiveEdge(id: string): boolean { return this.hoveredEdgeId === id || this.selectedEdgeIds.includes(id); }
  isCardSelected(key: string): boolean { return this.selectedCardKeys.has(key); }
  selectOutgoingEdge(event: MouseEvent, id: string): void {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      if (this.selectedLineIds.has(id)) this.selectedLineIds.delete(id);
      else this.selectedLineIds.add(id);
      this.emitPathSelection();
    } else this.editEdge.emit(id);
  }
  private toggleCard(key: string): void {
    if (this.selectedCardKeys.has(key)) this.selectedCardKeys.delete(key);
    else this.selectedCardKeys.add(key);
    this.emitPathSelection();
  }
  private emitPathSelection(): void {
    const nodes = new Set<string>();
    const edges = new Set(this.selectedLineIds);
    for (const key of this.selectedCardKeys) {
      if (key.startsWith('previous:')) nodes.add(key.slice(9));
      else if (key.startsWith('next:')) {
        const edge = this.outgoing.find((item) => item.id === key.slice(5));
        if (edge) { nodes.add(edge.target); edges.add(edge.id); }
      }
    }
    this.selectionChange.emit({ nodeIds: [...nodes], edgeIds: [...edges] });
  }
  private selectInsideRect(rect: { left: number; top: number; right: number; bottom: number }): void {
    const stage = this.stage?.nativeElement;
    if (!stage) return;
    const intersects = (element: Element): boolean => {
      const bounds = element.getBoundingClientRect();
      return bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top;
    };
    const cards = new Set(this.selectionBaseCards);
    const lines = new Set(this.selectionBaseLines);
    stage.querySelectorAll<HTMLElement>('.previous-node').forEach((element) => {
      if (intersects(element) && element.dataset['nodeId']) cards.add(`previous:${element.dataset['nodeId']}`);
    });
    stage.querySelectorAll<HTMLElement>('.next-node').forEach((element) => {
      if (intersects(element) && element.dataset['edgeId']) cards.add(`next:${element.dataset['edgeId']}`);
    });
    stage.querySelectorAll<HTMLElement>('.edge-label-badge').forEach((element) => {
      if (intersects(element) && element.dataset['edgeId']) lines.add(element.dataset['edgeId']);
    });
    const stageRect = stage.getBoundingClientRect();
    for (const route of this.outgoingConnectionPaths) {
      if (route.selectFromX === undefined || route.selectToX === undefined || route.selectY === undefined) continue;
      const y = stageRect.top + route.selectY;
      const left = stageRect.left + Math.min(route.selectFromX, route.selectToX);
      const right = stageRect.left + Math.max(route.selectFromX, route.selectToX);
      if (rect.top <= y && rect.bottom >= y && rect.left <= right && rect.right >= left) lines.add(route.id);
    }
    this.selectedCardKeys = cards;
    this.selectedLineIds = lines;
    this.emitPathSelection();
  }

  scheduleConnections(): void {
    if (this.connectionFrameId !== null) cancelAnimationFrame(this.connectionFrameId);
    this.connectionFrameId = requestAnimationFrame(() => {
      this.connectionFrameId = null;
      this.measureConnections();
    });
  }

  private measureConnections(): void {
    const stage = this.stage?.nativeElement;
    const current = stage?.querySelector<HTMLElement>('.current-node');
    if (!stage || !current) {
      this.incomingConnectionPaths = [];
      this.outgoingConnectionPaths = [];
      this.changeDetector.markForCheck();
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    const sourceX = currentRect.right - stageRect.left;
    const sourceY = currentRect.top + currentRect.height / 2 - stageRect.top;
    this.incomingConnectionPaths = Array.from(stage.querySelectorAll<HTMLElement>('.previous-node')).map((previous) => {
      const rect = previous.getBoundingClientRect();
      const fromX = rect.right - stageRect.left;
      const fromY = rect.top + rect.height / 2 - stageRect.top;
      const targetX = currentRect.left - stageRect.left;
      const targetY = Math.max(currentRect.top + 12 - stageRect.top, Math.min(fromY, currentRect.bottom - 12 - stageRect.top));
      return targetY === fromY ? `M ${fromX} ${fromY} H ${targetX}` : `M ${fromX} ${fromY} L ${targetX} ${targetY}`;
    });

    this.outgoingConnectionPaths = Array.from(stage.querySelectorAll<HTMLElement>('.next-row')).map((row, index) => {
      const target = row.querySelector<HTMLElement>('.next-node');
      const edge = this.outgoing[index];
      if (!target || !edge) return null;
      const rect = target.getBoundingClientRect();
      const targetX = rect.left - stageRect.left - 5;
      const targetY = rect.top + rect.height / 2 - stageRect.top;
      const bendX = Math.min(sourceX + 24, targetX - 24);
      return { id: edge.id, path: `M ${sourceX} ${sourceY} H ${bendX} V ${targetY} H ${targetX}`, selectFromX: bendX, selectToX: targetX, selectY: targetY };
    }).filter((route): route is { id: string; path: string; selectFromX: number; selectToX: number; selectY: number } => route !== null);
    this.changeDetector.markForCheck();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver ||= new ResizeObserver(() => this.scheduleConnections());
      const elements: Element[] = [stage, current, ...stage.querySelectorAll('.previous-node, .next-row')];
      if (elements.length !== this.observedElements.length || elements.some((element, index) => element !== this.observedElements[index])) {
        this.resizeObserver.disconnect();
        elements.forEach((element) => this.resizeObserver!.observe(element));
        this.observedElements = elements;
      }
    }
  }

  private captureTransition(toNodeId: string, direction: 'forward' | 'back', selected: HTMLElement): void {
    const stage = this.stage?.nativeElement;
    const current = stage?.querySelector<HTMLElement>('.current-node');
    const fromNodeId = this.currentNode?.id;
    this.clearTransition();
    if (!stage || !current || !fromNodeId || fromNodeId === toNodeId || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const fromRect = current.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    if (!fromRect.width || !fromRect.height || !selectedRect.width || !selectedRect.height) return;

    const fromPanX = this.dragX;
    const fromPanY = this.dragY;
    const stageGhost = this.cloneStage(stage);
    const fromGhost = this.cloneCard(current);
    const selectedGhost = this.cloneCard(selected);
    stage.style.visibility = 'hidden';
    stage.style.transition = 'none';
    this.centerView();
    const transition: PathCardTransition = {
      fromNodeId, toNodeId, direction,
      fromRect,
      selectedRect,
      fromPanX, fromPanY,
      stageGhost, fromGhost, selectedGhost,
      cleanupTimer: 0,
    };
    transition.cleanupTimer = window.setTimeout(() => this.clearTransition(), 700);
    this.pendingTransition = transition;
  }

  private cloneStage(stage: HTMLElement): HTMLElement {
    const rect = stage.getBoundingClientRect();
    const clone = stage.cloneNode(true) as HTMLElement;
    clone.classList.add('path-transition-stage-ghost');
    Object.assign(clone.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, right: 'auto', bottom: 'auto',
      width: `${rect.width}px`, height: `${rect.height}px`, transform: 'none', transition: 'none',
      zIndex: '100', pointerEvents: 'none', visibility: 'visible',
    });
    const scrollSelector = '.current-node, .next-list';
    const originals = stage.querySelectorAll<HTMLElement>(scrollSelector);
    const copies = clone.querySelectorAll<HTMLElement>(scrollSelector);
    originals.forEach((element, index) => { copies[index].scrollTop = element.scrollTop; });
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    document.body.append(clone);
    return clone;
  }

  private cloneCard(element: HTMLElement): HTMLElement {
    const rect = element.getBoundingClientRect();
    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.add('path-transition-card-ghost');
    Object.assign(clone.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
      maxHeight: 'none', margin: '0', boxSizing: 'border-box', transform: 'none', transition: 'none', overflow: 'hidden',
      zIndex: '102', pointerEvents: 'none', visibility: 'hidden',
    });
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    document.body.append(clone);
    return clone;
  }

  private clearTransition(): void {
    this.activeAnimations.forEach((animation) => animation.cancel());
    this.activeAnimations = [];
    this.gridAnimation?.cancel();
    this.gridAnimation = null;
    this.stage?.nativeElement.style.removeProperty('transition');
    this.stage?.nativeElement.style.removeProperty('visibility');
    const transition = this.pendingTransition;
    if (!transition) return;
    window.clearTimeout(transition.cleanupTimer);
    transition.stageGhost.remove();
    transition.fromGhost.remove();
    transition.selectedGhost.remove();
    this.pendingTransition = null;
  }

  private animateBetween(element: HTMLElement, from: DOMRect, to: DOMRect, duration: number): void {
    element.style.visibility = 'visible';
    const animation = element.animate(
      [
        { opacity: 1, left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, offset: 0 },
        { opacity: 0.7, offset: 0.55 },
        { opacity: 0, left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, offset: 1 },
      ],
      { duration, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'forwards' },
    );
    this.activeAnimations.push(animation);
  }

  private animateSharedTransition(): boolean {
    const transition = this.pendingTransition;
    const stage = this.stage?.nativeElement;
    if (!transition || !stage || this.currentNode?.id !== transition.toNodeId) return false;
    stage.style.transition = 'none';
    const current = stage.querySelector<HTMLElement>('.current-node');
    if (!current) return false;
    const selector = transition.direction === 'forward' ? '.previous-node' : '.next-node';
    const destination = Array.from(stage.querySelectorAll<HTMLElement>(selector)).find((node) => node.dataset['nodeId'] === transition.fromNodeId);
    const currentRect = current.getBoundingClientRect();
    const destinationRect = destination?.getBoundingClientRect() || transition.selectedRect;
    stage.style.visibility = 'visible';
    this.activeAnimations.push(transition.stageGhost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }));
    this.animateBetween(transition.fromGhost, transition.fromRect, destinationRect, 440);
    this.animateBetween(transition.selectedGhost, transition.selectedRect, currentRect, 440);
    stage.querySelectorAll<HTMLElement>('.previous-node, .current-node, .next-row').forEach((element, index) => {
      this.activeAnimations.push(element.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0, offset: 0.45 }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 440, delay: Math.min(index * 18, 72), easing: 'ease-out' },
      ));
    });
    stage.querySelectorAll<SVGPathElement>('.path-connections > path').forEach((path) => {
      this.activeAnimations.push(path.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 440, easing: 'ease-out' }));
    });
    return true;
  }

  private animateGrid(): void {
    this.gridAnimation?.cancel();
    this.gridAnimation = null;
    const direction = this.pendingTransition?.direction || this.navigationDirection;
    if (direction === 'reset') return;
    const workspace = this.workspace?.nativeElement;
    if (!workspace) return;
    const movement = direction === 'forward' ? -56 : 56;
    const startX = (this.pendingTransition?.fromPanX ?? this.dragX) % 28;
    const startY = (this.pendingTransition?.fromPanY ?? this.dragY) % 28;
    const start = `${startX}px ${startY}px`;
    const end = `${movement}px 0px`;
    this.gridAnimation = workspace.animate?.(
      [{ backgroundPosition: start }, { backgroundPosition: end }],
      { duration: 440, easing: 'cubic-bezier(.2, 0, 0, 1)' },
    ) || null;
  }

  private scheduleVisualUpdate(): void {
    if (this.visualFrameId !== null) cancelAnimationFrame(this.visualFrameId);
    this.visualFrameId = requestAnimationFrame(() => {
      this.visualFrameId = null;
      this.measureConnections();
      this.timeline?.nativeElement.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      if (this.navigationTick === 0 || this.navigationTick === this.lastAnimatedTick) return;
      this.lastAnimatedTick = this.navigationTick;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      this.animateGrid();
      if (this.animateSharedTransition()) return;
      const offset = this.navigationDirection === 'back' ? -42 : this.navigationDirection === 'reset' ? 0 : 42;
      this.stage?.nativeElement.querySelectorAll<HTMLElement>('.previous-node, .current-node, .next-row').forEach((element, index) => {
        element.animate?.(
          [{ opacity: 0, transform: `translateX(${offset}px)` }, { opacity: 1, transform: 'translateX(0)' }],
          { duration: 360, delay: Math.min(index * 35, 175), easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
      });
      this.stage?.nativeElement.querySelectorAll<SVGPathElement>('.path-connections > path').forEach((path) => {
        path.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 80, easing: 'ease-out' });
      });
    });
  }
  private normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim(); }
}
