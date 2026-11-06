import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FFlowModule,
  EFConnectionType,
  EFConnectableSide,
  FCanvasChangeEvent,
  FCreateConnectionEvent,
  FCanvasComponent,
  FFlowComponent,
  FMoveNodesEvent,
  FSelectionChangeEvent,
  provideFFlow,
  withControlScheme,
} from '@foblex/flow';
import { FlowDocument, FlowEdge, FlowNode, Point } from '../../core/models/flow-contracts';

export const CANVAS_MIN_ZOOM = 0.1;
export const CANVAS_MAX_ZOOM = 2.5;
export const CANVAS_ZOOM_STEP = 0.1;
export const CANVAS_FIT_MAX_ZOOM = 0.85;

@Component({
  selector: 'app-flow-canvas',
  standalone: true,
  imports: [CommonModule, FFlowModule],
  providers: [provideFFlow(withControlScheme({
    selection: (event) => event instanceof MouseEvent && event.button === 0 && (event.ctrlKey || event.metaKey),
    canvasMove: (event) => event instanceof MouseEvent && event.button === 0 && !event.ctrlKey && !event.metaKey,
  }))],
  templateUrl: './flow-canvas.component.html',
  styleUrl: './flow-canvas.component.css',
})
export class FlowCanvasComponent implements OnChanges, OnDestroy {
  private changeDetectorRef = inject(ChangeDetectorRef);
  private previewHideTimer: number | null = null;
  private isNodePointerDown = false;
  private suppressedPreviewNodeId: string | null = null;
  private readonly nodePositions = new Map<string, Point>();
  private outgoingNodeIds: ReadonlySet<string> = new Set();
  @Input() document: FlowDocument | null = null;
  @Input() selectedNodeIds: string[] = [];
  @Input() selectedEdgeIds: string[] = [];
  @Input() zoom: number = 1.0;

  @Output() selectionChange = new EventEmitter<{ nodeIds: string[]; edgeIds: string[] }>();
  @Output() nodeLayoutChange = new EventEmitter<Record<string, { x: number; y: number; width: number; height: number }>>();
  @Output() createEdge = new EventEmitter<{ source: string; target: string }>();
  @Output() zoomChange = new EventEmitter<number>();
  @Output() viewportChange = new EventEmitter<{ x: number; y: number; zoom: number }>();

  @ViewChild(FCanvasComponent, { static: false }) fCanvas!: FCanvasComponent;
  @ViewChild(FFlowComponent, { static: false }) fFlow?: FFlowComponent;

  public connectionType = EFConnectionType.BEZIER;
  public connectableSide = EFConnectableSide.AUTO;
  public isShiftPressed: boolean = false;
  public readonly minZoom = CANVAS_MIN_ZOOM;
  public readonly maxZoom = CANVAS_MAX_ZOOM;
  public readonly zoomStep = CANVAS_ZOOM_STEP;
  public previewNodeId: string | null = null;
  public previewPosition: Point = { x: 12, y: 12 };
  public previewAbove = false;
  public previewMaxHeight = 520;

  public get previewNode(): FlowNode | null {
    return this.document?.content.nodes.find((node) => node.id === this.previewNodeId) || null;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['document']) {
      const nodeIds = new Set(this.document?.content.nodes.map((node) => node.id) ?? []);
      this.outgoingNodeIds = new Set(this.document?.content.edges.map((edge) => edge.source) ?? []);
      for (const nodeId of this.nodePositions.keys()) {
        if (!nodeIds.has(nodeId)) this.nodePositions.delete(nodeId);
      }
    }
    if (changes['document'] && !changes['document'].firstChange) {
      this.redrawSoon();
      if (this.previewNodeId && !this.previewNode?.message?.trim()) {
        this.hideNodePreview();
      }
    }
    if (changes['selectedNodeIds'] || changes['selectedEdgeIds']) {
      queueMicrotask(() => this.fFlow?.select(this.selectedNodeIds, this.selectedEdgeIds, false));
    }
  }

  public ngOnDestroy(): void {
    this.cancelPreviewHide();
  }

  public showNodePreview(node: FlowNode, event: MouseEvent | FocusEvent): void {
    if (this.isNodePointerDown || this.suppressedPreviewNodeId === node.id || !node.message?.trim() || !(event.currentTarget instanceof HTMLElement)) return;
    this.cancelPreviewHide();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    const panelLeft = document.querySelector('.property-panel')?.getBoundingClientRect().left;
    const rightBound = panelLeft !== undefined && panelLeft > width + 24
      ? Math.min(window.innerWidth - 12, panelLeft - 12)
      : window.innerWidth - 12;
    const headerBottom = document.querySelector('.header-panel')?.getBoundingClientRect().bottom ?? 0;
    const minY = Math.max(12, headerBottom + 12);
    const rightX = rect.right + 12;
    const leftX = rect.left - width - 12;
    const x = rightX + width <= rightBound
      ? rightX
      : leftX >= 12 && leftX + width <= rightBound
        ? leftX
        : Math.max(12, Math.min(rect.left, rightBound - width));
    const anchorY = Math.max(minY, Math.min(rect.top, window.innerHeight - 12));
    this.previewAbove = anchorY > (minY + window.innerHeight) / 2;
    this.previewMaxHeight = Math.max(40, Math.min(
      window.innerHeight * 0.6,
      520,
      this.previewAbove ? anchorY - minY - 12 : window.innerHeight - anchorY - 12,
    ));

    this.previewPosition = {
      x,
      y: anchorY,
    };
    this.previewNodeId = node.id;
    this.changeDetectorRef.markForCheck();
  }

  public schedulePreviewHide(): void {
    if (!this.isNodePointerDown) this.suppressedPreviewNodeId = null;
    this.cancelPreviewHide();
    this.previewHideTimer = window.setTimeout(() => this.hideNodePreview(), 180);
  }

  public cancelPreviewHide(): void {
    if (this.previewHideTimer !== null) {
      window.clearTimeout(this.previewHideTimer);
      this.previewHideTimer = null;
    }
  }

  public hideNodePreview(): void {
    this.cancelPreviewHide();
    if (this.previewNodeId === null) return;
    this.previewNodeId = null;
    this.changeDetectorRef.markForCheck();
  }

  public onNodePointerDown(nodeId: string): void {
    this.isNodePointerDown = true;
    this.suppressedPreviewNodeId = nodeId;
    this.hideNodePreview();
  }

  public onPointerUp(): void {
    this.isNodePointerDown = false;
  }

  public onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isShiftPressed = true;
    }
  }

  public onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.isShiftPressed = false;
    }
  }

  public getNodePosition(nodeId: string): Point {
    const layout = this.document?.layout?.nodes?.[nodeId];
    const x = layout?.x ?? 0;
    const y = layout?.y ?? 0;
    const cached = this.nodePositions.get(nodeId);
    if (cached?.x === x && cached.y === y) return cached;
    const position = { x, y };
    this.nodePositions.set(nodeId, position);
    return position;
  }

  public isEndNode(nodeId: string): boolean {
    return !!this.document && this.document.document.startNodeId !== nodeId && !this.outgoingNodeIds.has(nodeId);
  }

  public getSourceConnectorId(nodeId: string): string {
    return `${nodeId}:source`;
  }

  public getTargetConnectorId(nodeId: string): string {
    return `${nodeId}:target`;
  }

  public onMoveNodes(event: FMoveNodesEvent): void {
    this.hideNodePreview();
    const layouts: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const movedNode of event.nodes) {
      const currentLayout = this.document?.layout?.nodes?.[movedNode.id] || {
        x: 0,
        y: 0,
        width: 240,
        height: 120,
      };
      layouts[movedNode.id] = {
        ...currentLayout,
        ...this.snapPoint(movedNode.position),
      };
    }

    if (Object.keys(layouts).length > 0) {
      this.nodeLayoutChange.emit(layouts);
    }
  }

  public onConnectionCreated(event: FCreateConnectionEvent): void {
    const sourceNodeId = this.getNodeIdFromConnector(event.sourceId);
    const targetNodeId = event.targetId ? this.getNodeIdFromConnector(event.targetId) : null;

    if (sourceNodeId && targetNodeId) {
      this.createEdge.emit({ source: sourceNodeId, target: targetNodeId });
    }
  }

  public onFoblexSelectionChange(event: FSelectionChangeEvent): void {
    this.selectionChange.emit({
      nodeIds: event.nodeIds,
      edgeIds: event.connectionIds,
    });
  }

  public onCanvasBackgroundClick(event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) return;
    if ((event.target as Element).closest('.flow-node-card, .flow-edge-line, .edge-label-badge, button, input, textarea')) return;
    this.fFlow?.clearSelection();
    if (this.selectedNodeIds.length || this.selectedEdgeIds.length) this.selectionChange.emit({ nodeIds: [], edgeIds: [] });
  }

  public onCanvasChange(event: FCanvasChangeEvent): void {
    this.hideNodePreview();
    if (event.scale !== undefined && event.scale !== this.zoom) {
      this.zoomChange.emit(event.scale);
    }
    this.viewportChange.emit({ x: event.position.x, y: event.position.y, zoom: event.scale });
  }

  public onFlowRendered(): void {
    this.fFlow?.select(this.selectedNodeIds, this.selectedEdgeIds, false);
    this.redrawSoon();
  }

  public fitView(): void {
    this.fCanvas?.fitToScreen({ x: 180, y: 140 }, true, true, CANVAS_FIT_MAX_ZOOM);
  }

  public resetZoom(): void {
    this.fCanvas?.resetScale();
  }

  public trackByNodeId(index: number, node: FlowNode): string {
    return node.id;
  }

  public trackByEdgeId(index: number, edge: FlowEdge): string {
    return edge.id;
  }

  private getNodeIdFromConnector(connectorId: string): string | null {
    const separatorIndex = connectorId.lastIndexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }
    return connectorId.slice(0, separatorIndex);
  }

  private snapPoint(position: Point): Point {
    if (this.isShiftPressed) {
      return { x: position.x, y: position.y };
    }

    return {
      x: Math.round(position.x / 60) * 60,
      y: Math.round(position.y / 60) * 60,
    };
  }

  private redrawSoon(): void {
    window.requestAnimationFrame(() => this.fCanvas?.redraw());
  }
}
