import { MINUTE_MS, localToInstant, toLocalParts } from './time.js';

export const JANELA_INICIO_HORA = 8;
export const JANELA_FIM_HORA = 19;
export const DURACAO_MIN = 30;
export const DURACAO_MAX = 180;
export const PASSO_MINUTOS = 30;
/** Intervalo mínimo de deslocamento entre imóveis diferentes. */
export const DESLOCAMENTO_MINUTOS = 30;
export const MAX_SUGESTOES = 3;

export function isDuracaoValida(duracao: unknown): duracao is number {
  return (
    typeof duracao === 'number' &&
    Number.isInteger(duracao) &&
    duracao >= DURACAO_MIN &&
    duracao <= DURACAO_MAX &&
    duracao % PASSO_MINUTOS === 0
  );
}

/** Janela de atendimento [início, fim] do dia local informado, em instantes. */
export function janelaDoDia(
  year: number,
  month: number,
  day: number,
): { startMs: number; endMs: number } {
  return {
    startMs: localToInstant(year, month, day, JANELA_INICIO_HORA, 0),
    endMs: localToInstant(year, month, day, JANELA_FIM_HORA, 0),
  };
}

/** Verdadeiro se [inicioMs, fimMs) cabe inteiramente na janela de atendimento do dia local do início. */
export function dentroDaJanela(inicioMs: number, fimMs: number): boolean {
  const { year, month, day } = toLocalParts(inicioMs);
  const { startMs, endMs } = janelaDoDia(year, month, day);
  return inicioMs >= startMs && fimMs <= endMs;
}

/** Folga obrigatória (ms) entre dois agendamentos conforme o imóvel. */
export function folgaEntre(imovelA: string, imovelB: string): number {
  return (imovelA === imovelB ? 0 : DESLOCAMENTO_MINUTOS) * MINUTE_MS;
}

/** Turno do horário local: manhã (< 12h) ou tarde. */
export function turnoDe(ms: number): 'manha' | 'tarde' {
  return toLocalParts(ms).hour < 12 ? 'manha' : 'tarde';
}
