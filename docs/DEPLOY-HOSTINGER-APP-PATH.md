# ALYS V3 em https://alyspools.com/app

Esta branch é revisão do PR #9. Nenhum deploy, alteração de DNS, envio real de email ou migration remota é feito pelos comandos de teste. O site comercial permanece na Hostinger; o aplicativo Next.js permanece no Netlify.

## Netlify

Use um **site de staging separado** inicialmente, conectado à branch `feature/alys-hostinger-app-path`. Mantenha `netlify.toml` e o plugin Next.js existentes. Node >=22, `npm ci`, build `npm run build`, publish `.next`.

Variáveis de **build e runtime**:

```text
ALYS_APP_BASE_PATH=/app
APP_URL=https://alyspools.com/app
```

A configuração Next injeta automaticamente `NEXT_PUBLIC_ALYS_APP_BASE_PATH` no cliente; não configure esse valor separadamente. O prefixo é fixado no build: mudar a variável exige reconstruir. Sem ALYS_APP_BASE_PATH o deployment na raiz continua suportado.

Preserve as variáveis Supabase, Resend e REPORT_WORKER_SECRET já usadas em `.env.production.example`. Segredos continuam server-only. Não execute fixtures, seeds ou `db reset` no projeto hospedado. Confira migrations 026/027 separadamente antes de publicar V3; esta branch não adiciona migrations.

O worker agendado Netlify usa o hostname estável `URL` do Netlify com `/app/api/email/worker`, sem depender de o proxy público estar disponível. Configure o webhook Resend em `https://alyspools.com/app/api/email/webhook`. Mantenha segredo e validação de assinatura existentes.

## Cloudflare + Hostinger

Use `deployment/cloudflare/alys-app-proxy.js` como Worker de revisão. Configure `ALYS_NETLIFY_ORIGIN=https://SEU-SITE.netlify.app` (sem caminho). Ele aceita apenas origem HTTPS Netlify, evitando loops de proxy.

Após autorização de publicação, a zona Cloudflare deverá encaminhar os registros web **para os IPs atuais da Hostinger**, com proxy habilitado; não aponte o domínio inteiro para Netlify. Preserve MX, SPF, DKIM, DMARC e outros registros. Use TLS Full (strict), após conferir os certificados. Não altere DNS para testar esta branch.

Rota do Worker: `alyspools.com/app*`; se utilizado, também `www.alyspools.com/app*`. O alias www redireciona somente os caminhos do aplicativo para alyspools.com, mantendo autenticação em um host canônico; o site comercial www não é alterado. O código filtra a fronteira: `/app` e `/app/...` pertencem ao aplicativo; `/`, `/application`, blog, formulários, SEO e assets do site comercial seguem o request original. `/app` recebe redirect 308 para `/app/` mantendo query, para entrar no escopo PWA. `skipTrailingSlashRedirect` evita o redirect inverso do Next.

Não remova `/app` antes de encaminhar ao Netlify. Preserve método, corpo, cookies, Origin e headers das Server Actions. O Worker substitui X-Forwarded-Host/Proto pelos dados reais do domínio público. Next e a proteção CSRF aceitam somente o host canônico configurado em APP_URL; não é usado wildcard. Redirects do hostname Netlify voltam ao domínio público, preservando caminho; redirects externos não são reescritos.

Não crie regra Cache Everything: o proxy encaminha com no-store e devolve private/no-store. Não armazene HTML autenticado, RSC, APIs, uploads ou respostas com cookies no cache Cloudflare. Os assets públicos do Next são mantidos no cache local do Service Worker.

## Supabase / autenticação

No projeto existente, configure Site URL `https://alyspools.com/app/` e allowlist de redirects `https://alyspools.com/app/join` e demais callbacks realmente usados. Para staging, inclua os endereços correspondentes explicitamente. Convites do aplicativo usam APP_URL com `/app`; CUSTOMER_PORTAL_URL, quando habilitado, é uma URL independente e deve ser configurada por inteiro.

Cookies novos são limitados a `/app` (incluindo a página inicial sem barra), mantendo nomes e sessão Supabase existentes. Os redirects de `next/navigation` e os links/routers Next recebem o prefixo do próprio framework; URLs nativas, APIs, assets e history usam o helper idempotente `src/lib/app-path.ts`.

## PWA, visitas e transição de origem

Manifest: scope e id `/app/`, start_url `/app/stops`; ícones em `/app/icons/...`. Registro `/app/sw.js`, Service-Worker-Allowed `/app/`, escopo `/app/`. O Worker deriva o prefixo do próprio registro e não intercepta marketing ou API. Cache público `alys-field-shell-app-v30`, separado do cache da raiz. A instalação só substitui o shell após todos os assets terem sido obtidos. Ela não abre, apaga ou versiona IndexedDB.

IndexedDB permanece **alys-field-device-v1**, versão 1, com os mesmos IDs e chaves de conta, drafts, fotos e outbox. Repetir upload/conclusão conserva o ID da visita; bytes enviados não equivalem a conclusão confirmada. Falhas de sessão, foto ou visita preservam a fila e a ação Retry.

**Origem diferente significa armazenamento diferente.** Dados de `SEU-SITE.netlify.app` não aparecem automaticamente em `alyspools.com`, mesmo com o mesmo usuário. Mantenha o endereço antigo disponível para sincronizar todas as pendências antes de mudar de origem ou reinstalar o PWA. Não limpe armazenamento como solução. Se já existir um antigo SW ALYS com escopo `/` no mesmo domínio, sua retirada exige identificar esse registro específico e confirmar a fila sincronizada; não desregistre Workers do site comercial em massa.

## Verificação local

```bash
npm ci --cache /tmp/alys-npm-cache
npm run lint
npm test
ALYS_APP_BASE_PATH=/app npm run build
npm run typecheck
npx playwright test --config=playwright.app-path.config.ts
```

O teste mobile inicia o build de produção em localhost:3010. Verifica redirects protegidos, login sem configuração, manifest, ícones, escopo/header SW, APIs e isolamento da raiz; depois registra o PWA, reutiliza IndexedDB, abre uma rota fictícia offline, preenche FC/pH/checklist, captura JPEG pelo input de câmera e executa Finish & Next mantendo a visita pendente. Os testes de domínio exercitam fila antiga falhada, upload retomado, conclusão idempotente e caminhos `/app/api/*`, além de Worker/CSRF/relatórios existentes.

Não há credenciais Supabase/Resend nem imagens Docker de backend neste ambiente. Login com sessão real, confirmação no PostgreSQL/Storage, entrega real Resend e proxy Cloudflare real precisam de homologação em staging. O teste browser de câmera usa arquivo JPEG sintético; câmera física, HEIC de iPhone, suspensão longa, safe areas e instalação iOS devem ser conferidos em dispositivo. Testes automatizados de conversão/HEIC e preservação de fotos continuam na suíte existente.

## Resultado desta revisão

Lint sem avisos, typecheck e build `ALYS_APP_BASE_PATH=/app` aprovados. Suíte de domínio: 201 testes em 32 arquivos aprovados. Browser mobile: 2/2 aprovados no build de produção em `/app`. Câmera real e autenticação/entrega com os serviços de staging permanecem pendentes conforme os limites acima.
