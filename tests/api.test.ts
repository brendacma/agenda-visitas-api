import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp();
});

const base = { corretorId: 'c-101', imovelId: 'im-553', inicio: '2026-06-10T14:00:00-03:00', duracaoMinutos: 60 };
const post = (body: unknown) => request(app).post('/api/agendamentos').send(body as object);

describe('POST /api/agendamentos - sucesso', () => {
  it('cria agendamento (201) com fim calculado e id sequencial', async () => {
    const res = await post(base);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      agendamentoId: 'ag-001',
      corretorId: 'c-101',
      imovelId: 'im-553',
      inicio: '2026-06-10T14:00:00-03:00',
      fim: '2026-06-10T15:00:00-03:00',
      status: 'confirmado',
    });
    expect((await post({ ...base, inicio: '2026-06-10T16:00:00-03:00' })).body.agendamentoId).toBe('ag-002');
  });

  it('aceita terminar exatamente às 19:00 e começar às 08:00', async () => {
    expect((await post({ ...base, inicio: '2026-06-10T18:00:00-03:00' })).status).toBe(201);
    expect((await post({ ...base, inicio: '2026-06-10T08:00:00-03:00' })).status).toBe(201);
  });

  it('converte fusos: 17:00Z == 14:00 em Brasília', async () => {
    const res = await post({ ...base, inicio: '2026-06-10T17:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.inicio).toBe('2026-06-10T14:00:00-03:00');
  });
});

describe('POST /api/agendamentos - validação (400)', () => {
  it.each([
    ['corretorId ausente', { ...base, corretorId: undefined }],
    ['corretorId vazio', { ...base, corretorId: '  ' }],
    ['imovelId nulo', { ...base, imovelId: null }],
    ['inicio ausente', { ...base, inicio: undefined }],
    ['inicio sem offset', { ...base, inicio: '2026-06-10T14:00:00' }],
    ['inicio inexistente', { ...base, inicio: '2026-02-30T14:00:00-03:00' }],
    ['duração 45', { ...base, duracaoMinutos: 45 }],
    ['duração 15', { ...base, duracaoMinutos: 15 }],
    ['duração 210', { ...base, duracaoMinutos: 210 }],
    ['duração string', { ...base, duracaoMinutos: '60' }],
    ['duração ausente', { ...base, duracaoMinutos: undefined }],
    ['18:30 + 60min (termina 19:30)', { ...base, inicio: '2026-06-10T18:30:00-03:00' }],
    ['07:30 (antes da janela)', { ...base, inicio: '2026-06-10T07:30:00-03:00' }],
    ['10:59Z = 07:59 Brasília', { ...base, inicio: '2026-06-10T10:59:00Z' }],
    ['outro fuso fora da janela (14:00-08:00 = 19:00 BRT)', { ...base, inicio: '2026-06-10T14:00:00-08:00' }],
  ])('%s', async (_nome, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('erro_validacao');
    expect(res.body.erros.length).toBeGreaterThan(0);
  });

  it('JSON malformado', async () => {
    const res = await request(app).post('/api/agendamentos').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });

  it('corpo que não é objeto', async () => {
    const res = await request(app).post('/api/agendamentos').send([1, 2]);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/agendamentos - conflitos (409)', () => {
  it('sobreposição no mesmo horário devolve sugestões', async () => {
    await post(base);
    const res = await post(base);
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('conflito');
    expect(res.body.sugestoes.length).toBeGreaterThan(0);
    expect(res.body.sugestoes.length).toBeLessThanOrEqual(3);
  });

  it('mesmo imóvel: visita colada às 15:00 é aceita', async () => {
    await post(base);
    expect((await post({ ...base, inicio: '2026-06-10T15:00:00-03:00' })).status).toBe(201);
  });

  it('imóvel diferente às 15:00 viola deslocamento; 15:30 passa', async () => {
    await post(base);
    const bad = await post({ ...base, imovelId: 'im-999', inicio: '2026-06-10T15:00:00-03:00' });
    expect(bad.status).toBe(409);
    expect(bad.body.motivo).toBe('Corretor indisponível devido ao tempo de deslocamento necessário');
    const ok = await post({ ...base, imovelId: 'im-999', inicio: '2026-06-10T15:30:00-03:00' });
    expect(ok.status).toBe(201);
  });

  it('buffer vale também antes: imóvel diferente terminando às 14:00 conflita', async () => {
    await post(base);
    const res = await post({ ...base, imovelId: 'im-999', inicio: '2026-06-10T13:00:00-03:00' });
    expect(res.status).toBe(409);
  });

  it('sugestões respeitam o buffer e a janela', async () => {
    await post(base);
    const res = await post({ ...base, imovelId: 'im-999' });
    expect(res.status).toBe(409);
    for (const s of res.body.sugestoes as string[]) {
      const fresh = createApp();
      await request(fresh).post('/api/agendamentos').send(base);
      const ok = await request(fresh).post('/api/agendamentos').send({ ...base, imovelId: 'im-999', inicio: s });
      expect(ok.status).toBe(201);
    }
  });

  it('corretores diferentes não conflitam', async () => {
    await post(base);
    expect((await post({ ...base, corretorId: 'c-202' })).status).toBe(201);
  });

  it('dia lotado: 409 com sugestões vazias', async () => {
    for (const ini of ['08:00', '11:00', '14:00', '17:00']) {
      await post({ ...base, inicio: `2026-06-10T${ini}:00-03:00`, duracaoMinutos: ini === '17:00' ? 120 : 180 });
    }
    const res = await post({ ...base, inicio: '2026-06-10T10:00:00-03:00' });
    expect(res.status).toBe(409);
    expect(res.body.sugestoes).toEqual([]);
  });
});

describe('GET /api/agendamentos', () => {
  it('lista por corretor e dia, ordenado cronologicamente', async () => {
    await post({ ...base, inicio: '2026-06-10T16:00:00-03:00' });
    await post({ ...base, inicio: '2026-06-10T09:00:00-03:00' });
    await post({ ...base, inicio: '2026-06-11T09:00:00-03:00' });
    await post({ ...base, corretorId: 'c-202', inicio: '2026-06-10T10:00:00-03:00' });

    const res = await request(app).get('/api/agendamentos').query({ corretorId: 'c-101', data: '2026-06-10' });
    expect(res.status).toBe(200);
    expect(res.body.map((a: { inicio: string }) => a.inicio)).toEqual([
      '2026-06-10T09:00:00-03:00',
      '2026-06-10T16:00:00-03:00',
    ]);
  });

  it('retorna [] quando não há agendamentos', async () => {
    const res = await request(app).get('/api/agendamentos').query({ corretorId: 'c-101', data: '2026-06-10' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([
    [{ data: '2026-06-10' }],
    [{ corretorId: 'c-101' }],
    [{ corretorId: 'c-101', data: '10/06/2026' }],
    [{ corretorId: 'c-101', data: '2026-02-30' }],
  ])('400 para consulta inválida %j', async (q) => {
    expect((await request(app).get('/api/agendamentos').query(q)).status).toBe(400);
  });
});
