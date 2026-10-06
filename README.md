# API de Agenda de Visitas Inteligente (MIA)

API REST em **TypeScript + Express** para a MIA agendar visitas de corretores, com validação logística (janela de atendimento, duração, deslocamento entre imóveis) e sugestão de horários alternativos. Persistência em memória.

## Como rodar

Requisitos: Node.js >= 18.

```bash
npm install
npm run dev        # sobe em http://localhost:3000 (PORT para trocar)
npm test           # suíte completa (Vitest + Supertest)
npm run typecheck  # checagem de tipos
```

**Windows / PowerShell:** se `npm` der erro de política de execução de scripts, use `npm.cmd` (ex.: `npm.cmd install`, `npm.cmd test`).

### Testes

`npm test` executa 55 testes com Vitest + Supertest:
- `tests/unit.test.ts` (22): parse de ISO e fusos, regras de janela e duração, colisão nas bordas (total, parcial, contida, encaixe imediato, deslocamento antes e depois) e geração de sugestões.
- `tests/api.test.ts` (33): sucesso, validações de payload (400), conflitos simples e por deslocamento (409), sugestões válidas, fusos diferentes e listagem.

### Exemplos

Os comandos abaixo usam sintaxe de shell Unix. No PowerShell, use `curl.exe` (o `curl` é um alias de outro comando) e envie o JSON por pipe, por exemplo:
`'{"corretorId":"c-101",...}' | curl.exe -i -X POST http://localhost:3000/api/agendamentos -H "Content-Type: application/json" --data-binary "@-"`

```bash
# 201
curl -X POST localhost:3000/api/agendamentos -H "Content-Type: application/json" \
  -d '{"corretorId":"c-101","imovelId":"im-553","inicio":"2026-06-10T14:00:00-03:00","duracaoMinutos":60}'

# 409 (outro imóvel às 15:00 -> falta o deslocamento de 30 min) com sugestões
curl -X POST localhost:3000/api/agendamentos -H "Content-Type: application/json" \
  -d '{"corretorId":"c-101","imovelId":"im-999","inicio":"2026-06-10T15:00:00-03:00","duracaoMinutos":60}'

# 400 (18:30 + 60 min termina às 19:30)
curl -X POST localhost:3000/api/agendamentos -H "Content-Type: application/json" \
  -d '{"corretorId":"c-101","imovelId":"im-553","inicio":"2026-06-10T18:30:00-03:00","duracaoMinutos":60}'

# 200
curl "localhost:3000/api/agendamentos?corretorId=c-101&data=2026-06-10"
```

## Contrato

| Situação | Status | Corpo |
|---|---|---|
| Criado | 201 | `agendamentoId, corretorId, imovelId, inicio, fim, status:"confirmado"` |
| Conflito de horário/deslocamento | 409 | `{status:"conflito", motivo, sugestoes:[até 3 ISO]}` |
| Entrada inválida (campo ausente/nulo, ISO inválido ou sem offset, duração fora da regra, fora da janela 08–19h, JSON malformado) | 400 | `{status:"erro_validacao", erros:[{campo, mensagem}]}` |
| Listagem | 200 | array cronológico (400 se `corretorId`/`data` inválidos) |

Datas de saída são sempre no offset de `America/Sao_Paulo` (`-03:00`), independentemente do offset enviado.

## Arquitetura

```
agenda-visitas-api/
├── package.json dependências e comandos (dev, test, typecheck)
├── tsconfig.json configuração do TypeScript (modo estrito)
├── README.md documentação do desafio
├── src/
│ ├── server.ts liga o servidor na porta 3000
│ ├── http/
│ │ └── app.ts rotas Express: recebe, delega, devolve o status HTTP
│ └── domain/ as regras de negócio (nada de HTTP aqui)
│ ├── types.ts formatos dos dados (Agendamento, DTO, erro)
│ ├── time.ts datas e fusos: ler ISO, converter, formatar
│ ├── rules.ts constantes e regras: janela, duração, folga, turno
│ ├── validation.ts valida o que chega (gera os erros do 400)
│ ├── availability.ts colisão de horários + geração de sugestões
│ ├── repository.ts onde os dados ficam (memória)
│ └── service.ts orquestra tudo: valida conflito, salva, responde
└── tests/
├── unit.test.ts 22 testes das funções do domínio
└── api.test.ts 33 testes chamando os endpoints de verdade
Por que assim: separei http de domain para que as regras possam ser testadas sem subir servidor e
para que o Express fosse só um "tradutor" de resultado em status. O repositório fica atrás de uma
interface, então trocar memória por banco de dados não mexe nas regras.
```

Decisões principais:
- **Domínio separado do HTTP**: regras são funções puras e testáveis; o Express só traduz resultado em status.
- **Tudo em instantes (ms UTC)** internamente; fuso só entra para dia local, janela e formatação.
- **Repositório atrás de interface**: trocar por banco não afeta o domínio. Como o Node é single-thread e `criar` é síncrono, checar + salvar é atômico (sem corrida em memória); com banco seria preciso transação/lock por corretor.
- Janela fora do permitido retorna **400** (é um pedido inválido por regra de entrada), enquanto choque com a agenda retorna **409**.

## Colisão e deslocamento

Intervalos são semiabertos `[inicio, fim)`. Para cada agendamento existente do corretor, com `folga = 0` se mesmo imóvel e `30 min` se imóvel diferente:

```
conflita  <=>  novo.inicio < ex.fim + folga  &&  ex.inicio < novo.fim + folga
```

Uma única fórmula cobre sobreposição total, parcial, contida e a janela de deslocamento **antes e depois**. Visita colada no mesmo imóvel (15:00 após 14:00–15:00) passa; em imóvel diferente só a partir de 15:30. Sobreposição real gera o motivo "já possui agendamento"; choque só por causa da folga gera o motivo de deslocamento do enunciado.

## Sugestões de horários

1. Candidatos: grade de 30 em 30 min na janela do dia **+** "encaixes colados" antes/depois de cada agendamento existente (cobre horários fora da grade, ex.: visita existente termina 15:10).
2. Cada candidato passa pelo **mesmo** `detectarConflito` da criação e precisa caber em 08:00–19:00 (garante que toda sugestão seja aceita se enviada de volta).
3. Ordenação: **mesmo turno** do pedido primeiro (manhã < 12h), depois o mais próximo do horário pedido; escolhem-se até 3 e são devolvidas em ordem cronológica. Se o turno não tem vaga, completa com o outro turno; se o dia está lotado, `sugestoes: []`.

## Fusos e bordas

- Entrada exige offset explícito (`Z` ou `±hh:mm`); string sem offset é 400 (ambígua).
- `2026-06-10T17:00:00Z` é 14:00 em Brasília: a janela é avaliada no horário local, não no do cliente (ex.: `10:59Z` = 07:59 BRT é recusado).
- O **dia** de um agendamento e o filtro da listagem usam o dia local de Brasília (`01:00Z` do dia 11 ainda é dia 10).
- Datas inexistentes (`2026-02-30`) são rejeitadas com checagem de calendário (o `Date` do JS "corrigiria" silenciosamente).
- Offset obtido via `Intl` (tzdata) e não fixado em -3, então continua correto se houver horário de verão.
- Término exatamente às 19:00 é aceito; 18:30 + 60 min é 400. Segundos diferentes de zero são rejeitados (agenda em minutos).

## Observação sobre o enunciado

O enunciado cita a janela como 08:00–19:00 nas regras e 08:05–19:00 nas sugestões. Adotei **08:00–19:00** para ambos, por consistência (uma sugestão nunca é recusada se reenviada).
