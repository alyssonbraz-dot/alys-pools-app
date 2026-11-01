# ALYS V2.4 — Profitability & Business Costs

Branch de revisão: `feature/alys-v2-4-profitability`. Módulo financeiro exclusivo do Owner; não processa cobranças nem transfere dinheiro. Reutiliza login, contratos, imóveis, piscinas, agendas e visitas confirmadas. Sem novos serviços, dependências de runtime ou alterações na fila offline.

## Uso

1. Owner → More → **Business Costs** (`/finance/costs`). Selecione o mês atual ou futuro. Cadastre seguro, software, marketing, administração e demais custos; escolha valor mensal ou por parada prevista. Campos vazios são desconhecidos; informe **0** apenas quando confirmado. Percentuais aceitam duas casas decimais.
2. Configure os pagamentos e as responsabilidades por químicos, combustível, veículo e ferramentas. Prioridade: contrato → técnico → padrão. Valores do exemplo de negócio não são defaults: configure US$140 no contrato e US$25 por visita nas condições de pagamento, se esses forem os valores acordados. Visita extra = parada sem agenda recorrente; possui tarifa própria. Serviços adicionais têm tarifa e contagem separadas.
3. Salve a configuração, depois registre totais mensais de despesas, recebimentos e número de transações. Os totais **substituem a revisão anterior**, não são somados novamente. Informe despesas diretas pagas pela ALYS por piscina, separando previsão e registrado. Confirme os totais de despesas diretas nas duas visões, inclusive zero. Não registre novamente gastos cobertos pelo pagamento do técnico.
4. **Profit Result** (`/finance`) mostra empresa, MRR próprio separado dos subcontratos, contribuição, despesas, lucro/margem operacional e lucro por visita. Alterne **Forecast** e **Recorded / accrued**. Ordene piscinas e expanda os totais de cliente/técnico. O pagamento do técnico é um valor devido, não comprovante de transferência.
5. Cliente → Properties & Pools → **Pool Profitability**. Mostra contrato, paradas previstas/concluídas, responsáveis, tarifas, custos rateados, recomendação e comparação mensal. Alterar a classificação não cancela contratos.
6. **Capture period sources** preserva a configuração comercial/recorrência do período. **Recapture period sources** atualiza explicitamente um período aberto com os cadastros atuais e arquiva a captura anterior; em meses passados isso é identificado como estimativa, não reconstrução histórica. O mês atual aberto acompanha os cadastros atuais; meses anteriores usam os dados capturados. Depois de conferir um mês anterior com todos os valores registrados, use **Close period**. O fechamento é imutável e alimenta os gráficos históricos. Visitas sincronizadas tardiamente não reabrem um mês fechado: exigem revisão financeira explícita fora desse fechamento.

## Regras de cálculo

- Centavos inteiros; percentuais em pontos-base. Multiplicação/divisão e rateio usam `BigInt`; o maior resto distribui os centavos, com desempate estável.
- Contribution = Revenue − Technician Cost − ALYS Direct Expenses − Processing Fees. Operating Profit = Contribution − Company Operating Expenses. Operating Margin = Operating Profit / Revenue. Receita zero tem margem indefinida.
- A previsão usa contrato mensal ou tarifa por parada e o calendário real da recorrência, respeitando início/fim, dias únicos, stops extras e skips registrados. Não presume quatro semanas. Pagamentos realizados/devidos usam visitas existentes no servidor, uma por stop; pendências IndexedDB não são concluídas financeiramente.
- Uma parada atende um imóvel. Seu custo é dividido entre as piscinas, sem multiplicar o pagamento por piscina. A receita mensal do cliente é dividida igualmente entre suas piscinas elegíveis. Um pagamento mensal por contrato é contado uma vez mesmo com vários técnicos; pagamento mensal padrão/por técnico aplica uma vez por carteira atribuída, inclusive sem visitas no mês. Não há pró-rata automático.
- Receita e custos administrativos atribuídos ao técnico seguem a participação nas paradas/piscinas atendidas; o pagamento usa o técnico que concluiu a visita. Trata-se da contribuição da carteira à ALYS, não do lucro pessoal do técnico.
- Custos da empresa são distribuídos por receita prevista ou por quantidade de piscinas. Receita desconhecida impede rateio por receita; o valor fica identificado como não distribuído. O total da empresa sempre inclui os custos cadastrados, mesmo sem piscinas elegíveis.
- Forecast de processamento: percentual da receita prevista + uma taxa fixa por acordo recorrente. Registrado: percentual dos recebimentos + taxa fixa por transação informada. Despesas e recebimentos ausentes deixam lucro/margem como não cadastrados; totais conhecidos não são apresentados como resultado completo.
- Subcontratos ficam separados do MRR próprio. Contratos de valor fechado exigem recebimentos do período; não se inventa receita mensal para eles. Nenhum resultado representa lucro líquido contábil ou recolhimento de impostos.

## Persistência e permissões

Migration **`202610310026_profitability.sql`**, aditiva às 001–025:

- `finance_config_versions`: configurações com vigência mensal e histórico imutável. Novas configurações não podem ser retroativas; concorrência usa revisão esperada.
- `finance_record_versions`: revisões de totais/despesas por mês, com IDs idempotentes.
- `finance_period_sources`: captura de clientes, contratos, piscinas, agendas e técnicos do período, com capturas anteriores arquivadas ao recapturar.
- `finance_closed_periods`: inputs e resultados imutáveis de meses fechados.
- `finance_visit_terms`: condições financeiras privadas capturadas na confirmação da visita ou no primeiro cadastro válido dos custos. Uma alteração posterior da tarifa não reprecifica a visita já capturada. Condições sem tarifa suficiente permanecem desconhecidas até haver baseline válido.

As cinco tabelas têm RLS de leitura exclusiva do Owner. Browser não possui grants de escrita. Mutações exigem sessão Owner ativa, mesma origem, validação Zod e RPC restrita a `service_role`, que valida novamente organização/Owner e serializa alterações. As condições financeiras ficam **fora** do snapshot de visita acessível ao técnico. Technician e Admin não recebem configurações, margens ou custos desta API. Não há financeiro no cache/IndexedDB do técnico.

Instalação local: siga [desenvolvimento local](LOCAL-DEVELOPMENT.md), preserve `.env.local` e execute:

```bash
SUPABASE_TELEMETRY_DISABLED=1 npx --yes supabase@2.121.0 migration up --local
npm run dev
```

A API usa a chave server-only `SUPABASE_SERVICE_ROLE_KEY` já prevista no `.env.example`; nunca a exponha como `NEXT_PUBLIC_*`. Não foram executadas migrations remotas. Atualização hospedada depende de revisão/aprovação separada, backup e aplicação ordenada das migrations.

## Testes e capturas

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Para integrar, use somente Supabase local, build de produção e envios externos desativados conforme `LOCAL-DEVELOPMENT.md`. O fixture financeiro cria uma empresa e contas fictícias isoladas; nunca executá-lo no projeto hospedado:

```bash
node tests/integration/setup.mjs
node tests/integration/setup-finance.mjs
# Inicie o servidor de teste em outro terminal; ajuste a origem se usar outra porta.
TEST_BASE_URL=http://127.0.0.1:3006 npx playwright test v24-finance.spec.ts offline-shell.spec.ts v221-recovery.spec.ts v23-review.spec.ts --project=mobile-chromium
```

`test:db` aplica todas as migrations e testes SQL em PostgreSQL descartável; não limpa o Supabase de desenvolvimento. A integração financeira verifica formulário persistido, cálculos, reenvio idempotente, custos duplicados do técnico, imutabilidade histórica, RLS/API e layouts PT/EN/ES em 320/390/430 px.

Screenshots reais com dados fictícios, viewport de **390 × 844** (DPR 3), captura da página completa:

- [Business Costs](screenshots/v24/business-costs.png)
- [Pool Profitability](screenshots/v24/pool-profitability.png)
- [Profit Result](screenshots/v24/profit-result.png)

## Limites para homologação

- Sem dados históricos capturados antes da V2.4, meses antigos são identificados como estimativas com fontes atuais. Não se reconstrói silenciosamente contrato/agendamento que já foi alterado. Tarifas não cadastradas para esses meses permanecem desconhecidas.
- Recebimentos e despesas da ALYS exigem lançamento/validação do Owner; não há integração bancária, conciliação de cobrança, impostos, transferências ou conversão cambial. A moeda existente no banco é USD, formatada conforme EN/PT/ES.
- Custos mensais/contratos não têm pró-rata diário. Caso existam condições de vários contratos concorrentes para o mesmo cliente, o cálculo pede revisão em vez de somar pagamentos contraditórios.
- Formulários financeiros exigem conexão; fluxo offline do técnico permanece o existente. Validar teclado, toque, área segura e legibilidade em iPhone/Safari físico. O navegador automatizado é Chromium com viewport de iPhone; não comprova comportamento de Safari ou entrega real de e-mails.

## Arquivos da entrega

- Interface: `src/components/finance/finance-app.tsx`, `src/components/finance/finance.css`.
- Páginas: `src/app/(protected)/finance/page.tsx`, `finance/costs/page.tsx`, `finance/pools/[id]/page.tsx`.
- Integração: `src/app/(protected)/customers/[id]/page.tsx`, `src/app/(protected)/more/page.tsx`, `src/lib/i18n/messages.json`.
- API e cálculos: `src/app/api/finance/route.ts`, `src/lib/finance/schema.ts`, `src/lib/finance/model.ts`, `src/lib/finance/server.ts`.
- Banco: `supabase/migrations/202610310026_profitability.sql`, `supabase/tests/finance.sql`.
- Testes: `tests/finance.test.ts`, `tests/finance-access.test.ts`, `tests/integration/setup-finance.mjs`, `tests/integration/v24-finance.spec.ts`.
- Documentação: `README.md`, este relatório e as três imagens em `docs/screenshots/v24/`.

## Resultado desta revisão

- `npm run lint`, `npm run typecheck` e `npm run build`: passaram.
- `npm test`: **165 testes**, em 27 arquivos, passaram.
- `npm run test:db`: todas as migrations 001–026 e suítes SQL passaram em PostgreSQL descartável, incluindo isolamento financeiro, idempotência, concorrência, tarifa capturada e recaptura com histórico.
- Playwright: **8 testes passaram** nos quatro arquivos indicados acima. Incluem persistência financeira real no Supabase local, PT/EN/ES em 320/390/430 px, RLS, perda de autenticação, JPEG/HEIC, falha de upload, resposta de conclusão perdida e reabertura offline sem duplicar visitas/relatórios.
- Capturas das três telas revisadas visualmente. Os testes não comprovam Safari/iPhone físico, DNS, produção ou entrega externa de e-mail.

Não houve merge, deploy, migrations remotas ou ativação de serviços pagos. Todas as migrations e fixtures desta execução foram aplicadas apenas a bancos locais/descartáveis.
