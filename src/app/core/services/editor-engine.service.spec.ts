import { TestBed } from '@angular/core/testing';
import { EditorEngineService } from './editor-engine.service';
import { DocumentCodec } from './document-codec';
import { FlowDocument } from '../models/flow-contracts';

describe('EditorEngineService', () => {
  let service: EditorEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EditorEngineService, DocumentCodec],
    });
    service = TestBed.inject(EditorEngineService);
  });

  it('deve inicializar com sessão limpa e documento básico', () => {
    const session = service.getSession();
    expect(session.document.content.nodes.length).toBe(0);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    expect(session.hasUnexportedChanges).toBe(false);
  });

  it('deve executar comando add-node e permitir Undo/Redo', () => {
    const res = service.execute({
      type: 'add-node',
      node: { id: 'node-1', title: 'Mensagem Agente' },
      layout: { x: 100, y: 100, width: 240, height: 120 },
    });

    expect(res.ok).toBe(true);
    let session = service.getSession();
    expect(session.document.content.nodes.length).toBe(1);
    expect(session.canUndo).toBe(true);
    expect(session.hasUnexportedChanges).toBe(true);

    service.undo();
    session = service.getSession();
    expect(session.document.content.nodes.length).toBe(0);
    expect(session.canRedo).toBe(true);

    service.redo();
    session = service.getSession();
    expect(session.document.content.nodes.length).toBe(1);
  });

  it('deve excluir nó e remover ligações incidentes juntas', () => {
    service.execute({
      type: 'add-node',
      node: { id: 'n1', title: 'N1' },
      layout: { x: 0, y: 0, width: 240, height: 120 },
    });
    service.execute({
      type: 'add-node',
      node: { id: 'n2', title: 'N2' },
      layout: { x: 300, y: 0, width: 240, height: 120 },
    });
    service.execute({
      type: 'add-edge',
      edge: { id: 'e1', source: 'n1', target: 'n2', baseMessage: 'Resposta' },
    });

    expect(service.getSession().document.content.edges.length).toBe(1);

    service.execute({
      type: 'delete-selection',
      nodeIds: ['n1'],
      edgeIds: [],
    });

    const session = service.getSession();
    expect(session.document.content.nodes.length).toBe(1);
    expect(session.document.content.edges.length).toBe(0);
  });

  it('deve copiar e colar selecionados gerando novos IDs e remapeando conexões', () => {
    service.execute({
      type: 'add-node',
      node: { id: 'n1', title: 'N1' },
      layout: { x: 0, y: 0, width: 240, height: 120 },
    });
    service.execute({
      type: 'add-node',
      node: { id: 'n2', title: 'N2' },
      layout: { x: 300, y: 0, width: 240, height: 120 },
    });
    service.execute({
      type: 'add-edge',
      edge: { id: 'e1', source: 'n1', target: 'n2', baseMessage: 'Resposta' },
    });

    const copyRes = service.copy(['n1', 'n2']);
    expect(copyRes.ok).toBe(true);
    if (copyRes.ok) {
      const fragment = copyRes.value;
      expect(fragment.nodes.length).toBe(2);
      expect(fragment.edges.length).toBe(1);

      const pasteRes = service.paste(fragment, { x: 600, y: 200 });
      expect(pasteRes.ok).toBe(true);

      const session = service.getSession();
      expect(session.document.content.nodes.length).toBe(4);
      expect(session.document.content.edges.length).toBe(2);
    }
  });

  it('cola respostas no foco reutilizando destinos e preservando metadados', () => {
    const flow: FlowDocument = {
      schemaVersion: 1,
      document: { id: 'focus-test', title: 'Teste', startNodeId: 'source' },
      content: {
        nodes: [
          { id: 'source', title: 'Origem' }, { id: 'target', title: 'Destino' },
          { id: 'other', title: 'Outra origem' }, { id: 'downstream', title: 'Próximo' },
        ],
        edges: [
          { id: 'response', source: 'source', target: 'target', baseMessage: 'Sim', description: 'Detalhe', examples: ['Claro'] },
          { id: 'next', source: 'target', target: 'downstream', baseMessage: 'Continuar' },
        ],
      },
      layout: { nodes: {}, edges: { response: { sourceSide: 'right', labelOffset: { x: 10, y: 2 } } } },
    };
    service.setDocument(flow);
    expect(service.copyFocusResponses('source', ['response']).ok).toBe(true);
    expect(service.pasteFocusResponses('other').ok).toBe(true);
    const session = service.getSession();
    expect(session.document.content.nodes).toHaveLength(4);
    const pasted = session.document.content.edges.find((edge) => edge.source === 'other');
    expect(pasted).toMatchObject({ target: 'target', baseMessage: 'Sim', description: 'Detalhe', examples: ['Claro'] });
    expect(pasted?.id).not.toBe('response');
    expect(session.document.layout?.edges?.[pasted!.id]).toEqual(flow.layout?.edges?.['response']);
    service.undo();
    expect(service.getSession().document.content.edges).toHaveLength(2);
    expect(service.getSession().selection.edgeIds).toEqual([]);
  });

  it('duplica destino já conectado e preserva suas respostas imediatas', () => {
    const flow: FlowDocument = {
      schemaVersion: 1,
      document: { id: 'focus-duplicate', title: 'Teste', startNodeId: 'source' },
      content: {
        nodes: [
          { id: 'source', title: 'Origem' }, { id: 'target', title: 'Destino', message: 'Mensagem' },
          { id: 'other', title: 'Outra origem' }, { id: 'downstream', title: 'Próximo' },
        ],
        edges: [
          { id: 'response', source: 'source', target: 'target', baseMessage: 'Sim' },
          { id: 'existing', source: 'other', target: 'target', baseMessage: 'Existente' },
          { id: 'next', source: 'target', target: 'downstream', baseMessage: 'Continuar', examples: ['Vamos'] },
        ],
      },
      layout: { nodes: { target: { x: 300, y: 60, width: 240, height: 120 } }, edges: {} },
    };
    service.setDocument(flow);
    service.copyFocusResponses('source', ['response']);
    expect(service.pasteFocusResponses('other').ok).toBe(true);
    const result = service.getSession().document;
    const pasted = result.content.edges.find((edge) => edge.source === 'other' && edge.baseMessage === 'Sim')!;
    expect(pasted.target).not.toBe('target');
    expect(result.content.nodes.find((node) => node.id === pasted.target)).toMatchObject({ title: 'Destino', message: 'Mensagem' });
    expect(result.content.edges.find((edge) => edge.source === pasted.target)).toMatchObject({ target: 'downstream', baseMessage: 'Continuar', examples: ['Vamos'] });
    expect(result.content.edges.find((edge) => edge.id === 'existing')?.target).toBe('target');
    service.undo();
    expect(service.getSession().document.content.nodes).toHaveLength(4);
  });
});
