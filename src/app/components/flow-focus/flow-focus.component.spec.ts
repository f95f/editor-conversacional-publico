import { FlowDocument } from '../../core/models/flow-contracts';
import { FlowFocusComponent } from './flow-focus.component';

const document: FlowDocument = {
  schemaVersion: 1,
  document: { id: 'test', title: 'Teste', startNodeId: 'a' },
  content: {
    nodes: [
      { id: 'a', title: 'Oferta', message: 'Qual valor é viável?' },
      { id: 'b', title: 'Final', message: 'Obrigado' },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', baseMessage: 'Aceito' },
      { id: 'e2', source: 'a', target: 'b', baseMessage: 'Quero pensar' },
      { id: 'e3', source: 'b', target: 'a', baseMessage: 'Voltar' },
    ],
  },
};

describe('FlowFocusComponent', () => {
  let component: FlowFocusComponent;

  beforeEach(() => {
    component = new FlowFocusComponent();
    component.document = document;
    component.activeNodeId = 'a';
  });

  it('lists parallel exits separately and keeps the cycle as an incoming transition', () => {
    expect(component.outgoing.map((edge) => edge.id)).toEqual(['e1', 'e2']);
    expect(component.incoming.map((edge) => edge.id)).toEqual(['e3']);
  });

  it('limpa a seleção ao clicar no espaço vazio sem Ctrl', () => {
    const clear = vi.spyOn(component.clearSelection, 'emit');
    const background = globalThis.document.createElement('div');
    component.onWorkspaceClick({ ctrlKey: false, metaKey: false, target: background } as unknown as MouseEvent);
    expect(clear).toHaveBeenCalledOnce();
    component.onWorkspaceClick({ ctrlKey: true, metaKey: false, target: background } as unknown as MouseEvent);
    expect(clear).toHaveBeenCalledOnce();
  });

  it('searches nodes and edges, including text without accents', () => {
    component.query = 'viavel';
    expect(component.searchResults.map((result) => result.kind)).toEqual(['node']);
    component.query = 'quero pensar';
    expect(component.searchResults.map((result) => result.kind)).toEqual(['edge']);
  });

  it('opens the source and selects the exact matching edge', () => {
    component.query = 'quero pensar';
    const navigate = vi.spyOn(component.navigate, 'emit');
    const selectEdge = vi.spyOn(component.selectEdge, 'emit');
    const queryChange = vi.spyOn(component.queryChange, 'emit');

    component.selectSearchResult(component.searchResults[0]);

    expect(navigate).toHaveBeenCalledWith('a');
    expect(selectEdge).toHaveBeenCalledWith('e2');
    expect(queryChange).toHaveBeenCalledWith('');
  });

  it('updates response results after an edit', () => {
    component.responseFilter = 'aceito';
    expect(component.outgoing.map((edge) => edge.id)).toEqual(['e1']);
    component.document = {
      ...document,
      content: { ...document.content, edges: document.content.edges.filter((edge) => edge.id !== 'e1') },
    };
    expect(component.outgoing).toEqual([]);
  });

  it('limits large indexes and search results without losing the active block', () => {
    component.document = {
      ...document,
      content: { nodes: Array.from({ length: 180 }, (_, i) => ({ id: `n${i}`, title: `Bloco ${i}` })), edges: [] },
    };
    component.activeNodeId = 'n179';
    component.query = 'bloco';
    expect(component.indexNodes).toHaveLength(101);
    expect(component.indexNodes[0].id).toBe('n179');
    expect(component.searchResults).toHaveLength(180);
    expect(component.shownResults).toHaveLength(50);
  });

  it('uses the agent message as block list preview', () => {
    expect(component.nodePreview(document.content.nodes[0])).toBe('Qual valor é viável?');
    expect(component.nodePreview({ id: 'empty', title: 'Sem fala' })).toBe('Sem mensagem do agente.');
  });

  it('creates a response only after text and a valid target are selected', () => {
    const emit = vi.spyOn(component.addEdge, 'emit');
    component.beginAddResponse();
    component.draftMessage = 'Concordo';
    component.createResponse();
    expect(emit).not.toHaveBeenCalled();
    component.chooseDraftTarget(document.content.nodes[1]);
    component.createResponse();
    expect(emit).toHaveBeenCalledWith({ source: 'a', target: 'b', baseMessage: 'Concordo' });
  });

  it('updates a mapped target and emits edits to its block', () => {
    const updateEdge = vi.spyOn(component.updateEdge, 'emit');
    const updateNode = vi.spyOn(component.updateNode, 'emit');
    component.chooseTarget('e1', document.content.nodes[0]);
    component.changeMappedNode('b', { title: 'Novo título' });
    expect(updateEdge).toHaveBeenCalledWith({ id: 'e1', changes: { target: 'a' } });
    expect(updateNode).toHaveBeenCalledWith({ id: 'b', changes: { title: 'Novo título' } });
  });

  it('accepts a dragged block as an existing response destination', () => {
    const transfer = {
      data: new Map<string, string>(),
      setData(type: string, value: string) { this.data.set(type, value); },
      getData(type: string) { return this.data.get(type) || ''; },
      effectAllowed: '',
    };
    const event = { dataTransfer: transfer, preventDefault: vi.fn() } as unknown as DragEvent;
    const update = vi.spyOn(component.updateEdge, 'emit');
    component.dragNode(event, document.content.nodes[1]);
    component.allowDrop(event, 'e1');
    component.dropNode(event, 'e1');
    expect(update).toHaveBeenCalledWith({ id: 'e1', changes: { target: 'b' } });
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
