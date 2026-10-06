import { describe, expect, it } from 'vitest';
import { detectarConflito, sugerirHorarios } from '../src/domain/availability.js';
import { dentroDaJanela, isDuracaoValida } from '../src/domain/rules.js';
import { formatLocalIso, localDateKey, parseDateKey, parseIsoInstant } from '../src/domain/time.js';
import type { Agendamento } from '../src/domain/types.js';

const t = (hhmm: string, offset = '-03:00') => parseIsoInstant(`2026-06-10T${hhmm}:00${offset}`)!;

const ag = (imovelId: string, ini: string, fim: string): Agendamento => ({
  agendamentoId: 'x',
  corretorId: 'c-1',
  imovelId,
  inicioMs: t(ini),
  fimMs: t(fim),
});

const prop = (imovelId: string, ini: string, fim: string) => ({
  imovelId,
  inicioMs: t(ini),
  fimMs: t(fim),
});

describe('parseIsoInstant', () => {
  it('aceita offsets e Z equivalentes', () => {
    expect(parseIsoInstant('2026-06-10T14:00:00-03:00')).toBe(parseIsoInstant('2026-06-10T17:00:00Z'));
    expect(parseIsoInstant('2026-06-10T14:00-03:00')).not.toBeNull();
  });

  it.each([
    '2026-06-10T14:00:00',
    '2026-06-10',
    '2026-02-30T10:00:00-03:00',
    '2026-06-10T25:00:00-03:00',
    '2026-06-10T14:00:30-03:00',
    '2026-06-10 14:00:00-03:00',
    'banana',
  ])('rejeita %s', (v) => {
    expect(parseIsoInstant(v)).toBeNull();
  });

  it('rejeita não-string', () => {
    expect(parseIsoInstant(123)).toBeNull();
    expect(parseIsoInstant(null)).toBeNull();
  });
});

describe('datas locais', () => {
  it('formata sempre em -03:00', () => {
    expect(formatLocalIso(parseIsoInstant('2026-06-10T17:00:00Z')!)).toBe('2026-06-10T14:00:00-03:00');
  });

  it('dia local difere do dia UTC perto da meia-noite', () => {
    expect(localDateKey(parseIsoInstant('2026-06-11T01:00:00Z')!)).toBe('2026-06-10');
  });

  it('parseDateKey valida data civil', () => {
    expect(parseDateKey('2026-06-10')).not.toBeNull();
    expect(parseDateKey('2026-13-01')).toBeNull();
    expect(parseDateKey('10/06/2026')).toBeNull();
  });
});

describe('regras', () => {
  it('duração: 30..180 em múltiplos de 30', () => {
    for (const d of [30, 60, 90, 120, 150, 180]) expect(isDuracaoValida(d)).toBe(true);
    for (const d of [0, 15, 45, 210, -30, 60.5, '60', null]) expect(isDuracaoValida(d)).toBe(false);
  });

  it('janela: bordas 08:00 e 19:00 inclusivas para início/fim', () => {
    expect(dentroDaJanela(t('08:00'), t('09:00'))).toBe(true);
    expect(dentroDaJanela(t('18:00'), t('19:00'))).toBe(true);
    expect(dentroDaJanela(t('07:59'), t('08:59'))).toBe(false);
    expect(dentroDaJanela(t('18:30'), t('19:30'))).toBe(false);
  });
});

describe('detectarConflito', () => {
  const existentes = [ag('A', '14:00', '15:00')];

  it('sobreposição total, parcial e contida', () => {
    expect(detectarConflito(prop('A', '14:00', '15:00'), existentes)).toBe('sobreposicao');
    expect(detectarConflito(prop('A', '14:30', '15:30'), existentes)).toBe('sobreposicao');
    expect(detectarConflito(prop('A', '13:30', '14:30'), existentes)).toBe('sobreposicao');
    expect(detectarConflito(prop('A', '14:15', '14:45'), existentes)).toBe('sobreposicao');
  });

  it('mesmo imóvel: encaixe imediato nas duas bordas', () => {
    expect(detectarConflito(prop('A', '15:00', '16:00'), existentes)).toBeNull();
    expect(detectarConflito(prop('A', '13:00', '14:00'), existentes)).toBeNull();
  });

  it('imóvel diferente: exige 30 min antes e depois', () => {
    expect(detectarConflito(prop('B', '15:00', '16:00'), existentes)).toBe('deslocamento');
    expect(detectarConflito(prop('B', '15:29', '16:29'), existentes)).toBe('deslocamento');
    expect(detectarConflito(prop('B', '15:30', '16:30'), existentes)).toBeNull();
    expect(detectarConflito(prop('B', '13:00', '14:00'), existentes)).toBe('deslocamento');
    expect(detectarConflito(prop('B', '12:30', '13:30'), existentes)).toBeNull();
  });
});

describe('sugerirHorarios', () => {
  it('nunca retorna mais de 3, todos livres e em ordem cronológica', () => {
    const existentes = [ag('A', '14:00', '15:00')];
    const p = prop('B', '14:00', '15:00');
    const s = sugerirHorarios(p, existentes);
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s.length).toBeGreaterThan(0);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
    for (const ini of s) {
      expect(detectarConflito({ imovelId: 'B', inicioMs: ini, fimMs: ini + 3_600_000 }, existentes)).toBeNull();
      expect(dentroDaJanela(ini, ini + 3_600_000)).toBe(true);
    }
  });

  it('prioriza o mesmo turno do pedido', () => {
    const existentes = [ag('A', '09:00', '10:00')];
    const s = sugerirHorarios(prop('A', '09:00', '10:00'), existentes);
    expect(s).toHaveLength(3);
    for (const ini of s) expect(formatLocalIso(ini) < '2026-06-10T12:00:00').toBe(true);
  });

  it('cai para o outro turno quando o turno pedido está lotado', () => {
    const existentes = [ag('A', '08:00', '10:00'), ag('A', '10:00', '12:00')];
    const s = sugerirHorarios(prop('A', '09:00', '10:00'), existentes).map(formatLocalIso);
    expect(s).toEqual([
      '2026-06-10T12:00:00-03:00',
      '2026-06-10T12:30:00-03:00',
      '2026-06-10T13:00:00-03:00',
    ]);
  });

  it('inclui encaixe fora da grade colado ao agendamento existente', () => {
    const existentes = [ag('A', '14:10', '15:10')];
    const s = sugerirHorarios(prop('A', '14:30', '15:30'), existentes).map(formatLocalIso);
    expect(s).toContain('2026-06-10T15:10:00-03:00');
  });

  it('retorna lista vazia se o dia está cheio', () => {
    const existentes = [ag('A', '08:00', '11:00'), ag('A', '11:00', '14:00'), ag('A', '14:00', '17:00'), ag('A', '17:00', '19:00')];
    expect(sugerirHorarios(prop('A', '09:00', '10:00'), existentes)).toEqual([]);
  });
});
