# ALYS V3.0 — From Pool Technician to Pool Business Owner

Branch de revisão: `feature/alys-v3-simplification`, baseada na V2.3 reconstruída + V2.4 (`bcfcd47`), com inspeção do `origin/main` atualizado. Nenhum merge, deploy, reset de banco, migration remota ou serviço pago foi executado.

## Produto e navegação

O mesmo cadastro atende quem trabalha sozinho e quem começa a delegar. A carteira própria é o centro do produto. A lista de clientes usa cartões compactos e uma única ação Add Customer; todas as edições passam pelo onboarding integrado, sem o segundo formulário/modal de perfil que existia na lista.

- Owner: **Home · Customers · Route · Team · More**.
- Technician: **Today · History · More**. Sem cadastro de clientes, equipe ou finanças.
- More: Maps, Reports, Settings e, para Owner, History e Profitability. Team aparece na navegação principal do Owner, sem destino duplicado em More.
- More → Advanced & legacy: finanças anteriores, registros V1, subcontratos externos, revisão de preços antigos e System Health.
- `/service` continua funcionando como endereço do fluxo de trabalho e recuperação, mas saiu da navegação principal. `/pools` e `/locations` continuam redirecionando para Customers.

## Auditoria de telas e consolidação

| Página / fluxo | Simplificação e capacidades preservadas |
| --- | --- |
| `/` | Clientes próprios, MRR, contribuição/valor antes da mão de obra, piscinas hoje, concluídas/restantes e sincronização. Uma ação principal contextual. Calendário de outros dias e indicadores de crescimento ficam em detalhes. |
| `/customers` | Busca rápida, cartões compactos e Add Customer. Filtros, tags, ordenação, exportação e ações em lote ficam em Filters & tools; o editor de perfil duplicado foi removido. |
| `/customers/new` e edição | Mesmo payload/RPC e preservação de IDs. Acesso/GPS/região, configuração técnica da piscina, status/tags e opções de contrato legado ficam em disclosures. Endereço, volume, dias, responsável e mensalidade continuam no cadastro integrado. |
| `/customers/[id]` | Resumo de serviço, dias, responsável, preço e contribuição. Contato/notas privadas e visitas futuras recolhidos; atalhos para Properties & Pools, History e Reports. Edição rápida preserva múltiplos imóveis e piscinas/spas. |
| Abas Properties / Service / History | Piscinas dentro dos imóveis; Add Pool/Spa fica em Add a water body. Agenda/contrato/atribuição dentro do cliente. Histórico, relatórios e ledger químico continuam disponíveis. |
| `/route` | Calendário semanal visível, progresso compacto, paradas numeradas e Start/Navigate. Ordenação, skip e reatribuição continuam em More na parada; timezone/data detalhada e demais opções foram para depois da lista. GPS da próxima parada permanece fixo. |
| `/stops` | Today do técnico com apenas trabalho atribuído. Remaining/Completed em destaque; Skipped/All e configurações da rota são secundários. Start fica acessível no primeiro viewport de 390 px. |
| `/service` e `/visit/[id]` | Cabeçalho compacto, Info/Pool/Spa, resumo da piscina, FC/pH lado a lado, dosagens, checklist e fotos. Histórico/equipamentos, notas/problemas e detalhes de relatório recolhidos. Finish & Next abre o próximo editor depois do salvamento local, sem aguardar upload. |
| `/team` | Cartões por técnico com piscinas, trabalho restante, visitas confirmadas e pagamento devido estimado. Tarifa por visita, atribuições, acesso/login e convites são expansíveis. Mão de obra própria e administradores ficam em áreas opcionais. |
| `/finance` e `/finance/pools/[id]` | Contribuição simples; contexto de cliente/piscina respeita receita do cliente, sem multiplicar contratos por corpo d’água. Previsão e visitas confirmadas são visões separadas. |
| `/finance/advanced`, `/finance/advanced/pools/[id]`, `/finance/costs` | Mantêm as funções e configurações V2.4, inclusive períodos fechados e despesas antigas, fora do fluxo principal. Nenhum valor antigo foi apagado/regravado em massa. |
| `/legacy/financials` | Consulta Owner-only às premissas V1 da PR #7, se instaladas. Tarifas positivas anteriores podem ser revisadas e copiadas explicitamente no editor simples; não são aplicadas automaticamente. |
| `/legacy/subcontracts` | Acesso opcional aos clientes e rotas de subcontratos existentes. Não cria novo tracker de ganhos, nem exige copiar contatos, relatórios ou fotos de outras empresas. |
| `/maps` | Mantém GPS, pinos, mapa/satélite e planejamento, acessíveis por More. |
| `/history`, `/reports` | Reutilizam o histórico existente. Técnico recebe somente visitas autorizadas; controles de entrega permanecem gerenciais. Reports passou a ser acessível ao técnico para seu histórico autorizado. |
| `/settings`, `/settings/health` | Preferências e configurações mantidas sob More; System Health continua Owner-only e secundário. |
| `/customers/legacy` | Revisão auditada de mensalidades antigas preservada em More → Advanced & legacy. |
| `/more` | Destinos filtrados pelo papel, sem Team duplicado ou controles administrativos no técnico. |
| `/login`, `/join` | Fluxos de autenticação, convites e bootstrap existentes preservados. Nenhuma mudança de privilégios por metadados de signup. |
| `/offline` | Shell público atualizado para V3; mesmo IndexedDB, chaveamento por conta e outbox. Atualização troca somente assets públicos em Cache Storage. |

## Contribuição e pagamentos

**Receita mensal do cliente − pagamentos aos técnicos = contribuição estimada.** Químicos aplicados permanecem no registro técnico/relatório, sem preços obrigatórios na contribuição. Combustível, veículo, seguro, ferramentas e despesas da empresa não são campos obrigatórios deste fluxo e não são subtraídos novamente do pagamento contratado.

- Valores monetários em centavos inteiros; percentuais e rateios usam as funções exatas existentes. A entrada aceita ponto/vírgula com até duas casas decimais. Não há valor US$140/US$25 fixo em código de produção.
- Calendário real: dias da semana, início/fim, skips e stops extras. Reatribuir uma recorrência no meio do mês não cria uma segunda visita prevista para a ocorrência já realizada pelo técnico anterior.
- Um imóvel pode conter várias piscinas/spas: uma parada não multiplica receita nem pagamento por piscina.
- Tarifa específica do cliente prevalece sobre o padrão do técnico para trabalho delegado. O override é vinculado ao primeiro contrato mensal próprio ativo, com ordenação estável, e cobre os atendimentos do cliente; os demais contratos não multiplicam o pagamento. Ao limpar o override, volta a valer a tarifa do técnico.
- Mão de obra de Owner/admin permanece **sem preço** quando só existe uma tarifa genérica. Uma tarifa pessoal explícita em Team permite precificar esse trabalho. A contribuição fica indefinida quando falta esse valor; a tela mostra o valor **antes da mão de obra**, sem chamá-lo de contribuição/lucro.
- Visitas confirmadas usam tarifas capturadas no servidor. Para mão de obra própria, o cálculo consulta a configuração privada capturada na visita; alterar a tarifa pessoal depois não reprecifica a visita anterior.
- Clientes inativados com trabalho confirmado no período mantêm os valores devidos ao técnico, sem entrar no MRR atual. Receita histórica ausente permanece desconhecida.
- Acordos mensais e adicionais legados continuam sendo respeitados pelos cálculos; não são convertidos silenciosamente para pagamento por visita.
- MRR é receita recorrente contratada de clientes próprios com recorrência vigente. Trabalho recebido por subcontrato fica separado. Contribuição não é lucro líquido nem lucro contábil.
- **Pagamentos devidos** calculados de visitas confirmadas não comprovam transferência bancária. Não foi criado processamento de pagamentos nem um livro de quitações.
- O relatório V2.4 arquivado continua intacto. A visão V3 é uma estimativa viva e pode incluir visitas sincronizadas tardiamente; não reabre nem regrava períodos financeiros fechados.

## Reconciliação com a PR #7

O código da PR #7 foi lido pela referência Git `refs/pull/7/head`, commit `5f00fa0`. A API GitHub respondeu Forbidden; comentários e estado da PR não puderam ser consultados. A revisão identificou: formulário de custos por cliente, suposição de 4,33 visitas/mês, químicos/combustível/overhead misturados à contribuição e uma migration também numerada `026`.

Os históricos são diferentes:

- V2.4 nesta base: `202610310026_profitability.sql`, preservada sem alteração.
- PR #7: `202610310026_customer_profit_costs.sql`, com tabela `customer_profit_costs`.
- V3: **`202611010027_finance_v30_bridge.sql`** resolve o conflito sem apagar dados: se o banco já tem as tabelas V2.4, não faz mudanças; se carrega apenas a versão 026 da PR #7, cria a persistência privada necessária para tarifas versionadas. O SQL original da PR #7 é usado apenas como fixture no teste da segunda base, não como uma segunda migration 026.

A tabela V1 não é apagada, sobrescrita nem transformada em despesas V3. Os valores antigos ficam acessíveis em More; a sugestão de tarifa exige revisão e Save do Owner. O antigo formulário complexo não é a tela padrão de `/finance`.

## Segurança e dados

`/api/contribution` valida sessão Owner ativa, mês, UUIDs, valores, mesma origem e referências da própria organização. A escrita reaproveita o RPC de finanças com RLS, revisão esperada, lock e idempotência. Technician/Admin não recebem dados desse endpoint. Configuração financeira nunca é persistida no armazenamento offline do técnico.

Nenhuma alteração de schema de visitas, fotos, relatórios, contratos ou filas foi feita. IndexedDB continua `alys-field-device-v1`. O novo service worker usa Cache Storage `alys-field-shell-v30` e não apaga IndexedDB, fotos ou outbox. Pendências locais continuam distintas de confirmação no servidor.

## Testar localmente

Siga [LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md), preserve `.env.local` e use somente Supabase local. Não execute reset nem fixtures contra o projeto hospedado.

```bash
npm ci
SUPABASE_TELEMETRY_DISABLED=1 npx --yes supabase@2.121.0 migration up --local
npm run lint
npm run typecheck
npm test
npm run test:db
ALYS_TEST_V1_BRIDGE=1 npm run test:db
npm run build
```

O segundo teste SQL simula a migration 026 da PR #7 e valida a ponte 027. Ambos usam PostgreSQL descartável sem limpar o banco de desenvolvimento.

Com servidor de produção local iniciado em 3006, envio de e-mail/convites desativado e routing stub conforme o guia local:

```bash
node tests/integration/setup.mjs
node tests/integration/setup-v30.mjs
TEST_BASE_URL=http://127.0.0.1:3006 npx playwright test v30-business.spec.ts v30-visual.spec.ts v23-review.spec.ts v23-mobile.spec.ts v221-recovery.spec.ts offline-shell.spec.ts --project=mobile-chromium
```

Para refazer as capturas BEFORE, é necessário executar `v30-visual.spec.ts` com `V30_CAPTURE_PHASE=before` no commit anterior `bcfcd47`. As imagens BEFORE foram renderizadas a partir do commit anterior em um servidor separado, usando os mesmos dados fictícios das imagens AFTER; não foram fabricadas a partir do CSS novo.

## Aceite visual — 390 × 844

DPR 3: os PNGs têm 1170 × 2532 pixels, correspondentes ao viewport CSS de 390 × 844.

| Tela | Antes | Depois |
| --- | --- | --- |
| Owner Home | [BEFORE](screenshots/v30/before-owner-home.png) | [AFTER](screenshots/v30/after-owner-home.png) |
| Customers | [BEFORE](screenshots/v30/before-customers.png) | [AFTER](screenshots/v30/after-customers.png) |
| Customer Profile | [BEFORE](screenshots/v30/before-customer-profile.png) | [AFTER](screenshots/v30/after-customer-profile.png) |
| Today’s Route | [BEFORE](screenshots/v30/before-todays-route.png) | [AFTER](screenshots/v30/after-todays-route.png) |
| Service Visit | [BEFORE](screenshots/v30/before-service-visit.png) | [AFTER](screenshots/v30/after-service-visit.png) |
| Team | [BEFORE](screenshots/v30/before-team.png) | [AFTER](screenshots/v30/after-team.png) |
| Profitability | [BEFORE](screenshots/v30/before-profitability.png) | [AFTER](screenshots/v30/after-profitability.png) |
| Technician Today | [BEFORE](screenshots/v30/before-technician-today.png) | [AFTER](screenshots/v30/after-technician-today.png) |

As capturas do Skimmer fornecidas na conversa e a reconstrução V2.3 orientaram a hierarquia. Não foram copiados marca ou assets. A pasta de referências `docs/ux-references/v23` não está presente neste checkout; não foi alegada leitura de arquivos de imagem ausentes.

## Arquivos principais

- `src/lib/business/{contribution,navigation,server}.ts`: contribuição, crescimento, fontes e navegação por papel.
- `src/app/api/contribution/route.ts`: leitura e gravação segura das tarifas.
- `src/components/business/{ui,payment-rate,contribution-screen}.tsx`, `business.css`: componentes reutilizáveis e finanças simples.
- `src/components/{shell,customer-manager,customer-onboarding,team-manager}.tsx`: navegação, cadastro unificado, delegação e disclosures.
- `src/components/mobile/{dashboard,field-layout}.tsx`, `src/components/field/field-app.tsx`: Home, rota e visita reconstruídos.
- Páginas Home/More/Customer/Finance/Reports/Legacy, API de clientes e metadados de rotas, tradução EN/PT/ES e shell público.
- Migration 027, testes de domínio/permissão/SQL/mobile/offline, fixtures exclusivamente locais e as 16 capturas desta revisão.

## Resultados finais de validação

- `npm run lint`, `npm run typecheck` e `npm run build`: aprovados.
- `npm test`: **189 testes em 29 arquivos**, todos aprovados.
- `npm run test:db` e `ALYS_TEST_V1_BRIDGE=1 npm run test:db`: aprovados em PostgreSQL descartável; a segunda base conserva registros V1 anteriores à ponte 027.
- Integração/mobile: **12/12 aprovados** — 9 regressões de negócio/permissões/dashboard/mapa/offline/recuperação, 1 aceite visual V3 e 2 regressões das finanças legadas. A captura BEFORE no commit `bcfcd47` passou adicionalmente (1/1).
- Fotos JPEG/HEIC, reabertura offline, perda de autenticação, retomada após conclusão incerta, isolamento de organização/técnico e tarifas capturadas foram exercitados localmente.
- As oito comparações BEFORE/AFTER foram revisadas visualmente. Viewport **390 × 844**, sem overflow horizontal detectado. Navegação Owner com cinco destinos, Technician com três, limites sem sobreposição e alvos de pelo menos 44 px. FC 5 e pH 8.0 ficam inteiramente acima do rodapé Finish & Next.
- Regressões adicionais cobrem PT/EN/ES e larguras 320/390/430; o aceite visual é evidência separada dos testes funcionais.
- A última finalização corrigiu somente espaço/contraste e testes: a antiga expectativa fixa de quatro segundas-feiras no teste V2.4 passou a contar o calendário real. Não foi alterado o cálculo financeiro para satisfazer esse teste.
- Conferência das imagens: 16 PNGs válidos, 1170 × 2532 pixels (DPR 3). Conferência de segredos nos arquivos preparados para commit: aprovada.
- Nenhum merge, deploy, reset, envio externo de e-mail ou migration remota foi executado.

## Pendências de homologação

Validar em iPhone/Safari físico: teclado decimal, câmera HEIC real, permissões GPS, safe areas, suspensão prolongada e retorno após bloqueio da tela. Não houve envio real de e-mail, teste de DNS/domínio, deploy ou aferição de tempo com técnico em campo. Meses sem fontes históricas capturadas continuam estimativas; não se inventam receitas nem tarifas passadas. Antes de uma publicação futura, revisar o histórico de migrations do ambiente e aprovar a aplicação da 027 separadamente.
