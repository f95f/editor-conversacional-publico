import { ChangeDetectorRef, Component, DestroyRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocalFlow, LocalFlowsService } from './core/services/local-flows.service';
import { HeaderPanelComponent } from './components/header-panel/header-panel.component';
import { ZoomControlsComponent } from './components/zoom-controls/zoom-controls.component';
import { PropertyPanelComponent } from './components/property-panel/property-panel.component';
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  CANVAS_ZOOM_STEP,
  FlowCanvasComponent,
} from './components/flow-canvas/flow-canvas.component';
import { ToolbarPanelComponent } from './components/toolbar-panel/toolbar-panel.component';
import { FlowFocusComponent } from './components/flow-focus/flow-focus.component';
import { FlowPathComponent, PathStep } from './components/flow-path/flow-path.component';

import { EditorEngineService } from './core/services/editor-engine.service';
import { FileStorageService } from './core/services/file-storage.service';
import { DocumentCodec } from './core/services/document-codec';

import {
  EditorSession,
  FlowDocument,
  FlowEdge,
  FlowNode,
  NodeLayout,
} from './core/models/flow-contracts';

const EXAMPLE_CONFIRMACAO_NOME: FlowDocument = {
  schemaVersion: 1,
  document: {
    id: 'confirmacao-nome',
    title: 'Confirmação de nome',
    startNodeId: 'pergunta',
  },
  content: {
    nodes: [
      {
        id: 'pergunta',
        title: 'Confirma o nome',
        message: 'Olá, falo com {{cliente_nome}}?',
      },
      {
        id: 'apresentacao',
        title: 'Apresenta o agente',
        message: 'Sou {{agente_nome}}, da {{empresa}}. Podemos conversar?',
      },
      {
        id: 'repeticao',
        title: 'Repete a pergunta',
        message: 'Preciso confirmar: você é {{cliente_nome}}?',
      },
      {
        id: 'encerramento',
        title: 'Encerra a conversa',
        message: 'Obrigado pelo retorno. Encerramos por aqui.',
      },
    ],
    edges: [
      {
        id: 'confirma',
        source: 'pergunta',
        target: 'apresentacao',
        baseMessage: 'Sim, sou eu.',
        examples: ['Sim', 'Ele mesmo'],
      },
      {
        id: 'pessoa-errada',
        source: 'pergunta',
        target: 'encerramento',
        baseMessage: 'Não sou eu.',
        examples: ['Não sou eu'],
      },
      {
        id: 'repetir',
        source: 'pergunta',
        target: 'repeticao',
        baseMessage: 'Pode repetir?',
        description: 'O autor define e descreve o limite aplicável.',
        examples: ['Pode repetir?'],
      },
      {
        id: 'limite',
        source: 'pergunta',
        target: 'encerramento',
        baseMessage: 'Pode repetir?',
      },
      {
        id: 'retorno',
        source: 'repeticao',
        target: 'pergunta',
        baseMessage: 'Entendi.',
      },
      {
        id: 'nao-quer',
        source: 'apresentacao',
        target: 'encerramento',
        baseMessage: 'Não quero contato.',
      },
    ],
  },
  layout: {
    nodes: {
      pergunta: { x: 60, y: 60, width: 240, height: 120 },
      apresentacao: { x: 480, y: 60, width: 240, height: 120 },
      repeticao: { x: 480, y: 280, width: 240, height: 120 },
      encerramento: { x: 900, y: 170, width: 240, height: 120 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  },
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderPanelComponent,
    ZoomControlsComponent,
    PropertyPanelComponent,
    FlowCanvasComponent,
    FlowFocusComponent,
    FlowPathComponent,
    ToolbarPanelComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent implements OnInit {
  @ViewChild(FlowCanvasComponent) public flowCanvas?: FlowCanvasComponent;
  @ViewChild(FlowPathComponent) public flowPath?: FlowPathComponent;
  private editorEngine = inject(EditorEngineService);
  private fileStorage = inject(FileStorageService);
  private documentCodec = inject(DocumentCodec);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private localFlows = inject(LocalFlowsService);
  private destroyRef = inject(DestroyRef);
  public savedFlows: LocalFlow[] = [];
  public activeFlowKey: string | null = null;
  public flowsSidebarOpen = true;
  public localSaveError = '';
  private localStorageReadable = true;
  private lastSavedDocument: FlowDocument | null = null;

  public session: EditorSession = this.editorEngine.getSession();
  public zoom: number = 1.0;
  public isDarkTheme: boolean = true;
  public viewMode: 'path' | 'focus' | 'map' = 'map';
  public pathSteps: PathStep[] = [];
  public pathNavigationTick = 0;
  public pathNavigationDirection: 'forward' | 'back' | 'reset' = 'reset';
  public pathResetEpoch = 0;
  public pathInspectorOpen = false;
  private pathSequence = 0;
  public focusNodeId: string | null = null;
  public focusHistory: string[] = [];
  public focusQuery = '';
  public responseFilter = '';
  private indexedDocument: FlowDocument | null = null;
  private nodeById = new Map<string, FlowNode>();
  private edgeById = new Map<string, FlowEdge>();

  public isOpeningDocument: boolean = false;
  public draftRecovered: boolean = false;
  public noticeDialog: { title: string; message: string } | null = null;
  public swapDialog: { resolve: (value: 'save' | 'discard' | 'cancel') => void } | null =
    null;

  public ngOnInit(): void {
    const draftRes = this.fileStorage.loadDraft();
    try {
      const stored = this.localFlows.load();
      if (stored) {
        this.savedFlows = stored.flows;
        const active = stored.flows.find((flow) => flow.key === stored.activeKey) || stored.flows[0];
        if (active) {
          this.activeFlowKey = active.key;
          this.loadDocument(active.document, false);
          this.draftRecovered = true;
        }
      }
    } catch {
      this.localStorageReadable = false;
      this.localSaveError = 'Não foi possível ler os fluxos locais. Os dados existentes foram preservados. Exporte suas edições para guardá-las.';
    }
    if (!this.activeFlowKey) {
      const recovered = draftRes.ok && draftRes.value
        ? this.documentCodec.prepareImport({ mode: 'open', json: JSON.stringify(draftRes.value) })
        : null;
      this.loadDocument(recovered?.ok ? recovered.value.candidate : EXAMPLE_CONFIRMACAO_NOME, !recovered?.ok);
      this.draftRecovered = !!recovered?.ok;
      this.activeFlowKey = crypto.randomUUID();
    }
    this.editorEngine.session$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((session) => {
      this.session = session;
      if (this.indexedDocument !== session.document) {
        this.indexedDocument = session.document;
        this.nodeById = new Map(session.document.content.nodes.map((node) => [node.id, node]));
        this.edgeById = new Map(session.document.content.edges.map((edge) => [edge.id, edge]));
        this.reconcileFocus();
        this.reconcilePath();
      }
      if (this.lastSavedDocument !== session.document) this.saveLocalFlow();
      this.changeDetectorRef.markForCheck();
    });
  }

  private saveLocalFlow(): boolean {
    const entry: LocalFlow = {
      key: this.activeFlowKey!, document: this.session.document, updatedAt: new Date().toISOString(),
    };
    this.savedFlows = [entry, ...this.savedFlows.filter((flow) => flow.key !== entry.key)];
    if (!this.localStorageReadable) return false;
    try {
      this.localFlows.save({ activeKey: this.activeFlowKey, flows: this.savedFlows });
      this.lastSavedDocument = this.session.document;
      this.localSaveError = '';
      return true;
    } catch {
      this.localSaveError = 'Não foi possível salvar no navegador. Exporte o fluxo para guardar suas edições.';
      return false;
    }
  }

  public selectLocalFlow(key: string): void {
    if (key === this.activeFlowKey || !this.saveLocalFlow()) return;
    const flow = this.savedFlows.find((entry) => entry.key === key);
    if (!flow) return;
    this.activeFlowKey = key;
    this.loadDocument(flow.document, false);
    this.draftRecovered = true;
  }

  private openAsLocalFlow(doc: FlowDocument): void {
    this.activeFlowKey = crypto.randomUUID();
    this.loadDocument(doc, true);
  }

  @HostListener('window:keydown', ['$event'])
  public handleGlobalShortcuts(event: KeyboardEvent): void {
    const isCtrl = event.ctrlKey || event.metaKey;
    const isEditingText = this.isTextEditing();

    if (isEditingText) {
      return;
    }

    if (isCtrl && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.onRedo();
      } else {
        this.onUndo();
      }
    } else if (isCtrl && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.onRedo();
    } else if (this.viewMode === 'map' && isCtrl && event.key.toLowerCase() === 'c') {
      if (this.session.selection.nodeIds.length > 0) {
        event.preventDefault();
        this.onCopy();
      }
    } else if (this.viewMode === 'map' && isCtrl && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.onPaste();
    } else if (this.viewMode === 'focus' && isCtrl && event.key.toLowerCase() === 'c') {
      if (this.focusNodeId && this.session.selection.edgeIds.some((id) => this.edgeById.get(id)?.source === this.focusNodeId)) {
        event.preventDefault();
        this.editorEngine.copyFocusResponses(this.focusNodeId, this.session.selection.edgeIds);
      }
    } else if (this.viewMode === 'focus' && isCtrl && event.key.toLowerCase() === 'v') {
      if (this.focusNodeId && this.editorEngine.hasFocusClipboard()) {
        event.preventDefault();
        this.editorEngine.pasteFocusResponses(this.focusNodeId);
      }
    } else if (this.viewMode === 'path' && isCtrl && event.key.toLowerCase() === 'c') {
      const source = this.pathSteps.at(-1)?.nodeId;
      if (source && this.session.selection.edgeIds.some((id) => this.edgeById.get(id)?.source === source)) {
        event.preventDefault();
        this.editorEngine.copyFocusResponses(source, this.session.selection.edgeIds);
      }
    } else if (this.viewMode === 'path' && isCtrl && event.key.toLowerCase() === 'v') {
      const source = this.pathSteps.at(-1)?.nodeId;
      if (source && this.editorEngine.hasFocusClipboard()) {
        event.preventDefault();
        this.editorEngine.pasteFocusResponses(source);
      }
    } else if (this.viewMode === 'map' && (event.key === 'Delete' || event.key === 'Backspace')) {
      // Evitar deletar nós quando estiver digitando em um campo de texto
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;
      if (!isInput && this.hasAnySelection()) {
        event.preventDefault();
        this.onDeleteSelection();
      }
    }
  }

  private isTextEditing(): boolean {
    const activeElement = document.activeElement;
    return (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      activeElement?.getAttribute('contenteditable') === 'true'
    );
  }

  private async confirmDocumentSwap(): Promise<boolean> {
    if (this.saveLocalFlow()) return true;
    if (!this.session.hasUnexportedChanges) {
      return true;
    }

    const choice = await this.askUnsavedChangesAction();
    if (choice === 'cancel') {
      return false;
    }
    if (choice === 'discard') {
      return true;
    }

    return await this.onExportDocument();
  }

  private askUnsavedChangesAction(): Promise<'save' | 'discard' | 'cancel'> {
    return new Promise((resolve) => {
      this.swapDialog = { resolve };
    });
  }

  public resolveSwapDialog(action: 'save' | 'discard' | 'cancel'): void {
    const dialog = this.swapDialog;
    this.swapDialog = null;
    dialog?.resolve(action);
  }

  private showNotice(title: string, message: string): void {
    this.noticeDialog = { title, message };
  }

  public getSelectedNode(): FlowNode | null {
    if (this.session.selection.nodeIds.length === 1) {
      const id = this.session.selection.nodeIds[0];
      return this.nodeById.get(id) || null;
    }
    return null;
  }

  public getSelectedEdge(): FlowEdge | null {
    if (this.session.selection.edgeIds.length === 1) {
      const id = this.session.selection.edgeIds[0];
      return this.edgeById.get(id) || null;
    }
    return null;
  }

  public hasAnySelection(): boolean {
    return (
      this.session.selection.nodeIds.length > 0 || this.session.selection.edgeIds.length > 0
    );
  }

  public onTitleChange(newTitle: string): void {
    this.editorEngine.execute({
      type: 'update-document',
      changes: { title: newTitle },
    });
  }

  public async onNewDocument(): Promise<void> {
    if (!(await this.confirmDocumentSwap())) {
      return;
    }
    const newDoc: FlowDocument = {
      schemaVersion: 1,
      document: {
        id: `flow-${Math.random().toString(36).substring(2, 9)}`,
        title: 'Novo Fluxo Conversacional',
      },
      content: { nodes: [], edges: [] },
      layout: { nodes: {}, edges: {}, viewport: { x: 0, y: 0, zoom: 1 } },
    };
    this.openAsLocalFlow(newDoc);
    this.draftRecovered = false;
  }

  public async onOpenDocument(): Promise<void> {
    if (this.session.hasUnexportedChanges && !(await this.confirmDocumentSwap())) {
      return;
    }
    this.isOpeningDocument = true;
    try {
      // O seletor precisa ser aberto no mesmo gesto do clique quando nao ha confirmacao pendente.
      const fileChoice = this.fileStorage.openJsonFile();
      const res = await fileChoice;
      if (res.status === 'completed') {
        const prep = this.documentCodec.prepareImport({
          mode: 'open',
          json: res.value.text,
        });

        if (prep.ok) {
          this.openAsLocalFlow(prep.value.candidate);
          this.draftRecovered = false;
        } else {
          this.showNotice(
            'Erro ao abrir .flow.json',
            prep.diagnostics.map((d) => `• [${d.code}] ${d.message}`).join('\n')
          );
        }
      }
    } finally {
      this.isOpeningDocument = false;
      this.changeDetectorRef.markForCheck();
    }
  }

  public async onLoadExample(): Promise<void> {
    if (!(await this.confirmDocumentSwap())) {
      return;
    }
    this.openAsLocalFlow(EXAMPLE_CONFIRMACAO_NOME);
    this.draftRecovered = false;
  }

  public async onExportDocument(): Promise<boolean> {
    const serializeRes = this.documentCodec.serialize(this.session.document);
    if (serializeRes.ok) {
      const filename = `${this.session.document.document.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.flow.json`;
      const outcome = await this.fileStorage.downloadJsonFile(filename, serializeRes.value);
      if (outcome.status === 'completed') {
        this.editorEngine.markCurrentAsExported();
        this.draftRecovered = false;
        return true;
      }
      if (outcome.status === 'failed') {
        this.showNotice('Erro ao exportar .flow.json', outcome.message);
      }
    }
    return false;
  }

  public onAddNode(): void {
    const pathSource = this.viewMode === 'path' ? this.pathSteps.at(-1)?.nodeId : null;
    const newId = `node-${Math.random().toString(36).substring(2, 9)}`;
    const count = this.session.document.content.nodes.length;
    const x = (count % 5) * 420 + 60;
    const y = Math.floor(count / 5) * 220 + 60;

    this.editorEngine.execute({
      type: 'add-node',
      node: {
        id: newId,
        title: `Nova Ação (${count + 1})`,
        message: 'Digite aqui a mensagem do agente...',
      },
      layout: { x, y, width: 240, height: 120 },
    });

    if (this.viewMode === 'path') {
      if (pathSource) this.onCreateEdge({ source: pathSource, target: newId }, false);
      else this.resetPath(newId);
      this.closePathInspector();
    } else if (this.viewMode === 'focus') this.navigateToNode(newId);
    else this.editorEngine.setSelection({ nodeIds: [newId] });
  }

  public onCreateEdge(event: { source: string; target: string; baseMessage?: string }, openInspector = true): void {
    const newEdgeId = `edge-${Math.random().toString(36).substring(2, 9)}`;
    this.editorEngine.execute({
      type: 'add-edge',
      edge: {
        id: newEdgeId,
        source: event.source,
        target: event.target,
        baseMessage: event.baseMessage || 'Resposta do cliente',
      },
    });
    if (openInspector) this.editorEngine.setSelection({ edgeIds: [newEdgeId] });
    if (this.viewMode === 'focus') this.responseFilter = '';
    if (this.viewMode === 'path' && openInspector) this.pathInspectorOpen = true;
  }

  public connectPathNode(target: string): void {
    const source = this.pathSteps.at(-1)?.nodeId;
    if (!source || !this.nodeById.has(target)) return;
    this.onCreateEdge({ source, target }, false);
    this.closePathInspector();
  }

  public onDeleteEdge(id: string): void {
    if (!this.edgeById.has(id)) return;
    this.editorEngine.execute({ type: 'delete-selection', nodeIds: [], edgeIds: [id] });
    if (this.viewMode === 'path') this.closePathInspector();
    else this.editorEngine.setSelection({});
  }

  public onDeleteNode(id: string): void {
    if (!this.nodeById.has(id)) return;
    this.editorEngine.execute({ type: 'delete-selection', nodeIds: [id], edgeIds: [] });
    if (this.viewMode === 'path') this.closePathInspector();
    else this.editorEngine.setSelection({});
  }

  public onNodeLayoutChange(layouts: Record<string, NodeLayout>): void {
    this.editorEngine.execute({
      type: 'set-node-layouts',
      layouts,
    });
  }

  public onSelectionChange(selection: { nodeIds: string[]; edgeIds: string[] }): void {
    this.editorEngine.setSelection(selection);
  }

  public onViewportChange(viewport: { x: number; y: number; zoom: number }): void {
    this.zoom = viewport.zoom;
    this.editorEngine.setViewport(viewport);
    this.saveLocalFlow();
  }

  public onUpdateNode(event: { id: string; changes: Partial<Omit<FlowNode, 'id'>> }): void {
    this.editorEngine.execute({
      type: 'update-node',
      id: event.id,
      changes: event.changes,
    });
  }

  public onUpdateEdge(event: { id: string; changes: Partial<Omit<FlowEdge, 'id'>> }): void {
    this.editorEngine.execute({
      type: 'update-edge',
      id: event.id,
      changes: event.changes,
    });
  }

  public onUpdateDocument(changes: Partial<Omit<FlowDocument['document'], 'id'>>): void {
    this.editorEngine.execute({
      type: 'update-document',
      changes,
    });
  }

  public onUndo(): void {
    this.editorEngine.undo();
  }

  public onRedo(): void {
    this.editorEngine.redo();
  }

  public onCopy(): void {
    if (this.session.selection.nodeIds.length > 0) {
      this.editorEngine.copy(this.session.selection.nodeIds);
    }
  }

  public onPaste(): void {
    // Usa o clipboard armazenado em memória — NÃO recopia a seleção atual.
    // Isso preserva fragmentos copiados de outro fluxo na mesma instância.
    const fragment = this.editorEngine.getClipboard();
    if (fragment && fragment.nodes.length > 0) {
      this.editorEngine.paste(fragment, { x: 300, y: 180 });
    }
  }

  public onDeleteSelection(): void {
    if (this.hasAnySelection()) {
      this.editorEngine.execute({
        type: 'delete-selection',
        nodeIds: this.session.selection.nodeIds,
        edgeIds: this.session.selection.edgeIds,
      });
    }
  }

  public onZoomIn(): void {
    this.zoom = Math.min(this.zoom + CANVAS_ZOOM_STEP, CANVAS_MAX_ZOOM);
  }

  public onZoomOut(): void {
    this.zoom = Math.max(this.zoom - CANVAS_ZOOM_STEP, CANVAS_MIN_ZOOM);
  }

  public onToggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    const htmlEl = document.documentElement;
    if (this.isDarkTheme) {
      htmlEl.removeAttribute('data-theme');
    } else {
      htmlEl.setAttribute('data-theme', 'light');
    }
  }

  public setViewMode(mode: 'path' | 'focus' | 'map'): void {
    if (this.viewMode === mode) return;
    const logicalNode = this.viewMode === 'path'
      ? this.pathSteps.at(-1)?.nodeId
      : this.viewMode === 'focus'
        ? this.focusNodeId
        : this.getSelectedNode()?.id || this.focusNodeId;
    if (logicalNode && this.nodeById.has(logicalNode)) this.focusNodeId = logicalNode;
    if (mode === 'path' && logicalNode && this.pathSteps.at(-1)?.nodeId !== logicalNode) this.resetPath(logicalNode);
    if (mode === 'focus') this.focusHistory = [];
    this.viewMode = mode;
    if (mode === 'focus' && this.focusNodeId) {
      this.editorEngine.setSelection({ nodeIds: [this.focusNodeId] });
    } else if (mode === 'path') {
      this.closePathInspector();
    } else if (mode === 'map' && logicalNode) {
      this.editorEngine.setSelection({ nodeIds: [logicalNode] });
    }
  }

  public followPathEdge(edgeId: string): void {
    const edge = this.edgeById.get(edgeId);
    if (!edge || edge.source !== this.pathSteps.at(-1)?.nodeId || !this.nodeById.has(edge.target)) return;
    this.pathSteps = [...this.pathSteps, { key: ++this.pathSequence, nodeId: edge.target, viaEdgeId: edge.id }];
    this.focusNodeId = edge.target;
    this.pathNavigationDirection = 'forward';
    this.pathNavigationTick++;
    this.closePathInspector();
  }

  public jumpToPathStep(index: number): void {
    if (index < 0 || index >= this.pathSteps.length) return;
    this.pathSteps = this.pathSteps.slice(0, index + 1);
    this.focusNodeId = this.pathSteps.at(-1)?.nodeId || null;
    this.pathNavigationDirection = 'back';
    this.pathNavigationTick++;
    this.closePathInspector();
  }

  public resetPath(nodeId: string): void {
    if (!this.nodeById.has(nodeId)) return;
    this.pathSteps = [{ key: ++this.pathSequence, nodeId, viaEdgeId: null }];
    this.focusNodeId = nodeId;
    this.pathNavigationDirection = 'reset';
    this.pathNavigationTick++;
    this.closePathInspector();
  }

  public jumpToPathEdge(edgeId: string): void {
    const edge = this.edgeById.get(edgeId);
    if (!edge) return;
    this.resetPath(edge.source);
    this.openPathEdgeInspector(edgeId);
  }

  public openPathNodeInspector(nodeId: string): void {
    if (!this.nodeById.has(nodeId)) return;
    this.editorEngine.setSelection({ nodeIds: [nodeId] });
    this.pathInspectorOpen = true;
  }

  public openPathEdgeInspector(edgeId: string): void {
    if (!this.edgeById.has(edgeId)) return;
    this.editorEngine.setSelection({ edgeIds: [edgeId] });
    this.pathInspectorOpen = true;
  }

  public closePathInspector(): void {
    this.pathInspectorOpen = false;
    if (this.viewMode === 'path') this.editorEngine.setSelection({});
  }

  public navigateToNode(nodeId: string): void {
    if (!this.nodeById.has(nodeId)) return;
    if (this.focusNodeId && this.focusNodeId !== nodeId) this.focusHistory.push(this.focusNodeId);
    this.focusNodeId = nodeId;
    this.responseFilter = '';
    this.editorEngine.setSelection({ nodeIds: [nodeId] });
  }

  public goBackInFocus(): void {
    const previous = this.focusHistory.pop();
    if (previous) this.navigateWithoutHistory(previous);
  }

  public goToStartInFocus(): void {
    const start = this.session.document.document.startNodeId;
    if (start) this.navigateToNode(start);
  }

  public selectFocusEdge(edgeId: string): void {
    if (this.edgeById.has(edgeId)) {
      this.editorEngine.setSelection({ edgeIds: [edgeId] });
    }
  }

  public toggleFocusEdge(edgeId: string): void {
    if (this.edgeById.get(edgeId)?.source !== this.focusNodeId) return;
    const selected = this.session.selection.edgeIds;
    this.editorEngine.setSelection({ edgeIds: selected.includes(edgeId) ? selected.filter((id) => id !== edgeId) : [...selected, edgeId] });
  }

  public selectFocusNode(nodeId: string): void {
    this.editorEngine.setSelection({ nodeIds: [nodeId] });
  }

  private navigateWithoutHistory(nodeId: string): void {
    this.focusNodeId = nodeId;
    this.responseFilter = '';
    this.editorEngine.setSelection({ nodeIds: [nodeId] });
  }

  private loadDocument(doc: FlowDocument, setAsBaseline: boolean): void {
    this.focusNodeId = doc.document.startNodeId || doc.content.nodes[0]?.id || null;
    this.focusHistory = [];
    this.focusQuery = '';
    this.responseFilter = '';
    this.pathSteps = this.focusNodeId ? [{ key: ++this.pathSequence, nodeId: this.focusNodeId, viaEdgeId: null }] : [];
    this.pathInspectorOpen = false;
    this.pathResetEpoch++;
    this.pathNavigationTick = 0;
    this.viewMode = doc.content.nodes.length > 20 || doc.content.edges.length > 60 ? 'path' : 'map';
    this.editorEngine.setDocument(doc, setAsBaseline);
  }

  private reconcilePath(): void {
    const valid: PathStep[] = [];
    for (const step of this.pathSteps) {
      if (!this.nodeById.has(step.nodeId)) break;
      if (valid.length) {
        const previous = valid[valid.length - 1];
        const edge = step.viaEdgeId ? this.edgeById.get(step.viaEdgeId) : null;
        if (!edge || edge.source !== previous.nodeId || edge.target !== step.nodeId) break;
      }
      valid.push(step);
    }
    if (!valid.length) {
      const start = this.session.document.document.startNodeId;
      const fallback = (start && this.nodeById.has(start) ? start : null) || this.session.document.content.nodes[0]?.id;
      if (fallback) valid.push({ key: ++this.pathSequence, nodeId: fallback, viaEdgeId: null });
    }
    if (valid.length !== this.pathSteps.length || valid.at(-1)?.nodeId !== this.pathSteps.at(-1)?.nodeId) {
      this.pathSteps = valid;
      this.pathNavigationDirection = 'back';
      this.pathNavigationTick++;
      this.pathInspectorOpen = false;
      if (this.viewMode === 'path') this.editorEngine.setSelection({});
    }
    if (this.viewMode === 'path') this.focusNodeId = valid.at(-1)?.nodeId || null;
  }

  private reconcileFocus(): void {
    const nodes = this.session.document.content.nodes;
    this.focusHistory = this.focusHistory.filter((id) => this.nodeById.has(id));
    if (this.focusNodeId && this.nodeById.has(this.focusNodeId)) return;
    this.focusNodeId = this.focusHistory.pop() ||
      (this.session.document.document.startNodeId && this.nodeById.has(this.session.document.document.startNodeId)
        ? this.session.document.document.startNodeId
        : nodes[0]?.id || null);
    this.responseFilter = '';
    if (this.viewMode === 'focus' && this.focusNodeId) {
      this.editorEngine.setSelection({ nodeIds: [this.focusNodeId] });
    }
  }
}
