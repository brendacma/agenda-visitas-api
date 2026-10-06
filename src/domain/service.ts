import { detectarConflito, sugerirHorarios } from './availability.js';
import type { AgendamentoRepository } from './repository.js';
import { MINUTE_MS, formatLocalIso, localDateKey } from './time.js';
import type { Agendamento, AgendamentoDTO, NovoAgendamentoInput } from './types.js';

export const toDTO = (a: Agendamento): AgendamentoDTO => ({
  agendamentoId: a.agendamentoId,
  corretorId: a.corretorId,
  imovelId: a.imovelId,
  inicio: formatLocalIso(a.inicioMs),
  fim: formatLocalIso(a.fimMs),
  status: 'confirmado',
});

export type CriarResultado =
  | { tipo: 'criado'; agendamento: AgendamentoDTO }
  | { tipo: 'conflito'; motivo: string; sugestoes: string[] };

const MOTIVO_DESLOCAMENTO = 'Corretor indisponível devido ao tempo de deslocamento necessário';
const MOTIVO_SOBREPOSICAO = 'Corretor já possui agendamento neste horário';

export class AgendamentoService {
  constructor(private readonly repo: AgendamentoRepository) {}

  criar(input: NovoAgendamentoInput): CriarResultado {
    const fimMs = input.inicioMs + input.duracaoMinutos * MINUTE_MS;
    const proposta = { imovelId: input.imovelId, inicioMs: input.inicioMs, fimMs };
    const existentes = this.repo.listarPorCorretor(input.corretorId);

    const conflito = detectarConflito(proposta, existentes);
    if (conflito) {
      return {
        tipo: 'conflito',
        motivo: conflito === 'deslocamento' ? MOTIVO_DESLOCAMENTO : MOTIVO_SOBREPOSICAO,
        sugestoes: sugerirHorarios(proposta, existentes).map(formatLocalIso),
      };
    }

    const agendamento: Agendamento = {
      agendamentoId: this.repo.proximoId(),
      corretorId: input.corretorId,
      imovelId: input.imovelId,
      inicioMs: input.inicioMs,
      fimMs,
    };
    this.repo.salvar(agendamento);
    return { tipo: 'criado', agendamento: toDTO(agendamento) };
  }

  listar(corretorId: string, data: string): AgendamentoDTO[] {
    return this.repo
      .listarPorCorretor(corretorId)
      .filter((a) => localDateKey(a.inicioMs) === data)
      .sort((a, b) => a.inicioMs - b.inicioMs)
      .map(toDTO);
  }
}
