# Validação Fast Route

Executado no ambiente cloud com Node24.19.0, npm11.9.0, Next16.4.2, Supabase local e Chromium mobile emulado. Somente dados fictícios e recursos locais foram usados.

## Validação anterior (antes da expansão)

- `npm run lint`: sem erros/warnings.
- `npm run typecheck`: TypeScript estrito aprovado.
- `npm test`: **39 testes**, sete arquivos. Validação de leituras/dosagens, proteção de origem/escopo/tamanho, recorrência, horários, preservação de drafts quando configuração muda, fila persistente/retomada, logout com sync em andamento e provedor de e-mail simulado com payload idempotente.
- `npm run test:db`: cinco suites SQL aprovadas em PostgreSQL17 descartável: RLS base, Fast Route, outbox/leases, correções auditáveis e histórico químico. Todas as migrations001–005 aplicadas. Constraints/FKs, técnico atribuído, anon/outro tenant negados, conclusão atômica/idempotente com duas piscinas e foto, histórico imutável, data offline separada de received_at, opt-in e claims privilegiados verificados.
- Supabase real local: Auth, PostgREST, Storage e banco funcionando. `node tests/integration/backend.mjs` passou: login por senha confirmado, signup público negado, isolamento de duas organizações, impossibilidade de alterar papéis, rollback de visita sem foto obrigatória, INSERT direto no Storage negado e worker RPC negado para sessão comum.
- `npm run build`: build de produção aprovado; `npm start` em execução para testes.
- Playwright/Chromium com viewport mobile: shell offline reabre rota e draft após fechar a aba; checklist/FC/pH preservados; conclusão abre próximo stop e mostra pendência local. CacheStorage contém só assets/shell genérico.
- Playwright/Supabase real: login, referência química dos últimos30dias visível na visita com leituras novas vazias; checklist, FC/pH e dois químicos registrados; JPEG real de fixture comprimido, enviado ao bucket privado e baixado por URL assinada; conclusão salva snapshot exato sem gate notes, cria só um job e aceita retry idempotente sem duplicar visita. Outra visita concluída offline sobrevive reload e sincroniza uma única vez quando a rede volta. History mostra os registros. Acesso anônimo e mutation de outra origem negados. **Três testes E2E aprovados em conjunto**. Um quarto teste mobile, executado separadamente, aprovou criação de cliente/propriedade/piscina, configuração de foto e leituras obrigatórias, edição de volume e inativação via formulários reais, com conferência no banco.
- `git diff --check`: sem erros de whitespace; index.html, app.js e styles.css originais preservados.

## Histórico químico solicitado

Ao abrir o stop, cada piscina tem um bloco compacto com leituras e produtos/quantidades/unidades dos últimos30dias de calendário, incluindo a data selecionada no fuso da Flórida. Visita mais recente visível, anteriores expansíveis. Dados acompanham a rota em IndexedDB para consulta offline; não preenchem novas leituras.

A consulta é paginada e limitada às propriedades da rota. RPC dedicado permite o contexto químico da piscina mesmo se outro técnico executou a visita anterior, sem liberar seu snapshot completo/notas/fotos. SQL testa esse caso e a negativa entre tenants; testes unitários cobrem fronteiras de dia/fuso, valores0, piscinas distintas e exclusão de registros antigos/futuros.

## Falhas diagnosticadas e corrigidas

- Configuração inicial desabilitava o provedor de e-mail do Auth: mantido signup global desabilitado e habilitado provider de email para password login. Login e signup negado foram retestados.
- Registry padrão e imagem grande encontraram bloqueio de egress/espaço; usados mirrors oficiais e imagens slim com verificação preservada. Health probes internos herdaram proxy403; endpoints reais e fluxos Auth/upload foram verificados. Storage ainda pode aparecer unhealthy pelo probe do container; isso não foi tratado como prova de indisponibilidade nem ignorado sem diagnóstico.
- Comparação de origem usava a bind URL0.0.0.0 do Next e rejeitava uploads legítimos em127.0.0.1. Corrigida para conferir autoridade Host da requisição, com teste de regressão e posterior E2E de upload aprovado. Não foram liberadas origens wildcard.
- Leitura do histórico no teste encontrou duas visitas corretas com o mesmo nome; selector E2E corrigido para lidar com múltiplas datas. Assertions de persistência e conteúdo foram mantidas.

## Ainda não validado / ação externa

**Nenhum e-mail real foi enviado.** Falta RESEND_API_KEY e EMAIL_FROM verificado; o destinatário de teste autorizado é alyspools@gmail.com. O requisito da chave, o remetente e api.resend.com foram salvos no rascunho do ambiente. EMAIL_DELIVERY_ENABLED permanece false. Tests de worker/provedor são simulados e tests SQL não demonstram entrega em Gmail/Outlook. Sent significa ack de aceitação do provedor; bounce/entrega/abertura não são rastreados.

Captura pela câmera física, instalação em iPhone/Android reais, legibilidade sob sol e tempo humano de registro30–60s ainda precisam de teste em aparelho. O teste de foto usa arquivo JPEG real; não é teste de câmera física. Backups/restauração, MFA, recuperação de senha e scheduler externo devem ser configurados antes de operação em produção. Não houve publicação, compra, ativação paga ou envio de dados reais. Não foi validada restauração em uma nova tarefa cloud.

Histórico geral limita200 visitas recentes e listas de cadastro1000; paginação maior é evolução futura. O contexto químico mensal é paginado e não usa esse limite global de200. IndexedDB não é cofre nem backup; retenção local depende do browser/dispositivo.

## Tema e entrada rápida de leituras

O tema anterior era azul-marinho claro; a entrega atual usa azul-escuro. FC oferece1/3/5ppm e pH7.0/7.2/7.4/7.6/7.8/8.0 em botões grandes, com entrada manual livre e indicação da opção selecionada. A demonstração foi testada no Chromium mobile usando todos os atalhos, entrada manual fora dos presets e persistência após reload. O app Next foi testado pelo shell offline com escolha de FC/pH, alteração manual e retomada após fechar a aba. Lint, typecheck,39 testes unitários e build passaram. Estes valores são medições da água, não recomendações de dosagem.


## Expansão de clientes, idiomas e rotas — 25/10/2026

- Lint sem erros/warnings, typecheck e build de produção aprovados.
- 48 testes unitários em9 arquivos aprovados, incluindo i18n, CSV contra formula injection, coordenadas e matriz/contrato OSRM com respostas simuladas.
- 6 suites SQL aprovadas com migrations001–009: clientes, tags, transações em lote/tenant inválido, cobrança privada negada ao técnico, rota atribuída, convite único, arquivo preservando propriedades; TC/temperatura e detalhes internos transacionais, imutáveis e ausentes do snapshot público.
- Backend Supabase real local aprovado: Auth/REST/Storage e negativas de permissão.
- 6 testes Playwright mobile aprovados: calendário, mapa/marcadores, otimização persistida, reordenação manual e invalidação de métricas, idioma persistido e formulário preservado, shell offline, visita/foto/snapshot/sync, acesso negado e tabela de clientes com busca/criação/edição/status/tag/arquivo. Convite desabilitado retorna503 sem criar jobs. API de endereço/roteamento usa stub local8131; não comprova precisão geográfica ou disponibilidade externa.
- 3 testes da demonstração passaram, incluindo idiomas, persistência, entrada manual, foto/avanço, escape de texto e exclusão de notas privadas do relatório. HTTP estático; file:// continua bloqueado pela política do browser deste ambiente.

Um teste inicial encontrou o checkbox da tabela sobreposto em viewport mobile; a lista virou cartões no celular, mantendo tabela no desktop, e o fluxo de toque passou. Downloads de arquivo são restringidos pelo Chromium gerenciado; a validação do CSV lê o Blob realmente gerado e o nome do link, sem comprovar gravação no disco pelo navegador.

OSRM real retornou403 CONNECT bloqueado pelo proxy. Tiles/geocodificador reais não foram validados. As dependências/domínios foram registrados no rascunho do ambiente; salvar não aplica configuração nem publica o app. SMTP/portal estão ausentes e convites permanecem desabilitados; nenhum e-mail externo foi enviado. Notas internas ficam fora dos relatórios. Não houve deploy ou compra. Testes continuam sem validar câmera física, instalação real no celular ou restauração em outra tarefa cloud.

## Correções da revisão e Stops mobile — 25/10/2026

- Lint sem erros/warnings, typecheck,50 testes unitários em10 arquivos e build de produção aprovados.
- 7 suítes SQL com migrations001–012 aprovadas. Nova suíte verifica reatribuição estável sem duplicação, desativação/reativação, skip manual preservado, bloqueio de alteração com visita iniciada, arquivo cancelando futuros abertos, negativa de acesso a gate notes atuais por técnico histórico, paginação/pesquisa com260 visitas, plano inválido/obsoleto rejeitado, cota de uploads, throttle persistido e permissões de manutenção.
- Backend Supabase real local passou novamente. Migrações010–012 aplicadas no banco local sem reset. Nenhum banco hospedado foi alterado.
- 9 testes de integração passaram juntos em produção local: rotas/mapa/otimização com stub, idiomas, offline, visita/foto/snapshot/sync, negativas de acesso e CRUD. Após ajustes finais de navegação, os4 testes relacionados a Stops/offline/revisão passaram novamente, incluindo visita aberta a partir de Stops, reload, retorno à mesma tela e saída em duas abas.
- 4 testes da demonstração passaram: fluxo completo, cadastros, idiomas e nova aba Stops com filtros. Nenhuma dependência externa carregada pela demo. Abertura file:// permanece sem validação por restrição do browser gerenciado.
- CSP de scripts foi exercitada com HTML contendo script sem nonce, que não executou. A injeção direta via DevTools não é um teste adequado da política; a reprodução final usa conteúdo de documento, preservando os headers reais.
- O teste de exportação CSV passou lendo o Blob gerado, sem fetch(blob:) e sem relaxar connect-src. Gravação no disco continua sujeita à política do browser.
- O shell offline com nonce/CSP preservados reabriu a rota, o rascunho e `/stops` sem rede. A tela de stops foi inspecionada em screenshot mobile emulado.

A manutenção de fotos foi executada somente em simulação local, sem remoção de arquivos. CI foi adicionado, mas não se presume resultado remoto. Provedores de e-mail/portal/roteamento externos, backups hospedados e aparelhos físicos continuam sem validação nesta entrega. Nenhum deploy, envio externo ou serviço pago foi ativado. Detalhes das correções em CORRECOES-REVISAO.md.

A espera do PostgreSQL descartável passou a conferir TCP, evitando confundir o servidor temporário de inicialização com a instância final. A última execução de todas as7 suítes foi concluída sem erros.

## Fast Technician Mode — 27/10/2026

- Lint sem erros/warnings, typecheck,57 testes unitários em11 arquivos e build de produção aprovados.
- 9 suítes SQL aprovadas com migrations001–014. Nova suíte mantém foto obrigatória, bloqueia acesso direto à rotina base, rejeita flags desconhecidas/duplicadas, protege flags por técnico/empresa e comprova imutabilidade e repetição sem duplicar visitas, químicos ou relatórios. Migrations anteriores preservadas.
- Backend Supabase real local aprovado novamente. Migration014 aplicada localmente sem reset.
- 10 testes mobile de integração aprovados em conjunto;4 testes da demonstração existente aprovados. Incluem os fluxos anteriores e o novo técnico com3 stops atribuídos, negativos de acesso, cache com role conferido, ordem de seções, leitura nova vazia, foto obrigatória e JPEG real no Storage privado.
- O teste novo reteve o primeiro upload, abriu o próximo stop e concluiu outro atendimento antes de liberar a rede. A primeira foto falhou503, o segundo stop sincronizou, o primeiro permaneceu Failed e foi recuperado com Retry sync. Nova conclusão do mesmo payload manteve uma visita, um conjunto químico e um relatório. Flags apareceram no histórico autorizado.
- XHR testado com progresso de bytes40%/99%, credenciais/headers de escopo, aborto e preservação do status503.100% não é publicado como armazenamento confirmado antes da resposta do servidor. Testes de fila cobrem submissão congelada, edição/remoção de foto por aba antiga bloqueada, drenagem de visitas novas e backoff sem loop de requisições.
- Cache exibiu o roteiro autorizado antes de uma atualização retida; uma cópia com role Owner foi recusada quando o servidor identificou Technician. Start Service não fez nova consulta à rota. Mapas são carregados sob demanda no planejamento online, não no fluxo do técnico.
- Exemplos de handoff local Complete & Next → próximo stop:462ms e109ms em execuções mobile emuladas, com upload retido. São amostras locais, não benchmark de câmera/aparelho/rede real e não prova de visita inteira em15–30s. O teste exige visibilidade do próximo stop em até1.5s após o clique.

Nenhuma dependência paga foi adicionada. O worker de e-mail e os limites existentes foram reutilizados; nenhum relatório real foi enviado. Publicação remota Netlify, conta/remetente Resend, cotas atuais e operação em aparelho físico continuam sem validação nesta mudança. Com app fechado/suspenso não há garantia de retentativa contínua. Guia: FAST-TECHNICIAN-MODE.md.

## Preparação da entrega e domínio Hostinger — 27/10/2026

- README refeito com sequência de publicação Netlify Free/Supabase Free/Resend Free, migrations001–014, provisionamento do proprietário, variáveis seguras, DNS externo `app.alyspools.com` e alternativa para raiz/`www`, HTTPS, remetente Resend, PWA e checklist de aceite.
- Guias locais e de operação separados; links relativos dos documentos conferidos sem destinos ausentes. Nenhuma migration anterior foi alterada, nenhum reset/seed remoto foi executado.
- Adicionada função agendada Netlify de recuperação de relatórios a cada15 minutos: usa a origem HTTPS do próprio site, autentica o endpoint com header secreto, não segue redirects, limita a espera a25s e não expõe o corpo da resposta/segredo nos erros. Com envio desabilitado não faz requisição. Mantém o processamento idempotente já existente, um job devido por chamada.
- Lint, typecheck, **64 testes unitários em12 arquivos** e build de produção aprovados. Os7 testes adicionais exercitam desativação, configuração insegura/incompleta, endpoint/header corretos e falha503 sem alegar envio. Não houve chamada ao Resend real.
- Empacotamento local da nova função pelo bundler oficial `@netlify/zip-it-and-ship-it` aprovado: `report-worker`, runtime APIv2 e cron `*/15 * * * *` reconhecidos. Isso valida o artefato da função, não o deploy completo nem o acionamento remoto da agenda.
- Suítes SQL/mobile da etapa Fast Technician permanecem registradas acima; não foram repetidas nesta mudança de documentação/agendamento, que não altera migrations, RLS ou a interface.

As consultas a páginas oficiais de preços/DNS retornaram bloqueio de rede403; o guia manda conferir cotas/valores DNS nos painéis atuais em vez de prometer limites fixos ou IP de tutorial. O adapter Next/Netlify ainda precisa de validação no ambiente publicado; o build local anterior do adapter teve falha de fetch no empacotamento Edge. Não foi feito novo deploy, acesso às contas do titular, alteração de DNS, ativação paga ou envio real. Publicação, HTTPS, câmera física, agenda remota e relatório recebido no Gmail continuam como aceite operacional explícito no README.

## ALYS V2 — 27/10/2026 (America/New_York)

Baseline inspecionada: migrations001–014, permissões/RLS, autenticação, outbox/IndexedDB, PWA, Netlify, cadastro, agendas, histórico e relatórios. Lint, typecheck,64 testes unitários,9 suítes SQL e build passaram antes das alterações; não foi identificado erro pré-existente nesses comandos. O problema de instalação PWA em produção é relato do titular, não reprodução remota confirmada.

Resultados executados:

- **Lint, typecheck,74 testes unitários em14 arquivos e build Next.js de produção aprovados.** Testes novos incluem cadastro com vários imóveis/piscinas, recorrência/validação, ranges/CSV, foto associada ao corpo preservada em retries e instalação de shell com recurso faltante/recuperação.
- **12 suítes SQL aprovadas**, em PostgreSQL descartável, aplicando migrations001–020 em ordem. Verificam cadastro atômico/idempotente (inclusive dois imóveis com payload idêntico), janela28 dias, pausa/retomada, remoção de atribuições preservando histórico, MRR próprio sem multiplicar por piscina/subcontrato, ledger por corpo sem zeros inventados, suspensão/reativação, negativas por organização/role, expiração/aceitação única de convite e metadados de auditoria sem payload/token de convite.
- A nova suíte de fotos exige imagem específica de cada corpo configurado, recusa conclusão parcial sem a foto do spa, mantém o mapa de fotos imutável e comprova que retries não duplicam visita ou associação. O SQL usa metadados fictícios; decodificação do JPEG é exercitada separadamente no backend/navegador.
- **Backend Supabase real local aprovado**: Auth, PostgREST, Storage privado, validação, transação/rollback e negativas de permissão. Migrations015–020 foram aplicadas somente localmente, sem reset; refinamentos de funções ainda não publicadas foram reaplicados localmente para o teste. Replay completo das migrations finais também passou nas suítes SQL descartáveis.
- **12 testes mobile Playwright passaram juntos** no build de produção local. Incluem rotas/mapas com stub autorizado local, idioma, proteção de cache por role, foto requerida, upload503 e retry, navegação imediata, corrida de datas, logout em duas abas, CSP, cadastro/CSV, onboarding com duas propriedades/três piscinas e replay da mesma requisição, perfil e ausência do antigo formulário de agenda em Settings.
- O convite foi gerado pelo **Auth local**, sem envio externo. A aceitação estabeleceu senha escolhida no teste, recusou segunda aceitação e APIs Owner para o técnico; troca de senha exigiu a senha atual, e suspensão pelo proprietário bloqueou sessão anterior e leitura direta de stops. Esse teste não comprova entrega da mensagem Resend nem a execução completa do envio habilitado na produção.
- **4 testes da demonstração estática passaram.** A demo compartilha as traduções atualizadas, mas não passou a representar os módulos autenticados V2.
- O shell PWA reabriu rota/rascunho após fechar a aba offline. Teste unitário preservou query `?dpl=...`, recusou declarar readiness com CSS503 e manteve o shell anterior até a recuperação. Nenhum caminho de atualização apaga o banco IndexedDB de rascunhos/fotos.
- Amostra de handoff Complete & Next → próximo stop: **113ms** em Chromium mobile emulado, upload retido. Não inclui câmera/manutenção/entrada humana e não prova interação completa em15–30s.
- A regressão inicial encontrou schema de notas internas rejeitando uma visita; o campo foi corrigido, recebeu teste específico e o cenário completo passou novamente. O teste de imutabilidade de correções passou a comparar o snapshot efetivamente gravado antes/depois, incluindo o novo carimbo do técnico em visitas novas.

Limitações e produção:

- A V2 foi preparada em **`feat/alys-v2`**, separada de `main`, para não disparar deploy antes das migrations aprovadas. Status de publicação/migrations remotas não é inferido do build.
- Consultas públicas a `/sw.js` e `/offline` em `app.alyspools.com` e ao manifest em `alyspools.com` foram bloqueadas pelo proxy403 **antes de alcançar a origem**. Isso não demonstra falha do site. A causa exata do erro PWA publicado permanece sem confirmação; os novos diagnósticos e o checklist em aparelho real são necessários.
- Geoapify/autocomplete real, termos/cotas vigentes do provedor, precisão do endereço, câmera/iPhone/Safari físicos, execução Netlify da agenda, backups/restauração hospedados e entrega Resend real **não foram validados**. A geocodificação de integração usa o stub local8131, não estimativas reais.
- `TEAM_INVITES_ENABLED`, autocomplete e e-mail continuam desativados por padrão. Nenhuma chave real foi adicionada ao repositório, nenhuma conta hospedada/dado real foi criado ou alterado, nenhum envio externo/deploy/compra foi executado.

Roteiro de atualização, mudanças por arquivo/migration, segurança, configuração pendente e aceite: [V2-DELIVERY](V2-DELIVERY.md).
