import { DocumentCodec } from './document-codec';
import { FlowDocument } from '../models/flow-contracts';

describe('DocumentCodec', () => {
  let codec: DocumentCodec;

  beforeEach(() => {
    codec = new DocumentCodec();
  });

  const validMinimalDoc: FlowDocument = {
    schemaVersion: 1,
    document: { id: 'doc-1', title: 'Fluxo Mínimo' },
    content: {
      nodes: [
        { id: 'node-1', title: 'Início' },
        { id: 'node-2', title: 'Fim' },
      ],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2', baseMessage: 'Avançar' }],
    },
  };

  it('deve validar um documento correto sem erros', () => {
    const diagnostics = codec.validateDocument(validMinimalDoc);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('deve detectar IDs duplicados entre blocos e ligações', () => {
    const invalidDoc = {
      ...validMinimalDoc,
      content: {
        nodes: [{ id: 'dup-1', title: 'A' }],
        edges: [{ id: 'dup-1', source: 'dup-1', target: 'dup-1', baseMessage: 'L' }],
      },
    };
    const diagnostics = codec.validateDocument(invalidDoc);
    const errors = diagnostics.filter((d) => d.code === 'DUPLICATE_ID');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('deve detectar ligação com origem ou destino inexistente', () => {
    const invalidDoc = {
      ...validMinimalDoc,
      content: {
        nodes: [{ id: 'node-1', title: 'A' }],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'node-ghost', baseMessage: 'L' }],
      },
    };
    const diagnostics = codec.validateDocument(invalidDoc);
    const errors = diagnostics.filter((d) => d.code === 'MISSING_TARGET_NODE');
    expect(errors.length).toBe(1);
  });

  it('deve posicionar automaticamente blocos sem layout sem colisão', () => {
    const normalized = codec.normalizeLayout(validMinimalDoc);
    expect(normalized.layout?.nodes?.['node-1']).toBeDefined();
    expect(normalized.layout?.nodes?.['node-2']).toBeDefined();
    expect(normalized.layout?.nodes?.['node-1'].x).not.toBe(
      normalized.layout?.nodes?.['node-2'].x
    );
  });
});
