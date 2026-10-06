/**
 * Utilitários de data/hora. Toda a lógica interna trabalha com instantes (ms UTC);
 * o fuso America/Sao_Paulo só é usado para (a) descobrir o "dia local" e a janela
 * de atendimento e (b) formatar a saída. O offset é calculado via Intl (tzdata),
 * então a lógica continua correta mesmo se o Brasil voltar a ter horário de verão.
 */
export const TIMEZONE = 'America/Sao_Paulo';
export const MINUTE_MS = 60_000;

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

/** Componentes de calendário/relógio de um instante no fuso America/Sao_Paulo. */
export function toLocalParts(ms: number): LocalParts {
  const map: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  return {
    year: map.year!,
    month: map.month!,
    day: map.day!,
    hour: map.hour!,
    minute: map.minute!,
  };
}

/** Offset (em minutos, ex.: -180) do fuso America/Sao_Paulo no instante informado. */
export function offsetMinutesAt(ms: number): number {
  const p = toLocalParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const floored = Math.floor(ms / MINUTE_MS) * MINUTE_MS;
  return Math.round((asUtc - floored) / MINUTE_MS);
}

/** Converte um horário de parede em Sao_Paulo para o instante correspondente. */
export function localToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMinutesAt(guess) * MINUTE_MS;
  return guess - offsetMinutesAt(first) * MINUTE_MS;
}

/** Formata um instante como ISO 8601 com o offset de America/Sao_Paulo. */
export function formatLocalIso(ms: number): string {
  const p = toLocalParts(ms);
  const off = offsetMinutesAt(ms);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return (
    `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Chave "YYYY-MM-DD" do dia local (Sao_Paulo) de um instante. */
export function localDateKey(ms: number): string {
  const p = toLocalParts(ms);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

function isValidCalendarDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Faz o parse estrito de um ISO 8601 com offset explícito (Z ou ±hh:mm).
 * Retorna o instante em ms ou null se o formato/valor for inválido.
 * Segundos diferentes de zero são rejeitados: a agenda opera em minutos.
 */
export function parseIsoInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = m[6] === undefined ? 0 : Number(m[6]);
  const tz = m[7]!;
  if (!isValidCalendarDate(y, mo, d) || h > 23 || mi > 59 || sec !== 0) return null;

  let offset = 0;
  if (tz !== 'Z') {
    const sign = tz.startsWith('-') ? -1 : 1;
    const oh = Number(tz.slice(1, 3));
    const om = Number(tz.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offset = sign * (oh * 60 + om);
  }
  return Date.UTC(y, mo - 1, d, h, mi) - offset * MINUTE_MS;
}

/** Faz o parse de "YYYY-MM-DD" (data civil). Retorna null se inválida. */
export function parseDateKey(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return isValidCalendarDate(year, month, day) ? { year, month, day } : null;
}
