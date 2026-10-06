import type { Agendamento } from './types.js';

export interface AgendamentoRepository {
  proximoId(): string;
  salvar(agendamento: Agendamento): void;
  listarPorCorretor(corretorId: string): Agendamento[];
}

/** Persistência volátil em memória. Node é single-thread: checar + salvar no service é atômico. */
export class InMemoryAgendamentoRepository implements AgendamentoRepository {
  private readonly porCorretor = new Map<string, Agendamento[]>();
  private sequencia = 0;

  proximoId(): string {
    this.sequencia += 1;
    return `ag-${String(this.sequencia).padStart(3, '0')}`;
  }

  salvar(agendamento: Agendamento): void {
    const lista = this.porCorretor.get(agendamento.corretorId) ?? [];
    lista.push(agendamento);
    this.porCorretor.set(agendamento.corretorId, lista);
  }

  listarPorCorretor(corretorId: string): Agendamento[] {
    return [...(this.porCorretor.get(corretorId) ?? [])];
  }
}
