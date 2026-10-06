export interface Agendamento {
  agendamentoId: string;
  corretorId: string;
  imovelId: string;
  /** Instante de início, em milissegundos desde a época (UTC). */
  inicioMs: number;
  /** Instante de fim, em milissegundos desde a época (UTC). */
  fimMs: number;
}

export interface AgendamentoDTO {
  agendamentoId: string;
  corretorId: string;
  imovelId: string;
  inicio: string;
  fim: string;
  status: 'confirmado';
}

export interface NovoAgendamentoInput {
  corretorId: string;
  imovelId: string;
  inicioMs: number;
  duracaoMinutos: number;
}

export interface ErroCampo {
  campo: string;
  mensagem: string;
}
