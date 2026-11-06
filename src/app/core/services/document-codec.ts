import { Injectable } from '@angular/core';
import {
  Diagnostic,
  ElementId,
  FlowDocument,
  FlowEdge,
  FlowNode,
  ImportPlan,
  ImportRequest,
  NodeLayout,
  Result,
} from '../models/flow-contracts';

const DEFAULT_NODE_WIDTH = 240;
const DEFAULT_NODE_HEIGHT = 120;
const GRID_STEP_X = 420;
const GRID_STEP_Y = 220;
const GRID_SAFETY_MARGIN = 60;
const GRID_COLUMNS = 5;
const ROOT_KEYS = ['schemaVersion', 'document', 'content', 'layout'];
const DOCUMENT_KEYS = ['id', 'title', 'startNodeId'];
const CONTENT_KEYS = ['nodes', 'edges'];
const NODE_KEYS = ['id', 'title', 'description', 'message'];
const EDGE_KEYS = ['id', 'source', 'target', 'description', 'baseMessage', 'examples'];
const LAYOUT_KEYS = ['nodes', 'edges', 'viewport'];
const NODE_LAYOUT_KEYS = ['x', 'y', 'width', 'height'];
const EDGE_LAYOUT_KEYS = ['sourceSide', 'targetSide', 'labelOffset'];
const VIEWPORT_KEYS = ['x', 'y', 'zoom'];
const SIDES = ['top', 'right', 'bottom', 'left'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateKnownKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  diagnostics: Diagnostic[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      diagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_FIELD',
        path: `${path}/${key}`,
        message: `Campo desconhecido não permitido: "${key}".`,
      });
    }
  }
}

function validateRequiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
  options: { minLength?: number; code?: string } = {}
): void {
  const raw = value[key];
  if (typeof raw !== 'string' || (options.minLength && raw.length < options.minLength)) {
    diagnostics.push({
      severity: 'error',
      code: options.code || 'INVALID_STRING',
      path: `${path}/${key}`,
      message:
        options.minLength === 1
          ? `Campo "${key}" é obrigatório e deve ser uma string não vazia.`
          : `Campo "${key}" é obrigatório e deve ser uma string.`,
    });
  }
}

function validateOptionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
  options: { minLength?: number } = {}
): void {
  if (!(key in value)) return;
  const raw = value[key];
  if (typeof raw !== 'string' || (options.minLength && raw.length < options.minLength)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_OPTIONAL_STRING',
      path: `${path}/${key}`,
      message:
        options.minLength === 1
          ? `Campo opcional "${key}" deve ser uma string não vazia quando informado.`
          : `Campo opcional "${key}" deve ser uma string quando informado.`,
    });
  }
}

@Injectable({
  providedIn: 'root',
})
export class DocumentCodec {
  /** Serializa o documento para JSON formatado */
  public serialize(document: FlowDocument): Result<string> {
    const diagnostics = this.validateDocument(document);
    if (diagnostics.some((d) => d.severity === 'error')) {
      return { ok: false, diagnostics };
    }
    try {
      const json = JSON.stringify(document, null, 2);
      return { ok: true, value: json, diagnostics };
    } catch (err: any) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'SERIALIZATION_FAILED',
            path: '/',
            message: `Falha ao serializar JSON: ${err.message}`,
          },
        ],
      };
    }
  }

  /** Prepara a importação verificando e normalizando o layout */
  public prepareImport(request: ImportRequest): Result<ImportPlan> {
    let parsed: any;
    try {
      parsed = JSON.parse(request.json);
    } catch (e: any) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'INVALID_JSON',
            path: '/',
            message: `Sintaxe JSON inválida: ${e.message}`,
          },
        ],
      };
    }

    const diagnostics = this.validateDocument(parsed);
    if (diagnostics.some((d) => d.severity === 'error')) {
      return { ok: false, diagnostics };
    }

    const candidateDoc = parsed as FlowDocument;

    const normalizedDoc = this.normalizeLayout(candidateDoc);
    const nodeIds = normalizedDoc.content.nodes.map((n) => n.id);
    return {
      ok: true,
      value: {
        candidate: normalizedDoc,
        addedIds: nodeIds,
        removedIds: [],
      },
      diagnostics,
    };
  }

  /** Valida rigorosamente a estrutura e integridade de IDs do documento */
  public validateDocument(doc: any): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!isRecord(doc)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_ROOT',
        path: '/',
        message: 'O documento deve ser um objeto JSON válido.',
      });
      return diagnostics;
    }
    const root: any = doc;
    validateKnownKeys(root, ROOT_KEYS, '', diagnostics);

    if (root.schemaVersion !== 1) {
      diagnostics.push({
        severity: 'error',
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        path: '/schemaVersion',
        message: `Versão de esquema não suportada: ${root.schemaVersion}. Esperado: 1.`,
      });
    }

    if (!isRecord(root.document)) {
      diagnostics.push({
        severity: 'error',
        code: 'MISSING_DOCUMENT_HEADER',
        path: '/document',
        message: 'Seção "document" é obrigatória.',
      });
    } else {
      validateKnownKeys(root.document, DOCUMENT_KEYS, '/document', diagnostics);
      validateRequiredString(root.document, 'id', '/document', diagnostics, {
        minLength: 1,
        code: 'INVALID_DOCUMENT_ID',
      });
      validateRequiredString(root.document, 'title', '/document', diagnostics, {
        code: 'INVALID_DOCUMENT_TITLE',
      });
      validateOptionalString(root.document, 'startNodeId', '/document', diagnostics, {
        minLength: 1,
      });
    }

    if (!isRecord(root.content)) {
      diagnostics.push({
        severity: 'error',
        code: 'MISSING_CONTENT',
        path: '/content',
        message: 'Seção "content" é obrigatória.',
      });
      return diagnostics;
    }
    validateKnownKeys(root.content, CONTENT_KEYS, '/content', diagnostics);
    if (!Array.isArray(root.content.nodes)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_NODES',
        path: '/content/nodes',
        message: 'Campo "content.nodes" é obrigatório e deve ser um array.',
      });
    }
    if (!Array.isArray(root.content.edges)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_EDGES',
        path: '/content/edges',
        message: 'Campo "content.edges" é obrigatório e deve ser um array.',
      });
    }

    const nodes: FlowNode[] = Array.isArray(root.content.nodes) ? root.content.nodes : [];
    const edges: FlowEdge[] = Array.isArray(root.content.edges) ? root.content.edges : [];

    const nodeIds = new Set<string>();
    const allIds = new Set<string>();

    nodes.forEach((node, index) => {
      const path = `/content/nodes/${index}`;
      if (!isRecord(node)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_NODE',
          path,
          message: 'Bloco deve ser um objeto.',
        });
        return;
      }
      validateKnownKeys(node, NODE_KEYS, path, diagnostics);
      validateRequiredString(node, 'id', path, diagnostics, {
        minLength: 1,
        code: 'INVALID_NODE_ID',
      });
      validateRequiredString(node, 'title', path, diagnostics, {
        code: 'INVALID_NODE_TITLE',
      });
      validateOptionalString(node, 'description', path, diagnostics);
      validateOptionalString(node, 'message', path, diagnostics);

      if (!node.id || typeof node.id !== 'string') {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_NODE_ID',
          path: `${path}/id`,
          message: 'Bloco possui ID inválido ou ausente.',
        });
      } else {
        if (allIds.has(node.id)) {
          diagnostics.push({
            severity: 'error',
            code: 'DUPLICATE_ID',
            path: `${path}/id`,
            message: `ID duplicado detectado: "${node.id}".`,
          });
        }
        allIds.add(node.id);
        nodeIds.add(node.id);
      }

      if (typeof node.title === 'string' && node.title.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'EMPTY_NODE_TITLE',
          path: `${path}/title`,
          message: `Bloco "${node.id}" está sem título.`,
        });
      }
    });

    edges.forEach((edge, index) => {
      const path = `/content/edges/${index}`;
      if (!isRecord(edge)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_EDGE',
          path,
          message: 'Ligação deve ser um objeto.',
        });
        return;
      }
      validateKnownKeys(edge, EDGE_KEYS, path, diagnostics);
      validateRequiredString(edge, 'id', path, diagnostics, {
        minLength: 1,
        code: 'INVALID_EDGE_ID',
      });
      validateRequiredString(edge, 'source', path, diagnostics, {
        minLength: 1,
        code: 'INVALID_EDGE_SOURCE',
      });
      validateRequiredString(edge, 'target', path, diagnostics, {
        minLength: 1,
        code: 'INVALID_EDGE_TARGET',
      });
      validateRequiredString(edge, 'baseMessage', path, diagnostics, {
        code: 'INVALID_EDGE_BASE_MESSAGE',
      });
      validateOptionalString(edge, 'description', path, diagnostics);
      if ('examples' in edge) {
        if (!Array.isArray(edge.examples)) {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_EXAMPLES',
            path: `${path}/examples`,
            message: 'Campo "examples" deve ser um array de strings.',
          });
        } else {
          edge.examples.forEach((example: unknown, exampleIndex: number) => {
            if (typeof example !== 'string') {
              diagnostics.push({
                severity: 'error',
                code: 'INVALID_EXAMPLE',
                path: `${path}/examples/${exampleIndex}`,
                message: 'Cada exemplo deve ser uma string.',
              });
            }
          });
        }
      }

      if (!edge.id || typeof edge.id !== 'string') {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_EDGE_ID',
          path: `${path}/id`,
          message: 'Ligação possui ID inválido ou ausente.',
        });
      } else {
        if (allIds.has(edge.id)) {
          diagnostics.push({
            severity: 'error',
            code: 'DUPLICATE_ID',
            path: `${path}/id`,
            message: `ID duplicado detectado: "${edge.id}".`,
          });
        }
        allIds.add(edge.id);
      }

      if (typeof edge.source === 'string' && !nodeIds.has(edge.source)) {
        diagnostics.push({
          severity: 'error',
          code: 'MISSING_SOURCE_NODE',
          path: `${path}/source`,
          message: `Origem inexistente "${edge.source}" na ligação "${edge.id}".`,
        });
      }

      if (typeof edge.target === 'string' && !nodeIds.has(edge.target)) {
        diagnostics.push({
          severity: 'error',
          code: 'MISSING_TARGET_NODE',
          path: `${path}/target`,
          message: `Destino inexistente "${edge.target}" na ligação "${edge.id}".`,
        });
      }

      if (typeof edge.baseMessage === 'string' && edge.baseMessage.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'EMPTY_EDGE_BASE_MESSAGE',
          path: `${path}/baseMessage`,
          message: `Ligação "${edge.id}" está sem mensagem base.`,
        });
      }
    });

    if (root.document?.startNodeId && !nodeIds.has(root.document.startNodeId)) {
      diagnostics.push({
        severity: 'error',
        code: 'MISSING_START_NODE',
        path: '/document/startNodeId',
        message: `Ponto inicial declarado "${root.document.startNodeId}" não existe entre os blocos.`,
      });
    }

    this.validateLayout(root, nodeIds, new Set(edges.map((edge) => edge.id)), diagnostics);

    return diagnostics;
  }

  private validateLayout(
    doc: any,
    nodeIds: Set<string>,
    edgeIds: Set<string>,
    diagnostics: Diagnostic[]
  ): void {
    if (!('layout' in doc)) return;
    const layoutRoot = doc.layout;
    if (!isRecord(layoutRoot)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_LAYOUT',
        path: '/layout',
        message: 'Campo "layout" deve ser um objeto quando informado.',
      });
      return;
    }

    validateKnownKeys(layoutRoot, LAYOUT_KEYS, '/layout', diagnostics);

    if ('nodes' in layoutRoot) {
      const layoutNodes = layoutRoot['nodes'];
      if (!isRecord(layoutNodes)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_LAYOUT_NODES',
          path: '/layout/nodes',
          message: 'Campo "layout.nodes" deve ser um objeto.',
        });
      } else {
        for (const [id, layout] of Object.entries(layoutNodes)) {
          const path = `/layout/nodes/${id}`;
          if (!nodeIds.has(id)) {
            diagnostics.push({
              severity: 'error',
              code: 'LAYOUT_NODE_WITHOUT_CONTENT',
              path,
              message: `Layout declarado para bloco inexistente "${id}".`,
            });
          }
          this.validateNodeLayout(layout, path, diagnostics);
        }
      }
    }

    if ('edges' in layoutRoot) {
      const layoutEdges = layoutRoot['edges'];
      if (!isRecord(layoutEdges)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_LAYOUT_EDGES',
          path: '/layout/edges',
          message: 'Campo "layout.edges" deve ser um objeto.',
        });
      } else {
        for (const [id, layout] of Object.entries(layoutEdges)) {
          const path = `/layout/edges/${id}`;
          if (!edgeIds.has(id)) {
            diagnostics.push({
              severity: 'error',
              code: 'LAYOUT_EDGE_WITHOUT_CONTENT',
              path,
              message: `Layout declarado para ligação inexistente "${id}".`,
            });
          }
          this.validateEdgeLayout(layout, path, diagnostics);
        }
      }
    }

    if ('viewport' in layoutRoot) {
      this.validateViewport(layoutRoot['viewport'], '/layout/viewport', diagnostics);
    }
  }

  private validateNodeLayout(layout: unknown, path: string, diagnostics: Diagnostic[]): void {
    if (!isRecord(layout)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_NODE_LAYOUT',
        path,
        message: 'Layout de bloco deve ser um objeto.',
      });
      return;
    }
    validateKnownKeys(layout, NODE_LAYOUT_KEYS, path, diagnostics);
    for (const key of NODE_LAYOUT_KEYS) {
      const value = layout[key];
      if (!isFiniteNumber(value) || ((key === 'width' || key === 'height') && value <= 0)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_NODE_LAYOUT_VALUE',
          path: `${path}/${key}`,
          message: `Valor de layout inválido para "${key}".`,
        });
      }
    }
  }

  private validateEdgeLayout(layout: unknown, path: string, diagnostics: Diagnostic[]): void {
    if (!isRecord(layout)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_EDGE_LAYOUT',
        path,
        message: 'Layout de ligação deve ser um objeto.',
      });
      return;
    }
    validateKnownKeys(layout, EDGE_LAYOUT_KEYS, path, diagnostics);
    for (const sideKey of ['sourceSide', 'targetSide']) {
      if (sideKey in layout && !SIDES.includes(String(layout[sideKey]))) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_EDGE_SIDE',
          path: `${path}/${sideKey}`,
          message: `Lado de conexão inválido em "${sideKey}".`,
        });
      }
    }
    if ('labelOffset' in layout) {
      const labelOffset = layout['labelOffset'];
      if (!isRecord(labelOffset)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_LABEL_OFFSET',
          path: `${path}/labelOffset`,
          message: 'labelOffset deve ser um objeto.',
        });
      } else {
        validateKnownKeys(labelOffset, ['x', 'y'], `${path}/labelOffset`, diagnostics);
        for (const key of ['x', 'y']) {
          if (!isFiniteNumber(labelOffset[key])) {
            diagnostics.push({
              severity: 'error',
              code: 'INVALID_LABEL_OFFSET_VALUE',
              path: `${path}/labelOffset/${key}`,
              message: `Valor inválido para labelOffset.${key}.`,
            });
          }
        }
      }
    }
  }

  private validateViewport(viewport: unknown, path: string, diagnostics: Diagnostic[]): void {
    if (!isRecord(viewport)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_VIEWPORT',
        path,
        message: 'Viewport deve ser um objeto.',
      });
      return;
    }
    validateKnownKeys(viewport, VIEWPORT_KEYS, path, diagnostics);
    for (const key of VIEWPORT_KEYS) {
      const value = viewport[key];
      if (!isFiniteNumber(value) || (key === 'zoom' && value <= 0)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_VIEWPORT_VALUE',
          path: `${path}/${key}`,
          message: `Valor de viewport inválido para "${key}".`,
        });
      }
    }
  }

  /** Normaliza o layout completando coordenadas ausentes sem sobreposição */
  public normalizeLayout(doc: FlowDocument): FlowDocument {
    const layoutNodes: Record<ElementId, NodeLayout> = { ...(doc.layout?.nodes || {}) };
    const occupiedPositions: Array<{ x: number; y: number; width: number; height: number }> = [];

    // Registrar posições já existentes
    Object.values(layoutNodes).forEach((l) => {
      if (typeof l.x === 'number' && typeof l.y === 'number') {
        occupiedPositions.push({
          x: l.x,
          y: l.y,
          width: l.width ?? DEFAULT_NODE_WIDTH,
          height: l.height ?? DEFAULT_NODE_HEIGHT,
        });
      }
    });

    let currentGridRow = 0;
    let currentGridCol = 0;

    for (const node of doc.content.nodes) {
      if (!layoutNodes[node.id] || typeof layoutNodes[node.id].x !== 'number') {
        let placed = false;
        while (!placed) {
          const testX = GRID_SAFETY_MARGIN + currentGridCol * GRID_STEP_X;
          const testY = GRID_SAFETY_MARGIN + currentGridRow * GRID_STEP_Y;

          const collides = occupiedPositions.some(
            (pos) =>
              Math.abs(pos.x - testX) < DEFAULT_NODE_WIDTH + GRID_SAFETY_MARGIN &&
              Math.abs(pos.y - testY) < DEFAULT_NODE_HEIGHT + GRID_SAFETY_MARGIN
          );

          if (!collides) {
            layoutNodes[node.id] = {
              x: testX,
              y: testY,
              width: DEFAULT_NODE_WIDTH,
              height: DEFAULT_NODE_HEIGHT,
            };
            occupiedPositions.push({
              x: testX,
              y: testY,
              width: DEFAULT_NODE_WIDTH,
              height: DEFAULT_NODE_HEIGHT,
            });
            placed = true;
          }

          currentGridCol++;
          if (currentGridCol >= GRID_COLUMNS) {
            currentGridCol = 0;
            currentGridRow++;
          }
        }
      } else {
        // Garantir largura/altura padrão caso faltem
        layoutNodes[node.id] = {
          x: layoutNodes[node.id].x,
          y: layoutNodes[node.id].y,
          width: layoutNodes[node.id].width ?? DEFAULT_NODE_WIDTH,
          height: layoutNodes[node.id].height ?? DEFAULT_NODE_HEIGHT,
        };
      }
    }

    return {
      ...doc,
      layout: {
        viewport: doc.layout?.viewport || { x: 0, y: 0, zoom: 1 },
        nodes: layoutNodes,
        edges: doc.layout?.edges || {},
      },
    };
  }
}
