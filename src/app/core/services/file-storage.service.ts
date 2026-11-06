import { Injectable } from '@angular/core';
import { FileOutcome, FlowDocument, Result } from '../models/flow-contracts';

const LOCAL_DRAFT_KEY = 'editor_conversacional_draft_v1';

@Injectable({
  providedIn: 'root',
})
export class FileStorageService {
  /** Abre um arquivo .flow.json local usando a API do navegador */
  public openJsonFile(): Promise<FileOutcome<{ name: string; text: string }>> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.flow.json';
      input.hidden = true;
      document.body.appendChild(input);

      const cleanup = () => input.remove();

      input.onchange = (event: any) => {
        const file = event.target.files?.[0];
        if (!file) {
          cleanup();
          resolve({ status: 'cancelled' });
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          cleanup();
          const text = e.target?.result as string;
          resolve({ status: 'completed', value: { name: file.name, text } });
        };
        reader.onerror = () => {
          cleanup();
          resolve({ status: 'failed', message: 'Falha ao ler o arquivo selecionado.' });
        };
        reader.readAsText(file, 'utf-8');
      };

      input.oncancel = () => {
        cleanup();
        resolve({ status: 'cancelled' });
      };

      input.click();
    });
  }

  /** Faz download do documento serializado como arquivo JSON */
  public downloadJsonFile(filename: string, jsonText: string): Promise<FileOutcome<void>> {
    return new Promise((resolve) => {
      try {
        const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.flow.json')
          ? filename
          : filename.endsWith('.json')
          ? filename.replace(/\.json$/, '.flow.json')
          : `${filename}.flow.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve({ status: 'completed', value: undefined });
      } catch (err: any) {
        resolve({ status: 'failed', message: `Erro ao baixar arquivo: ${err.message}` });
      }
    });
  }

  /** Salva rascunho no localStorage */
  public saveDraft(doc: FlowDocument): Result<void> {
    try {
      localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(doc));
      return { ok: true, value: undefined, diagnostics: [] };
    } catch (err: any) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'warning',
            code: 'DRAFT_SAVE_FAILED',
            path: '/',
            message: `Falha ao salvar rascunho local: ${err.message}`,
          },
        ],
      };
    }
  }

  /** Carrega rascunho do localStorage se existir */
  public loadDraft(): Result<FlowDocument | null> {
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (!raw) {
        return { ok: true, value: null, diagnostics: [] };
      }
      const doc = JSON.parse(raw) as FlowDocument;
      return { ok: true, value: doc, diagnostics: [] };
    } catch (err: any) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'warning',
            code: 'DRAFT_LOAD_FAILED',
            path: '/',
            message: `Falha ao carregar rascunho local: ${err.message}`,
          },
        ],
      };
    }
  }

  /** Limpa rascunho do localStorage */
  public clearDraft(): void {
    try {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
    } catch (_) {}
  }
}
