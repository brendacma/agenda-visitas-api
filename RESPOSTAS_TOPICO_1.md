# Tópico 1 — Triagem, Priorização e Diagnóstico

> Observação: não conheço as ferramentas internas da Morada.ai, então descrevo os tipos de log/painel que eu buscaria (logs da plataforma, backoffice, histórico de webhooks etc.) sem citar nomes que eu não possa confirmar.

## 1. Ordem de priorização

| Posição | Chamado | Cliente |
|---|---|---|
| 1º | **A** | Construtora Planalto — campanhas WhatsApp paradas |
| 2º | **E** | Viver Imóveis — integração Ploomes parada |
| 3º | **C** | Grupo Vértice — webhook "won" não dispara |
| 4º | **B** | Imobiliária Jardins — MIA em inglês / preços antigos |
| 5º | **D** | Incorporadora Solaris — dúvida sobre relatório |

## 2. Justificativa técnica

**A (1º)** — Interrupção total de uma função central (envio de campanhas) há ~14h (desde 18h de ontem), sem nenhum lead recebendo mensagem. É o maior impacto de negócio e está em andamento: cada hora parada é perda de contato e de oportunidade, e janelas de atendimento do WhatsApp podem expirar. Também é o que tem maior chance de ser causa na plataforma/Meta e não só no cliente, o que afetaria outros clientes.

**E (2º)** — Entrou primeiro (07:30) e há perda contínua de dados: leads que conversam com a MIA não chegam ao CRM, e o time comercial não os vê. O token está válido, então a causa provável está em outro ponto (fila/worker de integração, mudança de mapeamento/campos obrigatórios ou na API do Ploomes). Fica abaixo de A porque o atendimento ao lead continua funcionando, e os leads podem ser reprocessados depois, se estiverem guardados na nossa base.

**C (3º)** — Falha de entrega de evento (webhook "won") desde ontem: os dados não chegam ao CRM externo. É grave, mas os leads já foram ganhos e os dados existem na plataforma, então dá para reenviar. Fica abaixo de E porque o impacto é sobre leads já convertidos (sincronização/relatório), não sobre captação ativa. Sobe de prioridade se for erro de plataforma que afete mais clientes.

**B (4º)** — Degradação de qualidade: respostas em inglês e preços desatualizados em duas conversas. É um risco comercial real (informação errada para o lead), mas é limitado (duas conversas citadas), não é uma indisponibilidade e tem mitigação rápida (corrigir a base de conhecimento ou pausar/ajustar a MIA). Eu ligaria para o cliente cedo para confirmar o escopo, mesmo estando em 4º na fila de investigação.

**D (5º)** — Dúvida de uso/treinamento sobre relatório e métrica de engajamento. Sem impacto operacional nem prazo crítico; é resolvido com orientação e documentação.

Observação: A, C e E relatam problemas que começaram "ontem" no fim do dia/à noite, em clientes diferentes. Vale checar se houve um deploy, manutenção ou incidente na plataforma nesse horário, porque pode ser uma causa comum.

## 3. Plano de diagnóstico (A e E)

### Chamado A — campanhas de WhatsApp paradas desde 18h de ontem

1. **Delimitar o problema**: só esse cliente ou outros também? Olhar se há outros chamados/alertas e o status da plataforma. Confirmar com o cliente se algo mudou às 18h (troca de número, template, plano, cobrança).
2. **Status da campanha no backoffice**: está ativa/pausada/travada? Há mensagens em fila (não enviadas), com erro ou nem criadas? Se a fila existe e não anda, suspeito do worker/agendador; se as mensagens saem com erro, suspeito do lado WhatsApp.
3. **Logs de envio** da plataforma filtrando pelo cliente e a partir de 18h: procurar o primeiro erro e o código retornado pela Meta (Cloud API) e se é sempre o mesmo.
4. **Pontos típicos do lado WhatsApp/Meta**:
   - qualidade/status do número (restrito, limite de mensagens atingido, número bloqueado);
   - status da conta WhatsApp Business (WABA) e do método de pagamento;
   - templates (pausados, rejeitados ou com qualidade baixa);
   - token de acesso expirado ou revogado;
   - painel do Meta Business / página de status da API.
5. **Cronologia**: comparar o horário do primeiro erro com deploys/alterações na plataforma e com ações do cliente.
6. **Decisão**: se for configuração do cliente (número restrito, template, pagamento), corrijo/oriento e reenvio a fila. Se for erro na plataforma, escalo para o N3 com evidências.

### Chamado E — integração Ploomes parada desde ontem à noite

1. **Delimitar**: parou para todos os leads novos ou só alguns? Afeta outros clientes que usam o Ploomes? Confirmar o horário exato do último lead criado com sucesso.
2. **Logs de integração** do cliente: ver a última chamada bem-sucedida e as primeiras com falha. Anotar status HTTP e corpo da resposta do Ploomes:
   - 401/403: autenticação ou permissão (mesmo com token ativo, pode ter perdido permissão de criar contatos/negócios);
   - 400/422: payload rejeitado (campo obrigatório novo, campo personalizado removido/renomeado, valor inválido em lista de opções, funil/etapa/ID de origem excluído);
   - 429: limite de requisições;
   - 5xx/timeout: instabilidade do Ploomes ou nossa.
3. **Payload**: pegar um payload com falha e reproduzir a chamada à API do Ploomes manualmente (ex.: Postman/cURL) com o mesmo token, para separar problema nosso de problema do CRM.
4. **Se não houver chamada**, o problema é do nosso lado (fila, worker, gatilho de criação do lead não disparando, integração desativada por erros repetidos).
5. **Mudanças**: perguntar ao cliente se alteraram campos, funis, usuários ou permissões no Ploomes ontem; comparar com o mapeamento de campos da integração.
6. **Recuperação**: depois de corrigir, reprocessar/reenviar os leads criados desde a falha (verificando duplicidade) e confirmar com o cliente.

## 4. Critério de escalação para o N3

**Sim, o chamado A, condicionalmente.** Uma parada total de envio de campanhas por ~14h é crítica. Escalaria imediatamente para o N3 se, na triagem, eu confirmar que a causa não é configuração do cliente nem restrição da Meta (por exemplo: fila parada, worker/agendador fora do ar, erro interno nos logs sem erro correspondente da Meta, ou outros clientes afetados). Se for algo do lado do cliente/Meta (número restrito, template rejeitado, pagamento), resolvo no N2.

**C e E** escalam se eu reproduzir que o evento não é emitido ou a chamada não é feita (bug de produto/infraestrutura), ou se forem vários clientes, o que sugeriria incidente de plataforma. Se a causa for dado/permissão do CRM do cliente, fica no N2.

**B e D não escalam**: B se resolve pela base de conhecimento/configuração da MIA (a menos que se confirme que a causa é a versão do modelo/prompt da plataforma, o que viraria bug de produto), e D é orientação.
