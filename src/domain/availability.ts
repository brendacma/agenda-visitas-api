import { MAX_SUGESTOES, PASSO_MINUTOS, DESLOCAMENTO_MINUTOS, folgaEntre, janelaDoDia, turnoDe } from './rules.js';
import { MINUTE_MS, toLocalParts } from './time.js';
import type { Agendamento } from './types.js';

export interface Proposta {
  imovelId: string;
  inicioMs: number;
  fimMs: number;
}

export type TipoConflito = 'sobreposicao' | 'deslocamento';

/**
 * Detecta conflito de uma proposta contra os agendamentos EXISTENTES do corretor.
 * Intervalos são semiabertos [inicio, fim): encostar na borda não é sobreposição.
 * Para imóveis diferentes a folga de deslocamento é somada aos dois lados:
 *   conflita se novo.inicio < ex.fim + folga  E  ex.inicio < novo.fim + folga
 * Retorna 'sobreposicao' se há choque real de horário, 'deslocamento' se o choque
 * só existe por causa da folga, ou null se está livre.
 */
export function detectarConflito(
  proposta: Proposta,
  existentes: readonly Agendamento[],
): TipoConflito | null {
  let tipo: TipoConflito | null = null;
  for (const ex of existentes) {
    if (proposta.inicioMs < ex.fimMs && ex.inicioMs < proposta.fimMs) return 'sobreposicao';
    const folga = folgaEntre(proposta.imovelId, ex.imovelId);
    if (proposta.inicioMs < ex.fimMs + folga && ex.inicioMs < proposta.fimMs + folga) {
      tipo = 'deslocamento';
    }
  }
  return tipo;
}

/**
 * Gera até MAX_SUGESTOES inícios alternativos no mesmo dia local da proposta.
 *
 * Candidatos: (1) grade de 30 em 30 min dentro da janela e (2) "encaixes colados"
 * logo depois/antes de cada agendamento existente (com e sem deslocamento), que
 * cobrem horários fora da grade. Cada candidato é validado com o mesmo
 * `detectarConflito` usado na criação, garantindo consistência.
 *
 * Ordenação: mesmo turno do pedido primeiro; dentro do turno, o mais próximo do
 * horário pedido. As escolhidas são devolvidas em ordem cronológica.
 */
export function sugerirHorarios(proposta: Proposta, existentes: readonly Agendamento[]): number[] {
  const duracaoMs = proposta.fimMs - proposta.inicioMs;
  const { year, month, day } = toLocalParts(proposta.inicioMs);
  const { startMs, endMs } = janelaDoDia(year, month, day);
  const passoMs = PASSO_MINUTOS * MINUTE_MS;
  const deslocamentoMs = DESLOCAMENTO_MINUTOS * MINUTE_MS;

  const candidatos = new Set<number>();
  for (let t = startMs; t + duracaoMs <= endMs; t += passoMs) candidatos.add(t);
  for (const ex of existentes) {
    for (const folga of [0, deslocamentoMs]) {
      candidatos.add(ex.fimMs + folga);
      candidatos.add(ex.inicioMs - folga - duracaoMs);
    }
  }

  const turnoPedido = turnoDe(proposta.inicioMs);
  const livres = [...candidatos]
    .filter((t) => t !== proposta.inicioMs && t >= startMs && t + duracaoMs <= endMs)
    .filter(
      (t) =>
        detectarConflito(
          { imovelId: proposta.imovelId, inicioMs: t, fimMs: t + duracaoMs },
          existentes,
        ) === null,
    );

  livres.sort((a, b) => {
    const foraA = turnoDe(a) === turnoPedido ? 0 : 1;
    const foraB = turnoDe(b) === turnoPedido ? 0 : 1;
    if (foraA !== foraB) return foraA - foraB;
    const dist = Math.abs(a - proposta.inicioMs) - Math.abs(b - proposta.inicioMs);
    return dist !== 0 ? dist : a - b;
  });

  return livres.slice(0, MAX_SUGESTOES).sort((a, b) => a - b);
}
