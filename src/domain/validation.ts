import { DURACAO_MAX, DURACAO_MIN, PASSO_MINUTOS, dentroDaJanela, isDuracaoValida } from './rules.js';
import { MINUTE_MS, parseDateKey, parseIsoInstant } from './time.js';
import type { ErroCampo, NovoAgendamentoInput } from './types.js';

export type Resultado<T> = { ok: true; value: T } | { ok: false; erros: ErroCampo[] };

const idValido = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validarNovoAgendamento(body: unknown): Resultado<NovoAgendamentoInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, erros: [{ campo: 'body', mensagem: 'O corpo deve ser um objeto JSON' }] };
  }
  const b = body as Record<string, unknown>;
  const erros: ErroCampo[] = [];

  if (!idValido(b.corretorId)) {
    erros.push({ campo: 'corretorId', mensagem: 'Obrigatório (string não vazia)' });
  }
  if (!idValido(b.imovelId)) {
    erros.push({ campo: 'imovelId', mensagem: 'Obrigatório (string não vazia)' });
  }

  const inicioMs = parseIsoInstant(b.inicio);
  if (inicioMs === null) {
    erros.push({
      campo: 'inicio',
      mensagem: 'Deve ser ISO 8601 válido com offset, ex.: 2026-06-10T14:00:00-03:00',
    });
  }

  if (!isDuracaoValida(b.duracaoMinutos)) {
    erros.push({
      campo: 'duracaoMinutos',
      mensagem: `Deve ser inteiro entre ${DURACAO_MIN} e ${DURACAO_MAX}, múltiplo de ${PASSO_MINUTOS}`,
    });
  }

  if (erros.length === 0) {
    const inicio = inicioMs as number;
    const fim = inicio + (b.duracaoMinutos as number) * MINUTE_MS;
    if (!dentroDaJanela(inicio, fim)) {
      erros.push({
        campo: 'inicio',
        mensagem:
          'O agendamento deve ocorrer entre 08:00 e 19:00 (America/Sao_Paulo) e terminar até 19:00',
      });
    }
  }

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    value: {
      corretorId: (b.corretorId as string).trim(),
      imovelId: (b.imovelId as string).trim(),
      inicioMs: inicioMs as number,
      duracaoMinutos: b.duracaoMinutos as number,
    },
  };
}

export function validarConsulta(
  query: Record<string, unknown>,
): Resultado<{ corretorId: string; data: string }> {
  const erros: ErroCampo[] = [];
  if (!idValido(query.corretorId)) {
    erros.push({ campo: 'corretorId', mensagem: 'Obrigatório (query string)' });
  }
  if (parseDateKey(query.data) === null) {
    erros.push({ campo: 'data', mensagem: 'Obrigatório no formato YYYY-MM-DD (data válida)' });
  }
  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    value: { corretorId: (query.corretorId as string).trim(), data: query.data as string },
  };
}
