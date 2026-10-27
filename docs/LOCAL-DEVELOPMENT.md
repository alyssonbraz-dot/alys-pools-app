# Desenvolvimento e teste local

Para publicação e DNS de `alyspools.com`, use o [README](../README.md). Este guia usa somente dados fictícios em backend local, sem envio de e-mail externo.

## Pré-requisitos

Git, Node.js >=22, npm e Docker em execução. No Windows, use WSL2/Ubuntu com integração do Docker Desktop. A demonstração independente `demo/index.html` pode ser aberta diretamente sem esses serviços, mas não testa autenticação/RLS/Storage ou envio real.

```bash
git clone https://github.com/alyssonbraz-dot/alys-pools-app.git
cd alys-pools-app
npm ci
cp .env.example .env.local
```

Se o arquivo já existir, preserve-o. Em cloud com HOME restrito, use `npm --cache /tmp/alys-npm ci`. Nunca cole chaves no chat ou em arquivos versionados.

## Backend local

Com Docker iniciado:

```bash
SUPABASE_TELEMETRY_DISABLED=1 SUPABASE_USE_SLIM_IMAGES=1 \
  npx --yes supabase@2.121.0 start \
  -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

SUPABASE_TELEMETRY_DISABLED=1 npx --yes supabase@2.121.0 migration up --local
npx --yes supabase@2.121.0 status
```

O primeiro start baixa imagens. Confira o status no seu terminal privado e preencha `.env.local`:

| Variável | Origem |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | API URL local, normalmente `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável/anon local |
| `SUPABASE_SERVICE_ROLE_KEY` | chave administrativa local, somente servidor |
| `EMAIL_DELIVERY_ENABLED` | `false` |
| `CUSTOMER_INVITES_ENABLED` | `false` |

Use migrations até **014**, sem resetar banco existente. O seed não é automático. O status contém segredos: não o publique. Reinicie o Next após alterar variáveis.

## Criar conta fictícia e abrir

```bash
node tests/integration/setup.mjs
npm run dev
```

O setup aceita somente localhost/127.0.0.1; cria contas isoladas e três stops fictícios, sem envio de mensagem. O login gerado fica em **`/tmp/alys-integration-fixture.json`**, com permissão restrita. Consulte `email` e `password` somente no seu terminal/editor privado.

Abra **http://localhost:3000**. Clients cadastra clientes, Properties & pools configura piscinas, Settings define recorrência e Stops abre os atendimentos do dia. Signup público permanece desabilitado.

Cada setup cria novos dados de teste. Não use esse script nem `seed.dev.sql` no Supabase hospedado. O arquivo `index.html` na raiz é o protótipo antigo, não a aplicação Next.js.

## Validação automatizada

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`test:db` inicia PostgreSQL descartável próprio, com harness Auth/Storage mínimo; não limpa o Supabase local ou remoto. Integração abaixo usa Auth e Storage locais reais. Testes de e-mail simulam o provedor, sem envio externo.

Para testar offline/PWA use o build de produção. Pare `npm run dev` e inicie o Next com os overrides de mapas **apenas para os testes**:

```bash
ROUTING_API_URL=http://127.0.0.1:8131 \
GEOCODING_API_URL=http://127.0.0.1:8131/search npm start
```

Em outro terminal, deixe o stub local aberto:

```bash
node tests/integration/routing-stub.mjs
```

Em um terceiro terminal execute, nesta ordem:

```bash
node tests/integration/setup.mjs
node tests/integration/backend.mjs
npx playwright install chromium
npx playwright test
npx playwright test --config=playwright.demo.config.ts
```

O backend espera fixture nova, ainda sem visitas concluídas. Para repetir a sequência completa, execute setup novamente. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite indicar um browser; `/usr/bin/chromium` é usado quando existe. `TEST_BASE_URL` permite outra origem local para os testes.

Remova os overrides e reinicie `npm start` para operação normal. Não use tempos/endereços fictícios do stub em produção. A função agendada Netlify não roda com `next start`; sua recuperação remota deve ser validada no deploy de produção.

## Limites e particularidades do ambiente cloud

- Se o registry padrão de imagens estiver bloqueado, o override `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io` pode acessar as imagens oficiais. Avalie o erro antes de usá-lo.
- Imagens slim e exclusão dos serviços opcionais reduzem uso de disco; não dispensam testes de saúde.
- Nesta cloud, health probes herdaram proxy e falharam mesmo com Auth/REST/Storage acessíveis. O uso anterior de `--ignore-health-check` foi diagnóstico, não prova de disponibilidade. Verifique os endpoints e testes antes de prosseguir.
- PWA requer HTTPS fora de localhost. Camera real/Safari e restauração após suspensão pelo celular precisam de validação física.
- Nenhum teste local comprova DNS, certificado, conta gratuita, execução de agenda hospedada ou entrega real de e-mail.

Resultados e histórico: [VALIDATION](VALIDATION.md). Segurança/offline: [Fast Technician Mode](FAST-TECHNICIAN-MODE.md).
