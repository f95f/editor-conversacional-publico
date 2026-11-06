import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FlowDocument } from '../../core/models/flow-contracts';
import { FlowPathComponent } from './flow-path.component';

const document: FlowDocument = {
  schemaVersion: 1,
  document: { id: 'test', title: 'Teste', startNodeId: 'a' },
  content: {
    nodes: [
      { id: 'a', title: 'Abertura', message: 'Olá\nComo vai?' },
      { id: 'b', title: 'Proposta', description: 'Contexto da proposta' },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', baseMessage: 'Quero saber mais' },
      { id: 'e2', source: 'a', target: 'b', baseMessage: 'Pode explicar?' },
      { id: 'e3', source: 'b', target: 'a', baseMessage: 'Voltar' },
    ],
  },
};

describe('FlowPathComponent', () => {
  let fixture: ComponentFixture<FlowPathComponent>;
  let component: FlowPathComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FlowPathComponent] }).compileComponents();
    fixture = TestBed.createComponent(FlowPathComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('document', document);
    fixture.componentRef.setInput('steps', [{ key: 1, nodeId: 'a', viaEdgeId: null }]);
    fixture.detectChanges();
  });

  it('renders parallel responses separately and keeps the full agent message', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.next-row')).toHaveLength(2);
    expect(root.querySelector('.agent-message')?.textContent).toBe('Olá\nComo vai?');
    const follow = vi.spyOn(component.followEdge, 'emit');
    root.querySelector<HTMLButtonElement>('.next-node')?.click();
    expect(follow).toHaveBeenCalledWith('e1');
  });

  it('shows repeated logical blocks as separate timeline occurrences', () => {
    fixture.componentRef.setInput('steps', [
      { key: 1, nodeId: 'a', viaEdgeId: null },
      { key: 2, nodeId: 'b', viaEdgeId: 'e1' },
      { key: 3, nodeId: 'a', viaEdgeId: 'e3' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.path-timeline button')).toHaveLength(3);
    expect(root.querySelectorAll('.repeat-indicator')).toHaveLength(1);
    const jump = vi.spyOn(component.jumpToNode, 'emit');
    root.querySelector<HTMLButtonElement>('.previous-node')?.click();
    expect(jump).toHaveBeenCalledWith('b');
  });

  it('lists blocks without showing a search bar or a path count', () => {
    component.listOpen = true;
    fixture.changeDetectorRef.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.path-index input')).toBeNull();
    expect(root.querySelector('.node-footer')?.textContent).toContain('Nova resposta');
    expect(root.querySelector('.node-footer')?.textContent).not.toContain('caminhos');
    expect(root.querySelector('.index-item span')?.textContent).toContain('Olá');
    expect(root.querySelector('.index-item span')?.textContent?.trim()).not.toBe('a');
    const jump = vi.spyOn(component.jumpToNode, 'emit');
    root.querySelector<HTMLButtonElement>('.index-items button')?.click();
    expect(jump).toHaveBeenCalledWith('a');
    expect(root.querySelectorAll('.next-row')).toHaveLength(2);
  });

  it('requests a new block when creating a response', () => {
    const create = vi.spyOn(component.addResponseNode, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.node-footer button')?.click();
    expect(create).toHaveBeenCalledOnce();
    expect(document.content.edges).toHaveLength(3);
  });

  it('highlights the selected client message and its line', () => {
    fixture.componentRef.setInput('selectedEdgeIds', ['e1']);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.edge-label-badge')?.classList.contains('active')).toBe(true);
    component.outgoingConnectionPaths = [
      { id: 'e1', path: 'M 0 0 H 10' },
      { id: 'e2', path: 'M 0 0 H 20' },
    ];
    fixture.changeDetectorRef.detectChanges();
    expect(root.querySelectorAll('.path-connections > path.active')).toHaveLength(1);
  });

  it('seleciona blocos pequenos com Ctrl+clique sem navegar', () => {
    const select = vi.spyOn(component.selectionChange, 'emit');
    const follow = vi.spyOn(component.followEdge, 'emit');
    const next = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.next-node')!;
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(select).toHaveBeenCalledWith({ nodeIds: ['b'], edgeIds: ['e1'] });
    expect(follow).not.toHaveBeenCalled();
  });

  it('seleciona por Ctrl+arraste sem incluir o bloco central', () => {
    const workspace = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.path-workspace')!;
    const next = workspace.querySelector<HTMLElement>('.next-node')!;
    const current = workspace.querySelector<HTMLElement>('.current-node')!;
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect);
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 800));
    vi.spyOn(next, 'getBoundingClientRect').mockReturnValue(rect(600, 320, 120, 40));
    vi.spyOn(current, 'getBoundingClientRect').mockReturnValue(rect(600, 320, 120, 40));
    Object.defineProperty(workspace, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(workspace, 'hasPointerCapture', { value: vi.fn(() => false) });
    const select = vi.spyOn(component.selectionChange, 'emit');
    const pointer = { button: 0, ctrlKey: true, target: workspace, currentTarget: workspace, pointerId: 8, clientX: 580, clientY: 300, preventDefault: vi.fn() } as unknown as PointerEvent;
    component.onCanvasPointerDown(pointer);
    component.onCanvasPointerMove({ ...pointer, clientX: 740, clientY: 380 } as PointerEvent);
    expect(select).toHaveBeenLastCalledWith({ nodeIds: ['b'], edgeIds: ['e1'] });
    expect(component.dragX).toBe(0);
    component.onCanvasPointerUp(pointer);
    expect(component.selectionRect).toBeNull();
  });

  it('seleciona apenas a instância clicada de um bloco repetido', () => {
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.next-node'));
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    fixture.detectChanges();
    expect(cards[0].classList.contains('is-selected')).toBe(true);
    expect(cards[1].classList.contains('is-selected')).toBe(false);
    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    fixture.detectChanges();
    expect(cards.filter((card) => card.classList.contains('is-selected'))).toHaveLength(2);
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    fixture.detectChanges();
    expect(cards[0].classList.contains('is-selected')).toBe(false);
    expect(cards[1].classList.contains('is-selected')).toBe(true);
  });

  it('ignora a caixa de contorno das linhas distantes durante o arraste', () => {
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('.path-stage')!;
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 800));
    stage.querySelectorAll<HTMLElement>('.previous-node, .next-node, .edge-label-badge').forEach((element) => {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect(800, 700, 40, 20));
    });
    component.outgoingConnectionPaths = [
      { id: 'e1', path: 'M 0 0 H 100 V 100 H 200', selectFromX: 100, selectToX: 200, selectY: 100 },
      { id: 'e2', path: 'M 0 0 H 100 V 500 H 200', selectFromX: 100, selectToX: 200, selectY: 500 },
    ];
    const select = vi.spyOn(component.selectionChange, 'emit');
    component['selectInsideRect']({ left: 120, right: 160, top: 90, bottom: 110 });
    expect(select).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: ['e1'] });
    component['selectInsideRect']({ left: 120, right: 160, top: 250, bottom: 350 });
    expect(select).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: [] });
  });

  it('limpa a seleção ao clicar no espaço vazio sem Ctrl', () => {
    const root = fixture.nativeElement as HTMLElement;
    const workspace = root.querySelector<HTMLElement>('.path-workspace')!;
    root.querySelector<HTMLButtonElement>('.next-node')!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    const select = vi.spyOn(component.selectionChange, 'emit');
    workspace.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(select).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: [] });
  });

  it('changes a next block through the floating picker without navigating', () => {
    const update = vi.spyOn(component.updateEdge, 'emit');
    const follow = vi.spyOn(component.followEdge, 'emit');
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.swap-target')?.click();
    fixture.changeDetectorRef.detectChanges();
    expect(root.querySelector('.swap-panel')).not.toBeNull();
    root.querySelectorAll<HTMLButtonElement>('.swap-options button')[0].click();
    expect(update).toHaveBeenCalledWith({ id: 'e1', changes: { target: 'a' } });
    expect(follow).not.toHaveBeenCalled();
  });

  it('keeps dozens of outgoing responses independently addressable', () => {
    const dense: FlowDocument = {
      ...document,
      content: {
        nodes: document.content.nodes,
        edges: Array.from({ length: 42 }, (_, index) => ({
          id: `dense-${index}`, source: 'a', target: 'b', baseMessage: `Resposta ${index + 1}`,
        })),
      },
    };
    fixture.componentRef.setInput('document', dense);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.next-row')).toHaveLength(42);
    const inspect = vi.spyOn(component.editEdge, 'emit');
    root.querySelectorAll<HTMLButtonElement>('.edge-label-badge')[41].click();
    expect(inspect).toHaveBeenCalledWith('dense-41');
  });

  it('connects each response from the same point and shows compact neighboring blocks', () => {
    fixture.componentRef.setInput('steps', [
      { key: 1, nodeId: 'b', viaEdgeId: null },
      { key: 2, nodeId: 'a', viaEdgeId: 'e3' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('.path-stage')!;
    const current = root.querySelector<HTMLElement>('.current-node')!;
    const previous = root.querySelector<HTMLElement>('.previous-node')!;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.next-node'));
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left, top, width, height, right: left + width, bottom: top + height,
    } as DOMRect);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 900, 500));
    vi.spyOn(current, 'getBoundingClientRect').mockReturnValue(rect(180, 30, 300, 240));
    vi.spyOn(previous, 'getBoundingClientRect').mockReturnValue(rect(0, 90, 110, 36));
    targets.forEach((target, index) => vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(700, 60 + index * 52, 120, 36)));
    component['measureConnections']();
    fixture.changeDetectorRef.detectChanges();
    expect(component.incomingConnectionPaths).toEqual(['M 110 108 H 180']);
    expect(component.outgoingConnectionPaths).toHaveLength(2);
    expect(component.outgoingConnectionPaths.every((route) => route.path.startsWith('M 480 150 H '))).toBe(true);
    expect(root.querySelectorAll('.path-connections > path')).toHaveLength(3);
    expect(root.querySelectorAll('.edge-user-icon')).toHaveLength(2);
    expect(previous.textContent?.trim()).toBe('Proposta');
    expect(targets.every((target) => target.textContent?.trim() === 'Proposta')).toBe(true);
    expect(previous.classList.contains('is-end')).toBe(false);
    expect(root.querySelectorAll('.next-node.is-end')).toHaveLength(0);
  });

  it('shows canonical incoming blocks even when the current path started elsewhere', () => {
    fixture.componentRef.setInput('steps', [{ key: 4, nodeId: 'b', viaEdgeId: null }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.previous-node')).toHaveLength(1);
    expect(root.querySelector('.previous-node')?.textContent?.trim()).toBe('Abertura');
    expect(root.querySelector('.previous-node')?.classList.contains('is-start')).toBe(true);
  });

  it('connects an existing listed block without navigating to it', () => {
    component.toggleList();
    fixture.changeDetectorRef.detectChanges();
    const connect = vi.spyOn(component.connectNode, 'emit');
    const navigate = vi.spyOn(component.jumpToNode, 'emit');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.index-connect')?.click();
    expect(connect).toHaveBeenCalledWith('a');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('animates the cards when navigating to another block', async () => {
    const current = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.current-node')!;
    const animate = vi.fn();
    Object.defineProperty(current, 'animate', { value: animate });
    fixture.componentRef.setInput('navigationTick', 1);
    fixture.componentRef.setInput('navigationDirection', 'forward');
    fixture.detectChanges();
    component.scheduleConnections();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(animate).toHaveBeenCalled();
    expect(animate.mock.calls[0][0][0].transform).toContain('42px');
  });

  it('moves the dotted background with the canvas drag and restores both together', () => {
    const workspace = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.path-workspace')!;
    const stage = workspace.querySelector<HTMLElement>('.path-stage')!;
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left, top, width, height, right: left + width, bottom: top + height,
    } as DOMRect);
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 800));
    vi.spyOn(stage.querySelector<HTMLElement>('.current-node')!, 'getBoundingClientRect').mockImplementation(() => rect(200 + component.dragX, 300 + component.dragY, 300, 200));
    stage.querySelectorAll<HTMLElement>('.previous-node').forEach((node) => {
      vi.spyOn(node, 'getBoundingClientRect').mockImplementation(() => rect(110 + component.dragX, 320 + component.dragY, 100, 36));
    });
    stage.querySelectorAll<HTMLElement>('.next-row').forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => rect(600 + component.dragX, 300 + component.dragY + index * 52, 300, 44));
    });
    Object.defineProperty(workspace, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(workspace, 'hasPointerCapture', { value: vi.fn(() => false) });
    const pointer = { button: 0, target: workspace, currentTarget: workspace, pointerId: 1, clientX: 10, clientY: 20 } as unknown as PointerEvent;
    component.onCanvasPointerDown(pointer);
    component.onCanvasPointerMove({ ...pointer, clientX: 60, clientY: 45 } as PointerEvent);
    expect(component.dragX).toBe(50);
    expect(component.dragY).toBe(25);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(workspace.style.getPropertyValue('--path-drag-x')).toBe('50px');
    expect(workspace.style.getPropertyValue('--path-drag-y')).toBe('25px');
    expect(stage.style.getPropertyValue('--path-drag-x')).toBe('');
    expect(component['getPanBounds']()).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    component.onCanvasPointerUp(pointer);
    expect(component.dragX).toBe(0);
    expect(component.dragY).toBe(0);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(workspace.style.getPropertyValue('--path-drag-x')).toBe('0px');
    expect(workspace.style.getPropertyValue('--path-drag-y')).toBe('0px');
  });

  it('keeps long-list panning and eases overscroll back to the last reachable block', () => {
    const workspace = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.path-workspace')!;
    const rows = Array.from(workspace.querySelectorAll<HTMLElement>('.next-row'));
    const current = workspace.querySelector<HTMLElement>('.current-node')!;
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left, top, width, height, right: left + width, bottom: top + height,
    } as DOMRect);
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 800));
    vi.spyOn(current, 'getBoundingClientRect').mockImplementation(() => rect(200, 320 + component.dragY, 300, 200));
    vi.spyOn(rows[0], 'getBoundingClientRect').mockImplementation(() => rect(600, -300 + component.dragY, 300, 44));
    vi.spyOn(rows[1], 'getBoundingClientRect').mockImplementation(() => rect(600, 1250 + component.dragY, 300, 44));
    Object.defineProperty(workspace, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(workspace, 'hasPointerCapture', { value: vi.fn(() => false) });
    const pointer = { button: 0, target: workspace, currentTarget: workspace, pointerId: 1, clientX: 0, clientY: 0 } as unknown as PointerEvent;
    component.onCanvasPointerDown(pointer);
    component.onCanvasPointerMove({ ...pointer, clientY: -300 } as PointerEvent);
    component.onCanvasPointerUp(pointer);
    expect(component.dragY).toBe(-300);
    component.onCanvasPointerDown(pointer);
    component.onCanvasPointerMove({ ...pointer, clientY: -1000 } as PointerEvent);
    expect(component.dragY).toBe(-1300);
    const bounds = component['getPanBounds']();
    component.onCanvasPointerUp(pointer);
    expect(component.dragY).toBe(bounds.minY);
    expect(component.dragY).toBeGreaterThan(-1300);
    component.centerView();
    expect(component.dragY).toBe(0);
  });

  it('moves the selected block into the current position and shrinks the old block', async () => {
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('.path-stage')!;
    const current = root.querySelector<HTMLElement>('.current-node')!;
    const next = root.querySelector<HTMLElement>('.next-node')!;
    component.dragY = -448;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left, top, width, height, right: left + width, bottom: top + height,
    } as DOMRect);
    vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(() => rect(20, 40 + component.dragY, 900, 500));
    vi.spyOn(current, 'getBoundingClientRect').mockImplementation(() => rect(150, 80 + component.dragY, 300, 240));
    vi.spyOn(next, 'getBoundingClientRect').mockReturnValue(rect(700, 120, 120, 36));
    const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
    const animate = vi.fn((_frames: Keyframe[], _options?: KeyframeAnimationOptions) => ({ cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    try {
      next.click();
      expect(component.dragY).toBe(0);
      expect(window.document.body.querySelectorAll('.path-transition-card-ghost')).toHaveLength(2);
      expect(stage.style.visibility).toBe('hidden');
      expect(stage.style.transition).toBe('none');
      expect(window.document.body.querySelector('.path-transition-stage-ghost .current-node')?.textContent).toContain('Abertura');
      fixture.componentRef.setInput('steps', [
        { key: 1, nodeId: 'a', viaEdgeId: null },
        { key: 2, nodeId: 'b', viaEdgeId: 'e1' },
      ]);
      fixture.componentRef.setInput('navigationTick', 1);
      fixture.componentRef.setInput('navigationDirection', 'forward');
      fixture.detectChanges();
      expect(root.querySelector('.current-node')?.textContent).toContain('Proposta');
      expect(stage.style.visibility).toBe('hidden');
      expect(window.document.body.querySelector('.path-transition-stage-ghost .current-node')?.textContent).toContain('Abertura');
      const previous = root.querySelector<HTMLElement>('.previous-node[data-node-id="a"]')!;
      vi.spyOn(previous, 'getBoundingClientRect').mockReturnValue(rect(30, 120, 110, 36));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(stage.style.visibility).toBe('visible');
      const shrinking = animate.mock.calls.find(([frames]) => frames[0]?.['width'] === '300px' && frames[2]?.['width'] === '110px');
      const growing = animate.mock.calls.find(([frames]) => frames[0]?.['width'] === '120px' && frames[2]?.['width'] === '300px');
      expect(shrinking?.[0][2]).toMatchObject({ left: '30px', top: '120px', height: '36px' });
      expect(growing?.[0][2]).toMatchObject({ left: '150px', top: '80px', height: '240px' });
      expect(shrinking?.[0].every((frame) => !('transform' in frame))).toBe(true);
      expect(growing?.[0].every((frame) => !('transform' in frame))).toBe(true);
      const grid = animate.mock.calls.find(([frames]) => frames[0]?.['backgroundPosition'] === '0px 0px');
      expect(grid?.[0][1]).toMatchObject({ backgroundPosition: '-56px 0px' });
    } finally {
      fixture.destroy();
      if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
      else delete (Element.prototype as Partial<Element>).animate;
    }
    expect(window.document.body.querySelectorAll('.path-transition-card-ghost')).toHaveLength(0);
    expect(window.document.body.querySelectorAll('.path-transition-stage-ghost')).toHaveLength(0);
  });

  it('moves the dotted background backward when a previous block resets the path', async () => {
    fixture.componentRef.setInput('steps', [{ key: 2, nodeId: 'b', viaEdgeId: null }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('.path-stage')!;
    const current = root.querySelector<HTMLElement>('.current-node')!;
    const previous = root.querySelector<HTMLButtonElement>('.previous-node')!;
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left, top, width, height, right: left + width, bottom: top + height,
    } as DOMRect);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(20, 40, 900, 500));
    vi.spyOn(current, 'getBoundingClientRect').mockReturnValue(rect(150, 80, 300, 240));
    vi.spyOn(previous, 'getBoundingClientRect').mockReturnValue(rect(30, 120, 110, 36));
    const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
    const animate = vi.fn((_frames: Keyframe[], _options?: KeyframeAnimationOptions) => ({ cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    try {
      previous.click();
      fixture.componentRef.setInput('steps', [{ key: 3, nodeId: 'a', viaEdgeId: null }]);
      fixture.componentRef.setInput('navigationTick', 1);
      fixture.componentRef.setInput('navigationDirection', 'reset');
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const grid = animate.mock.calls.find(([frames]) => frames[0]?.['backgroundPosition'] === '0px 0px');
      expect(grid?.[0][1]).toMatchObject({ backgroundPosition: '56px 0px' });
    } finally {
      fixture.destroy();
      if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
      else delete (Element.prototype as Partial<Element>).animate;
    }
  });
});
