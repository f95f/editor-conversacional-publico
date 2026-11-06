import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { FlowDocument } from './core/models/flow-contracts';

function flow(nodeCount: number, edgeCount: number): FlowDocument {
  return {
    schemaVersion: 1,
    document: { id: 'test', title: 'Teste', startNodeId: 'n0' },
    content: {
      nodes: Array.from({ length: nodeCount }, (_, index) => ({ id: `n${index}`, title: `Bloco ${index}` })),
      edges: Array.from({ length: edgeCount }, (_, index) => ({
        id: `e${index}`, source: 'n0', target: `n${(index % Math.max(1, nodeCount - 1)) + 1}`,
        baseMessage: `Resposta ${index}`,
      })),
    },
  };
}

describe('AppComponent', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterAll(() => vi.unstubAllGlobals());

  beforeEach(async () => {
    localStorage.removeItem('editor_conversacional_draft_v1');
    localStorage.removeItem('editor_conversacional_flows_v1');
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      teardown: { destroyAfterEach: false },
    }).compileComponents();
  });

  it('deve ser instanciado sem erros', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('keeps edits in separate local flows and restores the last selected flow', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const firstKey = app.activeFlowKey!;
    app.onTitleChange('Primeiro fluxo');
    app.onAddNode();
    const firstNodes = app.session.document.content.nodes.length;
    await app.onNewDocument();
    const secondKey = app.activeFlowKey!;
    app.onTitleChange('Segundo fluxo');
    expect(app.savedFlows).toHaveLength(2);
    app.selectLocalFlow(firstKey);
    expect(app.session.document.document.title).toBe('Primeiro fluxo');
    expect(app.session.document.content.nodes).toHaveLength(firstNodes);
    app.selectLocalFlow(secondKey);
    expect(app.session.document.content.nodes).toHaveLength(0);
    fixture.destroy();
    const restored = TestBed.createComponent(AppComponent);
    restored.detectChanges();
    expect(restored.componentInstance.activeFlowKey).toBe(secondKey);
    expect(restored.componentInstance.session.document.document.title).toBe('Segundo fluxo');
    expect(restored.nativeElement.querySelectorAll('.flow-entry')).toHaveLength(2);
    restored.nativeElement.querySelectorAll('.flow-entry')[1].click();
    expect(restored.componentInstance.session.document.document.title).toBe('Primeiro fluxo');
    restored.destroy();
  });

  it('preserves an unreadable local collection and reports the storage failure', () => {
    const raw = '{invalid';
    localStorage.setItem('editor_conversacional_flows_v1', raw);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    fixture.componentInstance.onTitleChange('Recuperação');
    expect(localStorage.getItem('editor_conversacional_flows_v1')).toBe(raw);
    expect(fixture.componentInstance.localSaveError).toContain('preservados');
    fixture.destroy();
  });

  it('keeps the current flow selected when saving fails', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const first = app.activeFlowKey!;
    await app.onNewDocument();
    const current = app.activeFlowKey;
    const save = vi.spyOn(app['localFlows'], 'save').mockImplementation(() => { throw new Error('Quota'); });
    app.onTitleChange('Ainda em memória');
    app.selectLocalFlow(first);
    expect(app.activeFlowKey).toBe(current);
    expect(app.session.document.document.title).toBe('Ainda em memória');
    expect(app.localSaveError).toContain('Exporte');
    save.mockRestore();
    fixture.destroy();
  });

  it('adds repeated imports independently instead of overwriting their document IDs', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const imported = flow(2, 1);
    vi.spyOn(app['fileStorage'], 'openJsonFile').mockResolvedValue({
      status: 'completed', value: { name: 'flow.json', text: JSON.stringify(imported) },
    });
    await app.onOpenDocument();
    app.onTitleChange('Primeira cópia');
    const first = app.activeFlowKey!;
    await app.onOpenDocument();
    expect(app.savedFlows).toHaveLength(3);
    expect(app.activeFlowKey).not.toBe(first);
    app.selectLocalFlow(first);
    expect(app.session.document.document.title).toBe('Primeira cópia');
    fixture.destroy();
  });

  it('persists viewport changes even when the engine retains the document reference', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app.onViewportChange({ x: 123, y: 456, zoom: 0.5 });
    const stored = JSON.parse(localStorage.getItem('editor_conversacional_flows_v1')!);
    expect(stored.flows[0].document.layout.viewport).toEqual({ x: 123, y: 456, zoom: 0.5 });
    fixture.destroy();
  });

  it('opens large flows in path and small flows in the map', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;

    app['loadDocument'](flow(21, 61), true);
    expect(app.viewMode).toBe('path');
    expect(app.focusNodeId).toBe('n0');
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n0']);
    expect(app.session.selection.nodeIds).toEqual([]);

    app['loadDocument'](flow(2, 1), true);
    expect(app.viewMode).toBe('map');
    expect(app.focusQuery).toBe('');
    expect(app.focusHistory).toEqual([]);
  });

  it('navigates, edits an edge, returns, and preserves the complete document', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);

    app.navigateToNode('n1');
    app.selectFocusEdge('e0');
    expect(app.session.selection.edgeIds).toEqual(['e0']);
    app.onUpdateEdge({ id: 'e0', changes: { baseMessage: 'Nova resposta' } });
    app.goBackInFocus();

    expect(app.focusNodeId).toBe('n0');
    expect(app.session.document.content.nodes).toHaveLength(21);
    expect(app.session.document.content.edges).toHaveLength(61);
    expect(app.session.document.content.edges[0].baseMessage).toBe('Nova resposta');
    app.setViewMode('map');
    expect(app.viewMode).toBe('map');
    expect(app.session.document.content.edges).toHaveLength(61);
  });

  it('copies selected path responses and pastes them into another current block', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    (document.activeElement as HTMLElement)?.blur();
    app.onSelectionChange({ nodeIds: ['n1'], edgeIds: ['e0'] });
    app.handleGlobalShortcuts(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
    app.resetPath('n2');
    app.handleGlobalShortcuts(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }));
    expect(app.session.document.content.edges).toHaveLength(62);
    expect(app.session.document.content.edges.at(-1)).toMatchObject({ source: 'n2', target: 'n1', baseMessage: 'Resposta 0' });
  });

  it('pastes selected responses with Ctrl+V in focus mode', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(3, 1), true);
    app.setViewMode('focus');
    app.navigateToNode('n0');
    app.selectFocusEdge('e0');
    (document.activeElement as HTMLElement)?.blur();
    app.handleGlobalShortcuts(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
    app.navigateToNode('n2');
    app.handleGlobalShortcuts(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }));
    expect(app.session.document.content.edges).toHaveLength(2);
    expect(app.session.document.content.edges.at(-1)).toMatchObject({ source: 'n2', target: 'n1' });
  });

  it('falls back to a surviving block when the focused block is deleted', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(3, 2), true);
    app.setViewMode('focus');
    app.navigateToNode('n1');
    app.onDeleteSelection();

    expect(app.focusNodeId).toBe('n0');
    expect(app.session.document.content.nodes.some((node) => node.id === 'n1')).toBe(false);
  });

  it('deletes a block from the agent action panel with incident connections', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(3, 2), true);
    app.onDeleteNode('n1');

    expect(app.session.document.content.nodes.some((node) => node.id === 'n1')).toBe(false);
    expect(app.session.document.content.edges.some((edge) => edge.source === 'n1' || edge.target === 'n1')).toBe(false);
    expect(app.session.selection).toEqual({ nodeIds: [], edgeIds: [] });
  });

  it('adds blocks and responses in focus using the same document commands', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app.setViewMode('focus');
    const before = app.session.document.content.nodes.length;
    app.onAddNode();
    const added = app.focusNodeId;
    expect(app.session.document.content.nodes).toHaveLength(before + 1);
    expect(app.session.selection.nodeIds).toEqual([added]);

    app.onCreateEdge({ source: added!, target: 'pergunta', baseMessage: 'Retornar' });
    expect(app.session.document.content.edges.at(-1)).toMatchObject({ source: added, target: 'pergunta', baseMessage: 'Retornar' });
    expect(app.session.selection.edgeIds).toHaveLength(1);
  });

  it('recovers the existing draft before saving the initial empty session', () => {
    const stored = flow(21, 61);
    localStorage.setItem('editor_conversacional_draft_v1', JSON.stringify(stored));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.session.document.content.nodes).toHaveLength(21);
    expect(fixture.componentInstance.viewMode).toBe('path');
  });

  it('renders an asynchronously opened document without another user click', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const imported = flow(21, 61);
    imported.document.title = 'Fluxo importado';
    vi.spyOn(app as any, 'confirmDocumentSwap').mockResolvedValue(true);
    vi.spyOn(app['fileStorage'], 'openJsonFile').mockResolvedValue({
      status: 'completed',
      value: { name: 'imported.flow.json', text: JSON.stringify(imported) },
    });

    await app.onOpenDocument();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector('.document-title-input') as HTMLInputElement;
    expect(title.value).toBe('Fluxo importado');
    expect(fixture.nativeElement.querySelector('app-flow-path')).not.toBeNull();
    expect(app.isOpeningDocument).toBe(false);
  });

  it('opens the file picker in the original click when there are no pending changes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    const picker = vi.spyOn(app['fileStorage'], 'openJsonFile').mockResolvedValue({ status: 'cancelled' });
    const opening = app.onOpenDocument();
    expect(picker).toHaveBeenCalledOnce();
    await opening;
    expect(app.isOpeningDocument).toBe(false);
  });

  it('walks loops as visual occurrences and truncates future steps on return', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    app.followPathEdge('e0');
    app.onCreateEdge({ source: 'n1', target: 'n0', baseMessage: 'Voltar' });
    const returnEdge = app.session.document.content.edges.at(-1)!.id;
    app.followPathEdge(returnEdge);
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n0', 'n1', 'n0']);
    expect(app.session.document.content.nodes).toHaveLength(21);
    app.jumpToPathStep(0);
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n0']);
    expect(app.session.document.content.edges).toHaveLength(62);
  });

  it('starts a fresh path from search and synchronizes logical blocks across modes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    app.followPathEdge('e0');
    app.jumpToPathEdge('e1');
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n0']);
    expect(app.session.selection.edgeIds).toEqual(['e1']);
    app.setViewMode('focus');
    app.navigateToNode('n2');
    app.setViewMode('path');
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n2']);
    app.setViewMode('map');
    expect(app.session.selection.nodeIds).toEqual(['n2']);
  });

  it('reconciles deleted path steps and restores their edges on undo', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    app.followPathEdge('e0');
    app.openPathNodeInspector('n1');
    app.onDeleteSelection();
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n0']);
    app.onUndo();
    expect(app.session.document.content.nodes.some((node) => node.id === 'n1')).toBe(true);
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual(['n0']);
  });

  it('creates a block and a response in path without duplicating logical nodes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    const current = app.pathSteps[0].nodeId;
    app.onAddNode();
    const added = app.session.document.content.nodes.at(-1)!.id;
    expect(app.session.document.content.nodes).toHaveLength(22);
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual([current]);
    expect(app.pathInspectorOpen).toBe(false);
    expect(app.session.document.content.edges).toHaveLength(62);
    const created = app.session.document.content.edges.at(-1)!;
    expect(created.source).toBe(current);
    expect(created.target).toBe(added);
    app.followPathEdge(created.id);
    expect(app.pathSteps.map((step) => step.nodeId)).toEqual([current, added]);
    expect(app.session.document.content.nodes).toHaveLength(22);
  });

  it('connects an existing block from the path list and deletes its connection', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    const current = app.pathSteps[0].nodeId;
    app.connectPathNode('n2');
    expect(app.pathSteps[0].nodeId).toBe(current);
    const created = app.session.document.content.edges.at(-1)!;
    expect(created.source).toBe(current);
    expect(created.target).toBe('n2');
    app.openPathEdgeInspector(created.id);
    app.onDeleteEdge(created.id);
    expect(app.session.document.content.edges.some((edge) => edge.id === created.id)).toBe(false);
    expect(app.pathInspectorOpen).toBe(false);
  });

  it('serializes all nodes and edges after path navigation and switching modes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const app = fixture.componentInstance;
    app['loadDocument'](flow(21, 61), true);
    app.followPathEdge('e0');
    app.setViewMode('map');
    app.setViewMode('path');
    const serialized = app['documentCodec'].serialize(app.session.document);
    expect(serialized.ok).toBe(true);
    if (serialized.ok) {
      const content = JSON.parse(serialized.value).content;
      expect(content.nodes).toHaveLength(21);
      expect(content.edges).toHaveLength(61);
    }
  });
});
