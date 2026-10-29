# V2.1.1 — edição de clientes, datas da rota e idiomas

Branch: `fix/alys-v2-1-1-customer-route`, criada do `main` mais recente, commit `f7c01d3` (merge da V2.1). A implementação preserva o projeto existente. Não houve reset, migração remota, deploy, envio real de e-mail ou alteração de dados de produção.

## Diagnóstico e correções

### Cadastro e agenda

O editor integrado enviava todas as agendas em cada salvamento. A função `save_service_schedule` atualizava e gerava novamente a janela de stops mesmo quando os termos não mudavam. O guard anterior bloqueava qualquer mudança de dias/técnico/datas/estado quando existia uma visita em andamento, incluindo mudanças de dias que mantinham aquela visita intacta. A API convertia todo erro SQL `22023` na mesma mensagem sobre agenda, ocultando problemas de validação e de repetição de solicitação. O limite de 100 caracteres para o nome completo no banco também não correspondia ao limite separado de nome/sobrenome no formulário.

São causas confirmadas pela inspeção e reprodução local. Não houve acesso aos logs ou ao payload da falha específica em produção; não é possível afirmar qual dessas condições ocorreu naquele cadastro real.

Correções:

- Edição compara agendas com os valores originais e envia somente agendas novas ou efetivamente alteradas. A ordem dos dias não conta como mudança. Nenhuma agenda omitida é removida.
- O banco também reconhece agendas idênticas e retorna sem `UPDATE`, reconciliação ou geração. Alterar somente notas do serviço não modifica stops.
- O guard bloqueia apenas mudanças que realmente alterariam uma visita em andamento: retirar seu dia, pausar, trocar técnico/imóvel ou mudar datas para fora daquela visita. Mudanças compatíveis podem ajustar stops futuros não iniciados.
- Nome, telefone, e-mail, endereço, notas e preço permanecem operações de cadastro; não exigem mudar a recorrência. Histórico e visitas concluídas não são reescritos.
- API retorna caminhos de campo e mensagens controladas, sem refletir SQL, detalhes privados ou chaves. O editor identifica imóvel, agenda e campo em EN/PT/ES e mantém os dados digitados após erro.
- Chave idempotente permanece estável para repetir o mesmo payload; uma edição diferente recebe nova chave após rejeição confirmada. Se a resposta foi incerta, a chave anterior é preservada para impedir duplicações; caso a gravação anterior já tenha ocorrido com outros dados, o sistema exige revisar/recarregar o cliente antes de continuar.
- Validações de dias, datas, técnico ativo, organização, acesso e transação permanecem no servidor e banco. O nome completo é validado com o mesmo limite do banco.

### Data da rota do técnico

O código forçava `isDaily` para técnicos e ocultava o seletor de data nesse modo. Agora todas as rotas possuem **Previous Day / Today / Next Day / calendário**, com controles de toque de pelo menos 44 px. A data selecionada é exibida conforme idioma e fuso da rota, permanece na URL durante ida/volta à visita e pode ser restaurada após reload.

A nova consulta `assigned_route_context(date)` fornece somente os dados operacionais dos stops atribuídos à conta ativa naquela data. Isso permite consultar datas fora da janela geral de sete dias sem ampliar as políticas gerais de propriedades/clientes. Clientes inativos/arquivados continuam sujeitos às restrições existentes; não há exposição de outras rotas ou do financeiro ao técnico.

Mudar a data não edita `recurring_schedules`. A consulta pode materializar stops da recorrência já aprovada, como a rota existente fazia. Rascunhos, fotos e fila continuam no mesmo IndexedDB, por conta/organização/stop; trocar a visualização não os remove. O contexto offline conserva a data explícita da URL. Sem cache de uma data e sem conexão, o aplicativo informa indisponibilidade em vez de inventar dados.

### Idiomas

Os catálogos agora possuem as mesmas chaves em inglês, português brasileiro e espanhol, incluindo estados de entrega, diagnóstico, convites, erros de armazenamento e validações. Nomes, endereços, notas e outros dados digitados não são traduzidos automaticamente.

Também foram corrigidas renderizações que ignoravam o catálogo: estados de contratos/agendas, unidades e nomes conhecidos de produtos, dias de atendimento, resumo da fila local, carregamento de foto privada, navegação/acessibilidade, valores monetários e datas. `USD` continua sendo a moeda; idioma muda a apresentação, não valores armazenados. Símbolos internacionais como ppm, pH, °F, °C e gal permanecem explícitos. Relatórios por e-mail continuam usando o idioma configurado e congelado na visita, não o idioma de quem consulta depois.

Veja o [relatório de cobertura de tradução](V211-LOCALIZATION.md).

## Migration incremental

`supabase/migrations/202610290024_customer_schedule_edit.sql`

Atualiza `schedule_changed`, `save_service_schedule`, `save_customer_bundle`, adiciona o leitor restrito `assigned_route_context` e atualiza o diagnóstico de schema para 24. As migrations 001–023 não foram alteradas. As assinaturas anteriores permanecem compatíveis; não há exclusão ou backfill de clientes, visitas, fotos ou contratos.

## Validação local

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

SQL usa PostgreSQL Docker descartável com todas as migrations. A integração usa Supabase local, dados fictícios e envio de e-mail desativado. O roteiro de inicialização local permanece no [README](../README.md) e em [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md).

```bash
node tests/integration/setup.mjs
node tests/integration/backend.mjs
# Terminal separado: provedor de teste local.
node tests/integration/routing-stub.mjs
# Terminal separado, após o build:
ROUTING_API_URL=http://127.0.0.1:8131 GEOCODING_API_URL=http://127.0.0.1:8131/search APP_URL=http://127.0.0.1:3003 EMAIL_DELIVERY_ENABLED=false TEAM_INVITES_ENABLED=false npm run start -- --port 3003
# Terminal dos testes:
TEST_BASE_URL=http://127.0.0.1:3003 npx --no-install playwright test
```

Nunca use fixtures/seeds contra produção. Não use `db reset` para aplicar o hotfix.

## Publicação — somente depois de revisão e autorização

Não é necessária variável nova nem serviço pago. Preserve as variáveis V2.1 e o domínio canônico existente.

```bash
git fetch origin
git switch fix/alys-v2-1-1-customer-route
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx --yes supabase@2.121.0 migration list --linked
npx --yes supabase@2.121.0 db push --dry-run
```

Confira o projeto e o backup. Em produção V2.1, somente **024** deve estar pendente. Após aprovação explícita:

```bash
npx --yes supabase@2.121.0 db push
npx --yes supabase@2.121.0 migration list --linked
```

Depois, aprove o merge da branch no GitHub e acompanhe o deploy integrado do Netlify. Ordem: **revisão → migration 024 → merge → deploy → aceite**. Não execute deploy manual paralelo nem altere flags de envio para testar automaticamente.

Aceite em produção: editar telefone/nome/preço/endereço com visita em andamento; conferir persistência e agenda intacta; testar uma alteração de dias permitida e uma conflitante; conferir o histórico; no Técnico abrir ontem/hoje/amanhã/data escolhida, voltar da visita, alternar idioma e testar cache com uma visita fictícia autorizada. Conferir schema 24 em System Health. Testes locais não comprovam o estado de produção nem substituem testes em iPhone/Android físicos.

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| Baseline `main` antes das mudanças | Lint, typecheck, 97 testes unitários, 13 suítes SQL e build aprovados |
| Lint / TypeScript | Aprovados, sem avisos/erros |
| Testes unitários | **110 testes em 18 arquivos aprovados** |
| SQL | **14 suítes aprovadas** em PostgreSQL 17 descartável, migrations 001–024 |
| Supabase local real | Auth/PostgREST/Storage aprovados; migration 024 aplicada localmente, sem reset |
| Integração e interface | **31 testes Playwright aprovados**: 22 Chromium em viewport iPhone, 6 em viewport Android/Pixel 5 e 3 desktop |
| Build de produção | `npm run build` aprovado |
| Tradução | **1.065 chaves em EN, PT e ES**, sem diferenças entre conjuntos nem parâmetros perdidos |

Os testes comprovam telefone, nome/preço e endereço persistidos durante visita em andamento sem regravar a agenda; conflito real com campo identificado e input mantido; sexta → terça; histórico preservado e stops sem duplicação. Também exercitam a perda da confirmação após uma gravação real: uma tentativa com dados alterados conserva o request ID e não cria outro cliente; repetir o payload original reconhece a gravação anterior.

O técnico foi testado em ontem/hoje/amanhã, data distante (+14 dias) e data sem stops, com isolamento entre técnicos, volta à visita, rascunho e foto preservados, conclusão offline e uma única visita após reconexão. EN/PT/ES foram testados nas páginas principais, edição, erros, controles de data, refresh e logout/login, em celular e desktop.

**Limites:** são testes de Chromium com emulação de telas; não foram usados iPhone/Android físicos nem Safari/WebKit. Não houve migração remota, merge em main, deploy ou envio real de e-mail. Logs/payload da falha original em produção não foram consultados. O aceite de produção continua sendo uma etapa posterior autorizada.

Relação completa dos arquivos alterados: [V211-FILES.md](V211-FILES.md).
