import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  ClipboardFragment,
  EditCommand,
  EditorSession,
  EdgeLayout,
  ElementId,
  FocusClipboardFragment,
  FlowDocument,
  FlowEdge,
  FlowNode,
  NodeLayout,
  Point,
  Result,
} from '../models/flow-contracts';
import { DocumentCodec } from './document-codec';

function generateId(prefix: string): string {
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}-${cryptoObj.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

@Injectable({
  providedIn: 'root',
})
export class EditorEngineService {
  private documentCodec = inject(DocumentCodec);

  private undoStack: FlowDocument[] = [];
  private redoStack: FlowDocument[] = [];
  private baselineDocumentJson: string = '';

  private currentDocument: FlowDocument;
  private currentSelection: { nodeIds: ElementId[]; edgeIds: ElementId[] } = {
    nodeIds: [],
    edgeIds: [],
  };

  private memoryClipboard: ClipboardFragment | null = null;
  private focusClipboard: FocusClipboardFragment | null = null;

  private sessionSubject = new BehaviorSubject<EditorSession>(this.buildSession());
  public session$: Observable<EditorSession> = this.sessionSubject.asObservable();

  constructor() {
    // Documento inicial vazio
    const initialDoc: FlowDocument = {
      schemaVersion: 1,
      document: {
        id: generateId('flow'),
        title: 'Novo Fluxo Conversacional',
      },
      content: {
        nodes: [],
        edges: [],
      },
      layout: {
        nodes: {},
        edges: {},
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };
    this.currentDocument = this.documentCodec.normalizeLayout(initialDoc);
    this.setBaseline(this.currentDocument);
    this.notifySession();
  }

  public getSession(): EditorSession {
    return this.buildSession();
  }

  public setDocument(doc: FlowDocument, setAsBaseline = true): void {
    const normalized = this.documentCodec.normalizeLayout(doc);
    this.currentDocument = normalized;
    this.undoStack = [];
    this.redoStack = [];
    this.currentSelection = { nodeIds: [], edgeIds: [] };
    this.focusClipboard = null;
    if (setAsBaseline) {
      this.setBaseline(normalized);
    }
    this.notifySession();
  }

  private setBaseline(doc: FlowDocument): void {
    const res = this.documentCodec.serialize(doc);
    if (res.ok) {
      this.baselineDocumentJson = res.value;
    }
  }

  public markCurrentAsExported(): void {
    this.setBaseline(this.currentDocument);
    this.notifySession();
  }

  public setSelection(selection: { nodeIds?: ElementId[]; edgeIds?: ElementId[] }): void {
    this.currentSelection = {
      nodeIds: selection.nodeIds ? [...selection.nodeIds] : [],
      edgeIds: selection.edgeIds ? [...selection.edgeIds] : [],
    };
    this.notifySession();
  }

  private pruneSelection(): void {
    const nodes = new Set(this.currentDocument.content.nodes.map((node) => node.id));
    const edges = new Set(this.currentDocument.content.edges.map((edge) => edge.id));
    this.currentSelection = {
      nodeIds: this.currentSelection.nodeIds.filter((id) => nodes.has(id)),
      edgeIds: this.currentSelection.edgeIds.filter((id) => edges.has(id)),
    };
  }

  public setViewport(viewport: Point & { zoom: number }): void {
    if (!this.currentDocument.layout) {
      this.currentDocument.layout = {};
    }
    this.currentDocument.layout.viewport = { ...viewport };
    this.notifySession();
  }

  public execute(command: EditCommand): Result<EditorSession> {
    const nextDoc = this.applyCommand(this.currentDocument, command);
    const diag = this.documentCodec.validateDocument(nextDoc);
    if (diag.some((d) => d.severity === 'error')) {
      return { ok: false, diagnostics: diag };
    }

    // Salvar estado anterior no desfazer
    this.undoStack.push(JSON.parse(JSON.stringify(this.currentDocument)));
    this.redoStack = [];
    this.currentDocument = nextDoc;
    this.pruneSelection();

    this.notifySession();
    return { ok: true, value: this.buildSession(), diagnostics: diag };
  }

  public undo(): Result<EditorSession> {
    if (this.undoStack.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'warning',
            code: 'CANNOT_UNDO',
            path: '/',
            message: 'Não há ações para desfazer.',
          },
        ],
      };
    }

    const previous = this.undoStack.pop()!;
    this.redoStack.push(JSON.parse(JSON.stringify(this.currentDocument)));
    this.currentDocument = previous;
    this.pruneSelection();
    this.notifySession();
    return { ok: true, value: this.buildSession(), diagnostics: [] };
  }

  public redo(): Result<EditorSession> {
    if (this.redoStack.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'warning',
            code: 'CANNOT_REDO',
            path: '/',
            message: 'Não há ações para refazer.',
          },
        ],
      };
    }

    const next = this.redoStack.pop()!;
    this.undoStack.push(JSON.parse(JSON.stringify(this.currentDocument)));
    this.currentDocument = next;
    this.pruneSelection();
    this.notifySession();
    return { ok: true, value: this.buildSession(), diagnostics: [] };
  }

  /** Retorna o fragmento de clipboard em memória, ou null se vazio. */
  public getClipboard(): ClipboardFragment | null {
    return this.memoryClipboard;
  }

  public hasFocusClipboard(): boolean {
    return !!this.focusClipboard?.edges.length;
  }

  public copyFocusResponses(sourceId: ElementId, edgeIds: ElementId[]): Result<FocusClipboardFragment> {
    const selected = new Set(edgeIds);
    const edges = this.currentDocument.content.edges.filter((edge) => edge.source === sourceId && selected.has(edge.id));
    if (!edges.length) return { ok: false, diagnostics: [{ severity: 'warning', code: 'NOTHING_TO_COPY', path: '/', message: 'Selecione respostas deste bloco para copiar.' }] };
    const targetIds = new Set(edges.map((edge) => edge.target));
    const outgoing = this.currentDocument.content.edges.filter((edge) => targetIds.has(edge.source));
    const snapshotIds = new Set([...targetIds, ...outgoing.map((edge) => edge.target)]);
    const fragment: FocusClipboardFragment = {
      documentId: this.currentDocument.document.id,
      selectedEdgeIds: edges.map((edge) => edge.id),
      edges: JSON.parse(JSON.stringify([...edges, ...outgoing.filter((edge) => !selected.has(edge.id))])),
      nodes: JSON.parse(JSON.stringify(this.currentDocument.content.nodes.filter((node) => snapshotIds.has(node.id)))),
      layout: { nodes: {}, edges: {} },
    };
    for (const node of fragment.nodes) {
      const layout = this.currentDocument.layout?.nodes?.[node.id];
      if (layout) fragment.layout.nodes[node.id] = { ...layout };
    }
    for (const edge of fragment.edges) {
      const layout = this.currentDocument.layout?.edges?.[edge.id];
      if (layout) fragment.layout.edges[edge.id] = JSON.parse(JSON.stringify(layout));
    }
    this.focusClipboard = fragment;
    return { ok: true, value: fragment, diagnostics: [] };
  }

  public pasteFocusResponses(sourceId: ElementId): Result<EditorSession> {
    const fragment = this.focusClipboard;
    if (!fragment?.edges.length || !this.currentDocument.content.nodes.some((node) => node.id === sourceId)) {
      return { ok: false, diagnostics: [{ severity: 'warning', code: 'INVALID_FOCUS_CLIPBOARD', path: '/', message: 'Nenhuma resposta copiada para colar neste bloco.' }] };
    }
    if (fragment.documentId !== this.currentDocument.document.id) {
      return { ok: false, diagnostics: [{ severity: 'warning', code: 'FOCUS_CLIPBOARD_OTHER_DOCUMENT', path: '/', message: 'Copie respostas deste fluxo antes de colar.' }] };
    }
    const doc: FlowDocument = JSON.parse(JSON.stringify(this.currentDocument));
    doc.layout ||= {};
    doc.layout.nodes ||= {};
    doc.layout.edges ||= {};
    const nodeById = new Map(doc.content.nodes.map((node) => [node.id, node]));
    const snapshotById = new Map(fragment.nodes.map((node) => [node.id, node]));
    const usedIds = new Set([...nodeById.keys(), ...doc.content.edges.map((edge) => edge.id)]);
    const uniqueId = (prefix: string): string => {
      let id = generateId(prefix);
      while (usedIds.has(id)) id = generateId(prefix);
      usedIds.add(id);
      return id;
    };
    const selectedIds = new Set(fragment.selectedEdgeIds);
    const selectedEdges = fragment.edges.filter((edge) => selectedIds.has(edge.id));
    const connectedTargets = new Set(doc.content.edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target));
    const createdEdgeIds: string[] = [];
    let duplicateIndex = 0;
    const ensureNode = (id: string): boolean => {
      if (nodeById.has(id)) return true;
      const snapshot = snapshotById.get(id);
      if (!snapshot) return false;
      const copy = JSON.parse(JSON.stringify(snapshot)) as FlowNode;
      doc.content.nodes.push(copy);
      nodeById.set(id, copy);
      usedIds.add(id);
      const layout = fragment.layout.nodes[id];
      if (layout) doc.layout!.nodes![id] = { ...layout };
      return true;
    };
    const addEdge = (original: FlowEdge, newSource: string, newTarget: string): void => {
      const id = uniqueId('edge');
      doc.content.edges.push({ ...JSON.parse(JSON.stringify(original)), id, source: newSource, target: newTarget });
      const layout = fragment.layout.edges[original.id];
      if (layout) doc.layout!.edges![id] = JSON.parse(JSON.stringify(layout)) as EdgeLayout;
      createdEdgeIds.push(id);
    };
    for (const edge of selectedEdges) {
      if (!ensureNode(edge.target)) continue;
      let target = edge.target;
      if (connectedTargets.has(target)) {
        const snapshot = snapshotById.get(target) || nodeById.get(target)!;
        const cloneId = uniqueId('node');
        const clone = { ...JSON.parse(JSON.stringify(snapshot)), id: cloneId } as FlowNode;
        doc.content.nodes.push(clone);
        nodeById.set(cloneId, clone);
        const layout = fragment.layout.nodes[target] || doc.layout.nodes[target];
        if (layout) doc.layout.nodes[cloneId] = { ...layout, x: layout.x + 120 + duplicateIndex * 60, y: layout.y + 120 + duplicateIndex * 60 };
        duplicateIndex++;
        for (const outgoing of fragment.edges.filter((item) => item.source === target)) {
          const nextTarget = outgoing.target === target ? cloneId : outgoing.target;
          if (nextTarget !== cloneId && !ensureNode(nextTarget)) continue;
          addEdge(outgoing, cloneId, nextTarget);
        }
        target = cloneId;
      }
      addEdge(edge, sourceId, target);
      connectedTargets.add(target);
    }
    if (!createdEdgeIds.length) return { ok: false, diagnostics: [{ severity: 'warning', code: 'NOTHING_TO_PASTE', path: '/', message: 'As respostas copiadas não possuem destinos válidos.' }] };
    const result = this.execute({ type: 'replace-document', document: doc });
    if (result.ok) this.setSelection({ edgeIds: createdEdgeIds });
    return result;
  }

  public copy(nodeIds: ElementId[]): Result<ClipboardFragment> {
    const selectedNodes = this.currentDocument.content.nodes.filter((n) =>
      nodeIds.includes(n.id)
    );
    if (selectedNodes.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'warning',
            code: 'NOTHING_TO_COPY',
            path: '/',
            message: 'Nenhum nó selecionado para copiar.',
          },
        ],
      };
    }

    const selectedNodeIdsSet = new Set(selectedNodes.map((n) => n.id));
    // Ligações cujas DUAS pontas pertençam à seleção
    const selectedEdges = this.currentDocument.content.edges.filter(
      (e) => selectedNodeIdsSet.has(e.source) && selectedNodeIdsSet.has(e.target)
    );

    const layoutNodes: Record<ElementId, NodeLayout> = {};
    const layoutEdges: Record<ElementId, any> = {};

    selectedNodes.forEach((n) => {
      if (this.currentDocument.layout?.nodes?.[n.id]) {
        layoutNodes[n.id] = { ...this.currentDocument.layout.nodes[n.id] };
      }
    });

    selectedEdges.forEach((e) => {
      if (this.currentDocument.layout?.edges?.[e.id]) {
        layoutEdges[e.id] = { ...this.currentDocument.layout.edges[e.id] };
      }
    });

    const fragment: ClipboardFragment = {
      clipboardVersion: 1,
      nodes: JSON.parse(JSON.stringify(selectedNodes)),
      edges: JSON.parse(JSON.stringify(selectedEdges)),
      layout: {
        nodes: layoutNodes,
        edges: layoutEdges,
      },
    };

    this.memoryClipboard = fragment;

    // Tentar também copiar pro Clipboard do navegador em formato JSON
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        navigator.clipboard.writeText(JSON.stringify(fragment));
      } catch (_) {}
    }

    return { ok: true, value: fragment, diagnostics: [] };
  }

  public paste(fragment: ClipboardFragment, anchor: Point): Result<EditorSession> {
    if (!fragment || fragment.nodes.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'INVALID_CLIPBOARD',
            path: '/',
            message: 'Fragmento de área de transferência vazio ou inválido.',
          },
        ],
      };
    }

    // Calcular BoundingBox do fragmento para deslocar relativo ao anchor
    let minX = Infinity;
    let minY = Infinity;

    fragment.nodes.forEach((n) => {
      const layout = fragment.layout.nodes[n.id];
      if (layout) {
        minX = Math.min(minX, layout.x);
        minY = Math.min(minY, layout.y);
      }
    });

    if (minX === Infinity) minX = 0;
    if (minY === Infinity) minY = 0;

    const idMap = new Map<ElementId, ElementId>();
    const newNodes: FlowNode[] = [];
    const newNodeLayouts: Record<ElementId, NodeLayout> = {};

    fragment.nodes.forEach((oldNode) => {
      const newId = generateId('node');
      idMap.set(oldNode.id, newId);

      const oldLayout = fragment.layout.nodes[oldNode.id] || { x: 0, y: 0, width: 240, height: 120 };
      const offsetX = oldLayout.x - minX;
      const offsetY = oldLayout.y - minY;

      newNodes.push({
        ...oldNode,
        id: newId,
        title: `${oldNode.title} (Cópia)`,
      });

      newNodeLayouts[newId] = {
        x: Math.round((anchor.x + offsetX) / 60) * 60,
        y: Math.round((anchor.y + offsetY) / 60) * 60,
        width: oldLayout.width || 240,
        height: oldLayout.height || 120,
      };
    });

    const newEdges: FlowEdge[] = [];
    fragment.edges.forEach((oldEdge) => {
      const newSource = idMap.get(oldEdge.source);
      const newTarget = idMap.get(oldEdge.target);
      if (newSource && newTarget) {
        const newEdgeId = generateId('edge');
        newEdges.push({
          ...oldEdge,
          id: newEdgeId,
          source: newSource,
          target: newTarget,
        });
      }
    });

    const updatedDoc: FlowDocument = {
      ...this.currentDocument,
      content: {
        nodes: [...this.currentDocument.content.nodes, ...newNodes],
        edges: [...this.currentDocument.content.edges, ...newEdges],
      },
      layout: {
        ...this.currentDocument.layout,
        nodes: {
          ...this.currentDocument.layout?.nodes,
          ...newNodeLayouts,
        },
      },
    };

    // Aplicar como uma única operação de desfazer
    this.undoStack.push(JSON.parse(JSON.stringify(this.currentDocument)));
    this.redoStack = [];
    this.currentDocument = updatedDoc;
    this.currentSelection = {
      nodeIds: newNodes.map((n) => n.id),
      edgeIds: newEdges.map((e) => e.id),
    };

    this.notifySession();
    return { ok: true, value: this.buildSession(), diagnostics: [] };
  }

  private applyCommand(doc: FlowDocument, cmd: EditCommand): FlowDocument {
    const clone: FlowDocument = JSON.parse(JSON.stringify(doc));

    switch (cmd.type) {
      case 'add-node':
        clone.content.nodes.push(cmd.node);
        if (!clone.layout) clone.layout = {};
        if (!clone.layout.nodes) clone.layout.nodes = {};
        clone.layout.nodes[cmd.node.id] = cmd.layout;
        break;

      case 'update-node': {
        const idx = clone.content.nodes.findIndex((n) => n.id === cmd.id);
        if (idx !== -1) {
          clone.content.nodes[idx] = { ...clone.content.nodes[idx], ...cmd.changes };
        }
        break;
      }

      case 'add-edge':
        clone.content.edges.push(cmd.edge);
        if (cmd.layout) {
          if (!clone.layout) clone.layout = {};
          if (!clone.layout.edges) clone.layout.edges = {};
          clone.layout.edges[cmd.edge.id] = cmd.layout;
        }
        break;

      case 'update-edge': {
        const idx = clone.content.edges.findIndex((e) => e.id === cmd.id);
        if (idx !== -1) {
          clone.content.edges[idx] = { ...clone.content.edges[idx], ...cmd.changes };
        }
        break;
      }

      case 'set-node-layouts':
        if (!clone.layout) clone.layout = {};
        if (!clone.layout.nodes) clone.layout.nodes = {};
        clone.layout.nodes = { ...clone.layout.nodes, ...cmd.layouts };
        break;

      case 'set-edge-layout':
        if (!clone.layout) clone.layout = {};
        if (!clone.layout.edges) clone.layout.edges = {};
        clone.layout.edges[cmd.id] = cmd.layout;
        break;

      case 'delete-selection': {
        const nodesToDelete = new Set(cmd.nodeIds);
        const edgesToDelete = new Set(cmd.edgeIds);

        // Remover também ligações incidentes aos nós deletados
        clone.content.edges.forEach((e) => {
          if (nodesToDelete.has(e.source) || nodesToDelete.has(e.target)) {
            edgesToDelete.add(e.id);
          }
        });

        clone.content.nodes = clone.content.nodes.filter((n) => !nodesToDelete.has(n.id));
        clone.content.edges = clone.content.edges.filter((e) => !edgesToDelete.has(e.id));

        if (clone.layout?.nodes) {
          nodesToDelete.forEach((id) => delete clone.layout!.nodes![id]);
        }
        if (clone.layout?.edges) {
          edgesToDelete.forEach((id) => delete clone.layout!.edges![id]);
        }

        if (clone.document.startNodeId && nodesToDelete.has(clone.document.startNodeId)) {
          delete clone.document.startNodeId;
        }
        break;
      }

      case 'update-document':
        clone.document = { ...clone.document, ...cmd.changes };
        break;

      case 'replace-document':
        return this.documentCodec.normalizeLayout(cmd.document);
    }

    return clone;
  }

  private buildSession(): EditorSession {
    const res = this.documentCodec.serialize(this.currentDocument);
    const currentJson = res.ok ? res.value : JSON.stringify(this.currentDocument);
    const hasUnexportedChanges = currentJson !== this.baselineDocumentJson;

    return {
      document: this.currentDocument,
      selection: this.currentSelection,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      hasUnexportedChanges,
    };
  }

  private notifySession(): void {
    this.sessionSubject.next(this.buildSession());
  }
}
