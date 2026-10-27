# ALYS Pool Manager — Fast Route

Aplicação mobile-first em inglês por padrão, com português e espanhol para ALYS Pool Services LLC, Flórida. Next.js + TypeScript + Tailwind, Supabase Auth/PostgreSQL/Storage e PWA. Galões, ppm e timezone America/New_York. Interface em azul-escuro.

Fluxo: **Route → Checklist → Readings → Dosages → Photo → Complete & Next → Email → History**.

Não há financeiro, cobrança, inventário, marketing ou portal de cliente nesta versão. A expansão inclui gestão de clientes, mapas e otimização por tempo de condução com provedor configurado. As tabelas financeiras da fundação foram preservadas para não apagar dados, mas não aparecem na navegação.

## Fast Technician Mode

Technicians use a compact assigned-stops screen and one service form: **Readings → Chemicals → Checklist → Photo → Complete & Next**. Common products have direct buttons; previous readings remain reference only. Predefined issue flags are recorded with the visit. Photo upload shows progress while the technician works at the next stop. Offline submissions are frozen, drained safely and retried with backoff while the app remains open; Pending Sync, Synced and Failed are distinct states.

Apply **migration014** before the new code. Owner/Admin management, existing visits/photos/reports and organization isolation are preserved. See [Fast Technician Mode](docs/FAST-TECHNICIAN-MODE.md) for security, rollout, offline behavior and performance limits. The15–30 second interaction target is not yet validated on a physical phone.

## Colocar visitas e relatórios no ar sem plano pago

Para priorizar login, visitas, fotos e e-mail: siga [o roteiro de publicação gratuita](docs/COLOCAR-NO-AR-GRATIS.md). Inclui configuração Netlify, Supabase hospedado, acesso do proprietário e teste controlado do remetente. Publicação depende de contas/credenciais do proprietário; o código preparado não é prova de site online ou mensagem entregue. Não contrate plano pago nem compre domínio para seguir a parte de hospedagem.

## Teste fácil no navegador — sem instalar nada

Para conhecer o fluxo sem configurar o projeto completo:

1. No GitHub, clique em **Code → Download ZIP** e extraia o arquivo.
2. Abra a pasta **demo** e dê duplo clique em **index.html**.
3. Escolha Chrome ou Edge. Não é necessário Node, Docker, Supabase, login ou internet.
4. Clique em **Start service**, consulte o histórico químico de 30 dias, preencha FC/pH, produtos e foto e toque em **Complete & Next**.
5. Use **History → Preview customer report** para visualizar o relatório. Nenhum e-mail é enviado.

O arquivo `demo/index.html` é independente: pode ser copiado sozinho para outra pasta. A interface inicia em inglês; o seletor permite português e espanhol. Dados fictícios, rascunhos e fotos ficam apenas no navegador por IndexedDB; não são sincronizados. Quando o browser não permite armazenamento, a tela avisa que a sessão é temporária. Não use dados reais de clientes.

A demonstração inclui cadastro de clientes, múltiplas piscinas, dias recorrentes, checklist personalizado, foto opcional/obrigatória e reordenação manual da rota. O arquivo `index.html` **na raiz** ainda é o protótipo antigo; para o protótipo atual use **demo/index.html**.

[Instruções da demonstração](demo/README.md) · [Abrir o arquivo no GitHub para baixar](demo/index.html)

## Começar: baixar, iniciar e testar

**Requisitos:** Git, Node.js 22 ou superior e Docker em execução. No Windows, use Ubuntu/WSL2 com integração do Docker Desktop para seguir os comandos abaixo e executar os testes locais.

Este é o aplicativo Next.js completo. **Não abra o `index.html` para iniciar esta versão:** esse arquivo é apenas o protótipo antigo.

### 1. Baixar o código e instalar

```bash
git clone https://github.com/alyssonbraz-dot/alys-pools-app.git
cd alys-pools-app
npm ci
cp .env.example .env.local
```

Se já clonou, atualize seu checkout antes de instalar. Não substitua um `.env.local` existente: preserve suas configurações.

### 2. Iniciar o banco, login e armazenamento locais

Com o Docker em execução:

```bash
npx --yes supabase@2.121.0 start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npx --yes supabase@2.121.0 migration up --local
npx --yes supabase@2.121.0 status
```

O primeiro comando baixa imagens e pode demorar. Em `.env.local`, preencha com os dados **locais** do status:

| Variável | Valor a usar |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | API URL local |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável ou anon local |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role local, somente no servidor |
| `EMAIL_DELIVERY_ENABLED` | `false` durante testes |

As chaves reais não vêm no Git. Não compartilhe o status ou `.env.local`. Consulte a seção **Particularidades deste ambiente cloud** se encontrar erro de registry, espaço, HOME ou health probe.

### 3. Criar acesso de teste e abrir o app

```bash
node tests/integration/setup.mjs
npm run dev
```

O setup cria uma conta e três stops **fictícios no Supabase local**; não envia e-mails. O cadastro público fica bloqueado. Consulte `email` e `password` em `/tmp/alys-integration-fixture.json` no seu terminal/editor privado para fazer login; não publique esse arquivo.

Abra a aplicação na porta **3000**, faça login e use **Route** para iniciar uma visita. **Clients** cadastra clientes, **Properties & pools** configura piscinas e **Settings** define recorrência. A interface é em inglês por padrão.

### 4. Executar os testes

Em outro terminal, na pasta do projeto:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`test:db` requer Docker e descarta somente o container criado pelo próprio teste. Para testar o fluxo mobile e offline, pare o `npm run dev` com Ctrl+C e inicie o build de produção:

```bash
ROUTING_API_URL=http://127.0.0.1:8131 GEOCODING_API_URL=http://127.0.0.1:8131/search npm start
```

Para a suíte de integração, mantenha também `node tests/integration/routing-stub.mjs` em outro terminal. Ele fornece respostas fictícias locais de mapas/endereços; use os overrides acima somente nos testes. Mantenha os terminais abertos. Em outro terminal, crie uma **fixture nova**, valide o backend e rode os testes de navegador nesta ordem:

```bash
node tests/integration/setup.mjs
node tests/integration/backend.mjs
npx playwright install chromium
npx playwright test
```

Os testes de rotas e endereço exigem o stub local na porta8131 e o Next iniciado com os overrides descritos acima. Não use essas estimativas fictícias em operação.

O teste de backend espera a fixture ainda sem visitas concluídas. Cada execução de setup cria uma nova conta fictícia; para repetir a sequência, execute setup novamente. O Playwright usa Chromium do sistema quando disponível ou o browser instalado por ele; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite indicar outro executável.

O fluxo testado inclui cadastro/edição, histórico químico de 30 dias, checklist, leituras, dosagens, JPEG no Storage privado, conclusão, próximo stop, retomada offline e sincronização sem duplicatas. E-mail real depende de configuração separada do Resend; permaneça com envio desativado nos testes locais.

Cloro livre possui atalhos de **1, 3 e 5 ppm**; pH tem **7.0, 7.2, 7.4, 7.6, 7.8 e 8.0**. Também é possível digitar valores diferentes. São leituras da água; produtos aplicados continuam registrados separadamente com quantidade e unidade.

## Funcionalidades implementadas

- Login por senha, autenticação no servidor, owner/admin e técnicos com RLS por empresa e por rota atribuída. Cadastro público desabilitado.
- Clientes, propriedades e múltiplas piscinas/spas, checklists por piscina, leituras obrigatórias configuráveis, foto opcional/obrigatória e opt-in de relatório por cliente.
- Dias recorrentes (0=domingo), múltiplas visitas semanais, geração idempotente de stops, reordenação manual, adição, início e skip. Links externos de navegação Google/Apple Maps abrem somente ao tocar.
- Histórico químico dos últimos30dias já na tela do stop: referência mais recente visível, anteriores expansíveis, leituras e dosagens por piscina; disponível com a rota offline e sem preencher leituras atuais.
- Visita em uma tela, checklist novo sem herdar marcações, leituras anteriores só como referência, FC/pH prioritários e dosagens reais com produto/quantidade/unidade. Botões de quantidade são atalhos de entrada, não recomendação química.
- Até três fotos, captura traseira solicitada ao browser, compressão local e decodificação/remoção de metadados no servidor, armazenamento privado e acesso assinado. A câmera física depende do dispositivo.
- Complete & Next salva primeiro no IndexedDB, abre o próximo stop do mesmo técnico e sincroniza. Transação no banco valida tudo e grava histórico imutável + fila de relatório. IDs estáveis evitam visitas/relatórios duplicados.
- PWA com shell público offline e rota/rascunhos/blobs/fila separados por conta e empresa. Indicadores distinguem salvo no dispositivo, sincronizado e status do e-mail.
- Histórico de tarefas, leituras, dosagens, fotos e relatório. Correções administrativas são notas anexadas com autor/data sem alterar o snapshot ou reenviar automaticamente.
- E-mail em segundo plano via Resend: dados exatos da visita, foto real anexada/inline, sem notas de portão/acesso. Outbox, leases, backoff e chave idempotente; somente confirmação do provedor marca Sent.

## Requisitos e instalação

Node >=22 (testado com24.19.0), npm e Docker para backend local/testes SQL. Repositório já isolado por tarefa cloud; use o checkout existente, sem criar worktrees sem solicitação.

```bash
npm ci
cp .env.example .env.local
```

Em cloud com HOME restrito use `npm --cache /tmp/alys-npm ci`. Nunca coloque credenciais em arquivos versionados, instruções salvas ou chat. `.env.local` é ignorado.

## Backend local real

Comando mínimo usado nos testes (mantém banco, Auth, REST, Storage e gateway):

```bash
SUPABASE_TELEMETRY_DISABLED=1 SUPABASE_USE_SLIM_IMAGES=1   npx --cache /tmp/alys-npm --yes supabase@2.121.0 start   -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

SUPABASE_TELEMETRY_DISABLED=1   npx --cache /tmp/alys-npm --yes supabase@2.121.0 migration up --local
```

O primeiro start baixa imagens e cria volumes Docker locais. Não reinicialize ou remova um banco com dados sem confirmação e backup. O start aplica migrations pendentes; `migration up --local` também permite aplicar atualizações sem reset. O seed não é automático.

Execute `npx --yes supabase@2.121.0 status` **no seu terminal privado** e configure:

- NEXT_PUBLIC_SUPABASE_URL: API local (porta54321).
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: chave publicável/anon local.
- SUPABASE_SERVICE_ROLE_KEY: chave administrativa **local**, apenas no servidor, necessária para upload validado de fotos e worker. Nunca usar prefixo NEXT_PUBLIC nela.
- EMAIL_DELIVERY_ENABLED=false: mantenha desligado durante os testes locais.

Reinicie o Next depois de mudar `.env.local`. Em Supabase hospedado, migrations/provisionamento e URL/chaves precisam ser configurados em um projeto aprovado; esta entrega não cria serviços externos nem faz deploy.

Auth: `[auth] enable_signup=false` bloqueia cadastro público; `[auth.email] enable_signup=true` mantém o provedor de login por senha funcionando. Provisionamento de usuários e papéis usa canal administrativo, nunca metadata controlável pelo usuário.

Para testar imediatamente com **dados fictícios locais**, após configurar `.env.local`:

```bash
node tests/integration/setup.mjs
```

O script aceita exclusivamente API localhost/127.0.0.1, cria contas isoladas de teste, propriedades/piscinas/stops e salva o login gerado em `/tmp/alys-integration-fixture.json`, com permissão restrita, sem imprimir senha. Consulte esse arquivo apenas no seu terminal privado para entrar no app. Cada execução cria novos dados de teste; não é seed de produção. Para cadastrar seu próprio usuário local, use Auth Admin em canal confiável ou inicie o Supabase Studio separadamente. Vincule o UUID a organizations/profiles conforme a migration; não use signup público.

`supabase/seed.dev.sql` é uma alternativa manual fictícia que exige substituir UUID pelo usuário local existente; não execute junto com um provisionamento conflitante e nunca em banco hospedado.

```bash
npm run dev
```

O app roda na porta3000. Cadastre cliente → propriedade → piscina, configure dias/técnico em Settings ou adicione stop em Route. Clientes/piscinas sem contato real são suficientes para testes. Técnicos veem apenas rotas atribuídas; cadastros administrativos são de owner/admin.

### Particularidades deste ambiente cloud

A telemetria do CLI tentou usar HOME somente leitura; `SUPABASE_TELEMETRY_DISABLED=1` resolve. Imagens slim evitaram falta de espaço no daemon Docker. Quando o registry padrão for negado, use o override oficial `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io` para as imagens oficiais do Supabase.

Health probes internos herdaram proxy HTTP e falharam mesmo com serviços funcionando. Isso foi diagnosticado por requisições reais Auth/health, Storage/status e REST, além dos testes completos de login/upload. `--ignore-health-check` foi usado somente para manter containers e investigar; não é prova de disponibilidade. Não ignore novas falhas sem investigar os serviços. Esta particularidade e o procedimento exato do teste estão no registro de validação.

## E-mail real e worker

O código integra Resend; **nenhum envio real foi feito sem configuração**. Para testar com o destinatário autorizado `alyspools@gmail.com`, configure no servidor:

```dotenv
EMAIL_DELIVERY_ENABLED=true
RESEND_API_KEY=<secure-server-key>
EMAIL_FROM=ALYS Pool Services <sender@your-verified-domain>
SUPABASE_SERVICE_ROLE_KEY=<server-only-project-key>
REPORT_WORKER_SECRET=<random-secret-with-at-least-32-characters>
```

Valores reais somente em `.env.local`/secret manager/configurações seguras. O domínio HTTPS necessário é `api.resend.com`. O remetente/domínio deve estar verificado no provedor. Habilite Email Reports no cliente de teste e use somente o destinatário autorizado. Não ative integrações pagas sem autorização.

A conclusão já dispara o processamento com `after()` sem bloquear o próximo stop. Configure também um scheduler confiável a cada60s para retomar jobs após falhas/restarts. Endpoint: `POST /api/email/worker`, header `Authorization: Bearer <REPORT_WORKER_SECRET>`. Nunca coloque o segredo na URL. Não foi provisionado scheduler externo nesta entrega.

O worker só opera com configuração completa e habilitada; sem ela jobs ficam Pending, attempts não é consumido e não há envio. Tentativas em falha respeitam backoff e até5 tentativas automáticas. History permite retry administrativo do mesmo job, sem criar um novo relatório. Sent significa **aceito pelo Resend com ID do provedor**, não confirmação de chegada/abertura na caixa postal; webhooks de bounce/delivery não foram implementados.

O payload completo (HTML/texto/destinatário/remetente/fotos) é congelado antes do primeiro envio; novas tentativas usam os mesmos bytes e chave. Depois de22h desde a primeira tentativa, reenvio incerto é bloqueado para não ultrapassar a deduplicação de24h do provedor. Reconciliar manualmente com o provedor antes de qualquer nova entrega. Mudança de opt-in ou destinatário impede o envio pendente; não redirecionamos relatórios silenciosamente.

## Offline e instalação PWA

Em produção é necessário HTTPS (localhost é a exceção). iPhone/Safari: Share → Add to Home Screen. Android/Chrome: menu → Install app. Abra a rota online uma vez e aguarde a instalação do shell antes de trabalhar sem rede.

Para testar offline de forma reproduzível, prefira `npm run build && npm start`. CacheStorage guarda apenas shell genérico `/offline`, ícones e chunks públicos, nunca HTML autenticado, APIs, fotos privadas ou payload RSC. IndexedDB guarda a rota e o trabalho do usuário/empresa no dispositivo, incluindo notas internas necessárias ao serviço; use aparelho pessoal protegido. Isso não é backup nem criptografia local: apagar dados do browser, pressão de armazenamento ou perda do aparelho podem perder trabalho ainda não sincronizado.

O queue uploader preserva UUID da visita/foto e o horário efetivo informado pelo dispositivo. `received_at` registra o recebimento pelo servidor separadamente. Só a confirmação da transação remove rascunhos/blobs locais. Falha de upload mantém trabalho para retry; falha de e-mail não desfaz a visita. Sincronização automática ocorre com o app aberto e rede restaurada; mobile OS pode suspender o app fechado, então reabra para sincronizar. Nenhuma promessa de background sync ilimitado.

Rejeição definitiva422 permite editar o rascunho e tentar com o mesmo ID; falhas de rede/resultado incerto mantêm snapshot local bloqueado para não alterar algo possivelmente aceito. Verifique History em conflito409. Logout avisa sobre pendências e limpa dados locais, serializando com sincronização para evitar repopulação após sair. Não compartilhe o aparelho enquanto houver trabalho offline.

## Testes

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm start
```

Testes de integração com backend local configurado (somente localhost):

```bash
node tests/integration/setup.mjs
node tests/integration/backend.mjs
npx playwright test
```

Os testes Playwright usam Chromium local em `/usr/bin/chromium` quando ele existe; caso contrário, usam o browser instalado com `npx playwright install chromium`. Ajuste `PLAYWRIGHT_CHROMIUM_EXECUTABLE` para um executável específico. Não é preciso instalar outro browser neste ambiente cloud. `TEST_BASE_URL` altera a origem local do app.

O teste SQL usa um PostgreSQL descartável próprio, sem portas/volumes persistentes, com harness auth/storage mínimo; já os testes de integração usam Supabase real. Nunca confundir esses níveis de validação. Testes de e-mail simulam provedor e não enviam mensagens externas.

Resultados e limitações em [VALIDATION](docs/VALIDATION.md). Esquema, permissões e decisões em [ARCHITECTURE](docs/ARCHITECTURE.md). Revisão do protótipo em [REVIEW](docs/REVIEW.md).

## Histórico anterior

index.html, app.js e styles.css continuam na raiz como referência; Next não os expõe em public/. O protótipo antigo usa localStorage; a demonstração atual usa IndexedDB. Nenhum deles deve receber dados reais. Não registrar seu worker antigo no novo app. O worker da PWA nova remove o cache antigo ALYS ao ativar.

## Expansão: clientes, idiomas e rotas

O seletor **Language** troca EN/PT/ES sem apagar formulário ou leituras e guarda a preferência neste navegador. Inglês continua padrão. Nomes, endereços e notas digitados não são traduzidos; os snapshots de relatório mantêm seus valores originais.

**Clients** oferece busca, filtro por status/tags, ordenação, seleção múltipla, CSV, cadastro/edição/consulta, tags, técnico, frequência, endereço de cobrança e mensalidade em USD. Ações em lote e exclusão exigem confirmação na interface. Delete arquiva o cliente, preservando propriedades e histórico. Dados de cobrança/notas administrativas ficam em tabela acessível apenas a gestores. O preço cadastrado não representa receita recebida, MRR calculado ou lucro; não soma carteira própria com subcontratos. Atribuição/frequência no perfil do cliente não remanejam stops existentes: configure a agenda em Settings.

**Route** inclui calendário semanal, mapa recolhível no celular e lista/mapa lado a lado em telas maiores. Marcadores numerados exibem o stop escolhido e permitem iniciar a visita/navegar. Há reordenação por arraste no desktop e botões no celular. Configure coordenadas em Clients, local/horário inicial no mapa e calcule ou otimize o percurso. A otimização usa matriz de tempo viário, até50 stops abertos, com heurística de melhoria; não garante ótimo global. Stops concluídos/ignorados mantêm suas posições. Alterar ordem/status invalida estimativas antigas.

Configurações opcionais no servidor (reinicie o Next após alterar):

```dotenv
# Serviço compatível com OSRM table/v1 e route/v1; use uma instância autorizada.
ROUTING_API_URL=
# Endpoint /search compatível com Nominatim; consulta explícita, nunca automática em massa.
GEOCODING_API_URL=
# Tiles públicos; esta variável é incorporada no build.
NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Tiles requerem internet e atribuição OpenStreetMap. Coordenadas são enviadas ao provedor viário quando você calcula/otimiza; endereço é enviado ao geocodificador apenas ao tocar **Locate service address**. Avalie termos, capacidade e privacidade do provedor escolhido antes de operar com dados reais. Sem geocodificador, digite coordenadas; sem roteador, a lista/manual funciona e a aplicação informa que não calculou distâncias. Tiles e cálculos viários não são garantidos offline. Nesta cloud, a tentativa real de OSRM foi bloqueada pelo proxy403; testes de contrato usam um serviço local simulado.

**Convites:** `CUSTOMER_INVITES_ENABLED=false` por padrão. Para habilitar, é necessário um portal HTTPS existente em `CUSTOMER_PORTAL_URL`, redirect permitido no Supabase Auth, SMTP configurado e chave administrativa somente no servidor. O app implementa pedido de convite via Auth Admin, não as páginas de portal. Claims persistentes evitam reenvio automático duplicado; pending/failed exigem reconciliação administrativa. Aceitação pelo serviço de e-mail não comprova entrega. Metadata do convite não concede acesso às tabelas. Nenhum convite externo foi enviado nesta validação.

Leituras opcionais incluem cloro total (ppm) e temperatura (°F). Detalhes internos da visita registram observações do técnico, equipamentos, limpeza de filtro e reparos, com histórico imutável; esses campos não entram no relatório do cliente. Migrations006–009 acrescentam estes recursos sem resetar o banco. Execute `migration up --local` antes do app atualizado. A demonstração estática oferece idiomas, cadastro e calendário, mas não autenticação real, mapas online, otimização viária ou convites.

## Correções da revisão e tela mobile de stops

Acesse **Stops** na barra inferior ou `/stops`: lista compacta do dia atual na Flórida, filtros Remaining/Completed/All, início de visita e navegação. O app instalado abre essa tela. **Route** mantém planejamento semanal, mapa e reordenação. Settings agora oferece **Sign out** no celular; a saída avisa sobre pendências, limpa o IndexedDB e redireciona outras abas.

Atualize o banco sem reset antes de iniciar esta versão:

```bash
npx --yes supabase@2.121.0 migration up --local
```

Migrations010–012 corrigem a reconciliação de agendas e permissões, adicionam pesquisa/paginação histórica, salvamento transacional de planos e orçamento de uploads. Mudança de técnico/dias reconcilia stops automáticos futuros ainda não iniciados, mantendo o ID. Concluídos e skips manuais são preservados. Agenda com atendimento em andamento exige concluir/pular esse atendimento antes de mudar. Arquivar/inativar cliente cancela os stops futuros abertos; isso também vale para os manuais. Não exclui histórico. Verifique a agenda após atualizar um banco que já contenha atendimentos antigos conflitantes.

Um técnico consulta o cadastro/instruções atuais quando tem atendimento aberto entre ontem e os próximos7 dias, ou atendimento concluído ou pulado manualmente hoje. Atribuição antiga não concede códigos novos de acesso. O histórico autorizado usa snapshots e pode ser pesquisado/paginado sem depender da linha atual do imóvel. A rota carrega relacionamentos completos em páginas, sem cortes independentes de1000 registros.

A CSP usa nonce por resposta e restringe scripts em produção; estilos inline continuam permitidos para Leaflet. O shell offline é HTML genérico renderizado por requisição, com seus próprios nonce/CSP preservados no cache, sem dados de sessão. HTTPS e proteção do aparelho continuam necessários. Mudanças de permissão no servidor não apagam instantaneamente informações já baixadas num aparelho offline; use dispositivo protegido e encerre a sessão ao trocar de operador.

Limites de upload:12 reservas por stop,120 novas por hora por empresa e2000 acumuladas por empresa. Repetir o mesmo photo_id não consome outra reserva. Uma visita continua com até3 fotos. O limite considera tentativas/reservas, inclusive algumas falhas, para conter consumo; mensagens429 preservam a foto local. A liberação de orçamento é administrativa. Limpeza de órfãos é **dry run por padrão**, somente em stops fechados há mais de14 dias e sem foto vinculada a uma visita:

```bash
node scripts/cleanup-photos.mjs --organization=<UUID-da-organizacao>
# Somente após revisar a simulação e autorizar a remoção dos órfãos:
node scripts/cleanup-photos.mjs --organization=<UUID-da-organizacao> --apply
```

A manutenção precisa da chave administrativa no servidor. Não a execute com `--apply` sem revisar escopo e backup. Esta entrega não executou remoção real de arquivos. Geocodificação agora usa uma janela global persistida no banco, compartilhada entre instâncias. Convites informam aceitos/falhos/incertos/já solicitados; falhas/incertezas exigem reconciliação administrativa e não geram reenvio automático.

O workflow `.github/workflows/checks.yml` executa lint, tipos, testes unitários/SQL, build e demonstração em push/PR. Os fluxos Supabase/Playwright completos continuam reproduzíveis com o procedimento local e stub descritos acima. O workflow foi adicionado; a execução no GitHub deve ser conferida em Actions após o push. Resultados e decisões: [correções da revisão](docs/CORRECOES-REVISAO.md).

Ao reativar um cliente inativo, seus stops automáticos futuros cancelados por inatividade voltam à agenda. Stops manuais cancelados precisam de restauração explícita. Stops pulados podem ser restaurados pela ação Restore stop enquanto o cliente estiver ativo.
