/** Contratos e tipos de domínio do Editor de Fluxos Conversacionais */

export type ElementId = string;
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

export interface FlowNode {
  id: ElementId;
  title: string;
  description?: string;
  /** Texto literal da fala do agente. Placeholders não são interpretados. */
  message?: string;
}

export interface FlowEdge {
  id: ElementId;
  source: ElementId;
  target: ElementId;
  baseMessage: string;
  description?: string;
  examples?: string[];
}

export interface NodeLayout extends Point {
  width: number;
  height: number;
}

export interface EdgeLayout {
  sourceSide?: Side;
  targetSide?: Side;
  /** Deslocamento em unidades do canvas em relação ao centro da rota. */
  labelOffset?: Point;
}

export interface FlowDocument {
  schemaVersion: 1;
  document: {
    id: string;
    title: string;
    startNodeId?: ElementId;
  };
  content: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
  /** Pode estar ausente ou parcial em documentos criados por LLMs. */
  layout?: {
    nodes?: Record<ElementId, NodeLayout>;
    edges?: Record<ElementId, EdgeLayout>;
    viewport?: Point & { zoom: number };
  };
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  /** JSON Pointer para localizar o problema. */
  path: string;
  message: string;
}

export type Result<T> =
  | { ok: true; value: T; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export type ImportRequest = { mode: 'open'; json: string };

export interface ImportPlan {
  candidate: FlowDocument;
  addedIds: ElementId[];
  removedIds: ElementId[];
}

export type EditCommand =
  | { type: 'add-node'; node: FlowNode; layout: NodeLayout }
  | { type: 'update-node'; id: ElementId; changes: Partial<Omit<FlowNode, 'id'>> }
  | { type: 'add-edge'; edge: FlowEdge; layout?: EdgeLayout }
  | { type: 'update-edge'; id: ElementId; changes: Partial<Omit<FlowEdge, 'id'>> }
  | { type: 'set-node-layouts'; layouts: Record<ElementId, NodeLayout> }
  | { type: 'set-edge-layout'; id: ElementId; layout: EdgeLayout }
  | { type: 'delete-selection'; nodeIds: ElementId[]; edgeIds: ElementId[] }
  | { type: 'update-document'; changes: Partial<Omit<FlowDocument['document'], 'id'>> }
  | { type: 'replace-document'; document: FlowDocument };

export interface ClipboardFragment {
  clipboardVersion: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  layout: {
    nodes: Record<ElementId, NodeLayout>;
    edges: Record<ElementId, EdgeLayout>;
  };
}

/** Respostas copiadas no modo foco, independentes do clipboard do mapa. */
export interface FocusClipboardFragment {
  documentId: string;
  selectedEdgeIds: ElementId[];
  edges: FlowEdge[];
  nodes: FlowNode[];
  layout: {
    nodes: Record<ElementId, NodeLayout>;
    edges: Record<ElementId, EdgeLayout>;
  };
}

export interface EditorSession {
  document: FlowDocument;
  selection: { nodeIds: ElementId[]; edgeIds: ElementId[] };
  canUndo: boolean;
  canRedo: boolean;
  hasUnexportedChanges: boolean;
}

export type FileOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };
