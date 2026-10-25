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
