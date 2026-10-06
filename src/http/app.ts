import express, { type ErrorRequestHandler, type Express } from 'express';
import { InMemoryAgendamentoRepository } from '../domain/repository.js';
import { AgendamentoService } from '../domain/service.js';
import { validarConsulta, validarNovoAgendamento } from '../domain/validation.js';

export function createApp(
  service: AgendamentoService = new AgendamentoService(new InMemoryAgendamentoRepository()),
): Express {
  const app = express();
  app.use(express.json());

  app.post('/api/agendamentos', (req, res) => {
    const v = validarNovoAgendamento(req.body);
    if (!v.ok) {
      res.status(400).json({ status: 'erro_validacao', erros: v.erros });
      return;
    }
    const r = service.criar(v.value);
    if (r.tipo === 'conflito') {
      res.status(409).json({ status: 'conflito', motivo: r.motivo, sugestoes: r.sugestoes });
      return;
    }
    res.status(201).json(r.agendamento);
  });

  app.get('/api/agendamentos', (req, res) => {
    const v = validarConsulta(req.query as Record<string, unknown>);
    if (!v.ok) {
      res.status(400).json({ status: 'erro_validacao', erros: v.erros });
      return;
    }
    res.status(200).json(service.listar(v.value.corretorId, v.value.data));
  });

  const tratarErro: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof SyntaxError || (err as { type?: string }).type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ status: 'erro_validacao', erros: [{ campo: 'body', mensagem: 'JSON malformado' }] });
      return;
    }
    res.status(500).json({ status: 'erro_interno', mensagem: 'Erro inesperado' });
  };
  app.use(tratarErro);

  return app;
}
