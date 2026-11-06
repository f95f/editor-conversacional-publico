import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { vi } from 'vitest';
import { CANVAS_FIT_MAX_ZOOM, CANVAS_MIN_ZOOM, FlowCanvasComponent } from './flow-canvas.component';
import { FFlowModule, provideFFlow } from '@foblex/flow';

describe('FlowCanvasComponent', () => {
  let component: FlowCanvasComponent;
  let fixture: ComponentFixture<FlowCanvasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowCanvasComponent, FFlowModule],
      providers: [provideFFlow()],
    }).compileComponents();

    fixture = TestBed.createComponent(FlowCanvasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default zoom of 1.0', () => {
    expect(component.zoom).toBe(1.0);
  });

  it('should allow zooming out far enough for large flows', () => {
    expect(component.minZoom).toBe(CANVAS_MIN_ZOOM);
    expect(component.minZoom).toBeLessThanOrEqual(0.1);
  });

  it('should have empty selectedNodeIds by default', () => {
    expect(component.selectedNodeIds).toEqual([]);
  });

  it('should have empty selectedEdgeIds by default', () => {
    expect(component.selectedEdgeIds).toEqual([]);
  });

  it('should forward empty selection from Foblex', () => {
    const spy = vi.fn();
    component.selectionChange.subscribe(spy);
    component.onFoblexSelectionChange({ nodeIds: [], connectionIds: [] } as any);
    expect(spy).toHaveBeenCalledWith({ nodeIds: [], edgeIds: [] });
  });

  it('should forward node and edge selection from Foblex', () => {
    const spy = vi.fn();
    component.selectionChange.subscribe(spy);
    component.onFoblexSelectionChange({ nodeIds: ['node-1'], connectionIds: ['edge-1'] } as any);
    expect(spy).toHaveBeenCalledWith({ nodeIds: ['node-1'], edgeIds: ['edge-1'] });
  });

  it('clears the selection when the empty canvas is clicked without Ctrl', () => {
    component.selectedNodeIds = ['node-1'];
    const spy = vi.fn();
    component.selectionChange.subscribe(spy);
    const background = document.createElement('div');
    component.onCanvasBackgroundClick({ ctrlKey: false, metaKey: false, target: background } as unknown as MouseEvent);
    expect(spy).toHaveBeenCalledWith({ nodeIds: [], edgeIds: [] });
  });

  it('should set isShiftPressed to true on Shift keydown', () => {
    const event = new KeyboardEvent('keydown', { key: 'Shift' });
    component.onKeyDown(event);
    expect(component.isShiftPressed).toBe(true);
  });

  it('should set isShiftPressed to false on Shift keyup', () => {
    component.isShiftPressed = true;
    const event = new KeyboardEvent('keyup', { key: 'Shift' });
    component.onKeyUp(event);
    expect(component.isShiftPressed).toBe(false);
  });

  it('should return default position {x:0, y:0} for unknown node', () => {
    component.document = null;
    const pos = component.getNodePosition('unknown-id');
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it('keeps node position input stable until its saved coordinates change', () => {
    component.document = {
      schemaVersion: 1,
      document: { id: 'test', title: 'Teste' },
      content: { nodes: [{ id: 'n1', title: 'Bloco' }], edges: [] },
      layout: { nodes: { n1: { x: 120, y: 180, width: 240, height: 92 } } },
    };

    const first = component.getNodePosition('n1');
    component.previewNodeId = 'n1';
    expect(component.getNodePosition('n1')).toBe(first);

    component.document.layout!.nodes!['n1']!.x = 240;
    const moved = component.getNodePosition('n1');
    expect(moved).not.toBe(first);
    expect(moved).toEqual({ x: 240, y: 180 });
  });

  it('marks the start and nodes without outgoing connections distinctly', () => {
    component.document = {
      schemaVersion: 1,
      document: { id: 'test', title: 'Teste', startNodeId: 'start' },
      content: {
        nodes: [
          { id: 'start', title: 'Início' },
          { id: 'middle', title: 'Meio' },
          { id: 'end', title: 'Fim' },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'middle', baseMessage: 'Avançar' },
          { id: 'e2', source: 'middle', target: 'end', baseMessage: 'Encerrar' },
        ],
      },
    };
    component.ngOnChanges({ document: new SimpleChange(null, component.document, true) });

    expect(component.isEndNode('start')).toBe(false);
    expect(component.isEndNode('middle')).toBe(false);
    expect(component.isEndNode('end')).toBe(true);
  });

  it('updates end status when a node gains an outgoing connection', () => {
    const nodes = [{ id: 'start', title: 'Início' }, { id: 'end', title: 'Fim' }];
    const edges = [{ id: 'e1', source: 'start', target: 'end', baseMessage: 'Avançar' }];
    component.document = {
      schemaVersion: 1,
      document: { id: 'test', title: 'Teste', startNodeId: 'start' },
      content: { nodes, edges },
    };
    component.ngOnChanges({ document: new SimpleChange(null, component.document, true) });
    expect(component.isEndNode('end')).toBe(true);

    const previous = component.document;
    component.document = {
      schemaVersion: 1,
      document: { id: 'test', title: 'Teste', startNodeId: 'start' },
      content: { nodes, edges: [...edges, { id: 'e2', source: 'end', target: 'start', baseMessage: 'Voltar' }] },
    };
    component.ngOnChanges({ document: new SimpleChange(previous, component.document, false) });
    expect(component.isEndNode('end')).toBe(false);
  });

  it('prioritizes start styling when the flow has only one node', () => {
    component.document = {
      schemaVersion: 1,
      document: { id: 'test', title: 'Teste', startNodeId: 'only' },
      content: { nodes: [{ id: 'only', title: 'Único' }], edges: [] },
    };
    component.ngOnChanges({ document: new SimpleChange(null, component.document, true) });

    expect(component.isEndNode('only')).toBe(false);
  });

  it('trackByNodeId should return node id', () => {
    const node: any = { id: 'n1', title: 'Test' };
    expect(component.trackByNodeId(0, node)).toBe('n1');
  });

  it('trackByEdgeId should return edge id', () => {
    const edge: any = { id: 'e1', baseMessage: 'Test' };
    expect(component.trackByEdgeId(0, edge)).toBe('e1');
  });

  it('should fit large diagrams without forcing 100% zoom', () => {
    const fitToScreen = vi.fn();
    component.fCanvas = { fitToScreen } as any;

    component.fitView();

    expect(fitToScreen).toHaveBeenCalledWith(
      { x: 180, y: 140 },
      true,
      true,
      CANVAS_FIT_MAX_ZOOM
    );
  });

  it('previews the full agent message inside the viewport', () => {
    const node = { id: 'n1', title: 'Enviar boleto', message: 'Linha 1\nLinha 2' };
    component.document = {
      schemaVersion: 1,
      document: { id: 'test', title: 'Teste' },
      content: { nodes: [node], edges: [] },
    };
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: window.innerWidth - 100,
      right: window.innerWidth - 20,
      top: window.innerHeight - 40,
    } as DOMRect);

    component.showNodePreview(node, { currentTarget: element } as unknown as MouseEvent);

    expect(component.previewNode?.message).toBe('Linha 1\nLinha 2');
    expect(component.previewPosition.x).toBeGreaterThanOrEqual(12);
    expect(component.previewPosition.x).toBeLessThan(window.innerWidth);
    expect(component.previewPosition.y).toBeGreaterThanOrEqual(12);
    expect(component.previewPosition.y).toBeLessThan(window.innerHeight);
  });

  it('hides the preview after leaving the node', () => {
    vi.useFakeTimers();
    try {
      component.previewNodeId = 'n1';
      component.schedulePreviewHide();
      vi.advanceTimersByTime(180);
      expect(component.previewNodeId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the preview clear of the properties panel', () => {
    const node = { id: 'n1', title: 'Enviar boleto', message: 'Fala longa' };
    const element = document.createElement('div');
    const panel = document.createElement('aside');
    panel.className = 'property-panel';
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 850, right: 890, top: 100 } as DOMRect);
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 900 } as DOMRect);
    document.body.append(panel);

    try {
      component.showNodePreview(node, { currentTarget: element } as unknown as MouseEvent);
      expect(component.previewPosition.x + 420).toBeLessThanOrEqual(888);
    } finally {
      panel.remove();
    }
  });

  it('keeps the preview below the header', () => {
    const node = { id: 'n1', title: 'Enviar boleto', message: 'Fala longa' };
    const element = document.createElement('div');
    const header = document.createElement('header');
    header.className = 'header-panel';
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 200, right: 300, top: 20 } as DOMRect);
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ bottom: 70 } as DOMRect);
    document.body.append(header);

    try {
      component.showNodePreview(node, { currentTarget: element } as unknown as MouseEvent);
      expect(component.previewPosition.y).toBeGreaterThanOrEqual(82);
    } finally {
      header.remove();
    }
  });

  it('anchors previews above nodes in the lower half of the viewport', () => {
    const node = { id: 'n1', title: 'Enviar boleto', message: 'Fala longa' };
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 200, right: 300, top: 500 } as DOMRect);

    component.showNodePreview(node, { currentTarget: element } as unknown as MouseEvent);

    expect(component.previewAbove).toBe(true);
    expect(component.previewPosition.y).toBe(500);
    expect(component.previewMaxHeight).toBeLessThanOrEqual(476);
  });

  it('does not reopen the preview during a node drag', () => {
    const node = { id: 'n1', title: 'Enviar boleto', message: 'Fala longa' };
    const element = document.createElement('div');
    element.className = 'flow-node-card';
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 200, right: 300, top: 200 } as DOMRect);
    const event = { currentTarget: element } as unknown as MouseEvent;

    component.showNodePreview(node, event);
    component.onNodePointerDown(node.id);
    expect(component.previewNodeId).toBeNull();

    component.showNodePreview(node, event);
    expect(component.previewNodeId).toBeNull();

    component.onPointerUp();
    component.showNodePreview(node, event);
    expect(component.previewNodeId).toBeNull();

    component.showNodePreview({ ...node, id: 'n2' }, event);
    expect(component.previewNodeId).toBe('n2');
    component.hideNodePreview();

    component.schedulePreviewHide();
    component.showNodePreview(node, event);
    expect(component.previewNodeId).toBe('n1');
  });
});
