import { Injectable, inject } from '@angular/core';
import { FlowDocument } from '../models/flow-contracts';
import { DocumentCodec } from './document-codec';

export const LOCAL_FLOWS_KEY = 'editor_conversacional_flows_v1';
export interface LocalFlow {
  key: string;
  document: FlowDocument;
  updatedAt: string;
}
export interface LocalFlows {
  activeKey: string | null;
  flows: LocalFlow[];
}

@Injectable({ providedIn: 'root' })
export class LocalFlowsService {
  private codec = inject(DocumentCodec);

  load(): LocalFlows | null {
    const raw = localStorage.getItem(LOCAL_FLOWS_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.flows) ||
        !(state.activeKey === null || typeof state.activeKey === 'string')) {
      throw new Error('Lista de fluxos locais inválida.');
    }
    const keys = new Set<string>();
    const flows: LocalFlow[] = state.flows.map((entry: LocalFlow) => {
      if (!entry || typeof entry.key !== 'string' || keys.has(entry.key) ||
          typeof entry.updatedAt !== 'string') throw new Error('Fluxo local inválido.');
      keys.add(entry.key);
      const result = this.codec.prepareImport({ mode: 'open', json: JSON.stringify(entry.document) });
      if (!result.ok) throw new Error('Não foi possível validar um dos fluxos locais.');
      return { ...entry, document: result.value.candidate };
    });
    return { activeKey: state.activeKey, flows };
  }

  save(state: LocalFlows): void {
    localStorage.setItem(LOCAL_FLOWS_KEY, JSON.stringify(state));
  }
}
