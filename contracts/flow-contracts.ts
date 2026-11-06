/** Esboço v1 — Editor de fluxos conversacionais. Apenas contratos, sem implementação. */
export type ElementId = string;
export type Side = 'top' | 'right' | 'bottom' | 'left';
export interface Point { x: number; y: number }

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
export interface NodeLayout extends Point { width: number; height: number }
export interface EdgeLayout {
  sourceSide?: Side;
  targetSide?: Side;
  /** Deslocamento em unidades do canvas em relação ao centro da rota. */
  labelOffset?: Point;
}
export interface FlowDocument {
  schemaVersion: 1;
  document: { id: string; title: string; startNodeId?: ElementId };
  content: { nodes: FlowNode[]; edges: FlowEdge[] };
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

/** open usa layout recebido e substitui o documento da sessão. */
export type ImportRequest = { mode: 'open'; json: string };
export interface ImportPlan {
  candidate: FlowDocument;
  addedIds: ElementId[];
  removedIds: ElementId[];
}
export interface DocumentCodec {
  prepareImport(request: ImportRequest): Result<ImportPlan>;
  /** Serializa o documento completo, inclusive layout normalizado. */
  serialize(document: FlowDocument): Result<string>;
}

/** Cada comando válido produz uma entrada no histórico; falha não altera estado. */
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

/** Cópia inclui apenas ligações cujas duas pontas estão nos nós selecionados. */
export interface ClipboardFragment {
  clipboardVersion: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  layout: { nodes: Record<ElementId, NodeLayout>; edges: Record<ElementId, EdgeLayout> };
}
export interface EditorSession {
  document: FlowDocument;
  selection: { nodeIds: ElementId[]; edgeIds: ElementId[] };
  canUndo: boolean;
  canRedo: boolean;
  /** Compara conteúdo e layout com a última abertura/exportação concluída. */
  hasUnexportedChanges: boolean;
}
export interface EditorPort {
  snapshot(): EditorSession;
  execute(command: EditCommand): Result<EditorSession>;
  undo(): Result<EditorSession>;
  redo(): Result<EditorSession>;
  copy(nodeIds: ElementId[]): Result<ClipboardFragment>;
  /** Gera novos IDs e remapeia pontas; uma operação desfazível. */
  paste(fragment: ClipboardFragment, anchor: Point): Result<EditorSession>;
}

/** Cancelamento é distinto de falha. Implementações browser e Tauri são adaptadores. */
export type FileOutcome<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };
export interface FilePort {
  openJson(): Promise<FileOutcome<{ name: string; text: string }>>;
  /** No browser, completed só confirma entrega ao mecanismo de download. */
  downloadJson(name: string, text: string): Promise<FileOutcome<void>>;
}
export interface DraftPort {
  load(): Promise<Result<FlowDocument | null>>;
  save(document: FlowDocument): Promise<Result<void>>;
  clear(): Promise<Result<void>>;
}
/** PNG é capacidade opcional, condicionada ao protótipo offline. */
export interface PngExportPort {
  export(document: FlowDocument, scale: number): Promise<Result<Blob>>;
}
