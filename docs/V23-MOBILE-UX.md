# ALYS V2.3 — Mobile UX

Branch `feature/alys-v2-3-mobile-ux`, baseada em `67c6415`, o merge mais recente disponível ao iniciar. As oito imagens recebidas (uma repetindo o checklist) orientaram organização, sequência e densidade. Cores, componentes, ícones e textos são da ALYS; não foram copiados nomes, endereços ou imagens de clientes das referências.

## Interface entregue

- Cabeçalho azul marinho ALYS, fundo cinza, superfícies brancas e controles grandes. Layout compartilhado alcança Dashboard, clientes, perfil, equipe, histórico, relatórios, configurações e atendimento.
- Cinco destinos fixos com labels curtas e acessíveis. Owner: Dashboard, Customers, Routes, Map, More. Technician: My Route, Current Service, History, Map, Settings. Acesso por função continua no servidor/RLS; menu não concede permissão.
- Calendário semanal também no modo técnico; seletor diário e Today preservados. Progresso circular conta visitas confirmadas no servidor, sem somar visitas locais como sincronizadas.
- Paradas numeradas, status com texto/cor, reordenação, navegação Google/Apple e coordenadas confirmadas. Os botões existentes de início abrem o serviço em um toque na lista.
- Atendimento com Info e abas dos corpos d’água, mantendo seus nomes reais (Pool/Spa ou nomes personalizados). Info mostra cliente, acesso e anotações de problemas do atendimento. O cadastro de equipamentos/anotações no perfil do cliente foi mantido; não foi criado um novo inventário.
- Histórico químico continua como referência; FC/pH têm destaque visual e valores rápidos. Favoritos, dosagens, checklist de um toque, notas e fotos continuam nos componentes operacionais existentes.
- Finish & Next continua gravando localmente antes de avançar. JPEG/HEIC/HEIF, substituição de foto, Retry, pendências, sessão expirada e confirmação real de sincronização usam o pipeline existente.
- `/maps` reaproveita RoutePlanner e o escopo de rotas existente, com pinos numerados e camadas mapa/satélite. A numeração mantém a posição da lista mesmo quando algum endereço não tem coordenadas.
- Settings conserva grupos e privilégios Owner/Technician; endereços e piscinas permanecem integrados a Customers.

## Mapas e limites

Mapa padrão usa OpenStreetMap; satélite usa tiles públicos Esri World Imagery e atribuição. Não foi ativado plano ou chave paga. Os fornecedores têm termos, disponibilidade e limites próprios. `NEXT_PUBLIC_SATELLITE_TILE_URL` é opcional para um template autorizado alternativo; sua origem entra na CSP de imagens. O teste de alternância valida os controles; não certifica disponibilidade mundial/contínua do fornecedor. GPS, geocodificação e cálculo viário continuam com a configuração anterior.

Não houve mudança em Supabase, schema 025, RLS, contratos, registros históricos, relatórios ou formato do IndexedDB. O service worker e sua fila não foram substituídos nem limpos. Versão de aplicação: 2.3.0. Não houve merge, deploy ou migration remota.

## Executar e revisar

Siga o README para Supabase local e `.env.local`. Use somente dados fictícios. E-mail e convites devem permanecer desativados em testes.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

Com o servidor de integração local em 3006 e as fixtures conforme LOCAL-DEVELOPMENT.md:

```bash
TEST_BASE_URL=http://127.0.0.1:3006 npx --no-install playwright test \
  v23-mobile.spec.ts v221-recovery.spec.ts v212-mobile.spec.ts offline-shell.spec.ts \
  --project=mobile-chromium --output=/tmp/alys-v23-final-results
```

O novo teste percorre Dashboard, rota, mapa, clientes, perfil, Settings e visita em EN/PT/ES e larguras de 320, 390 e 430 px. As outras suítes verificam pendências anteriores ao upgrade, JPEG pequeno/grande, HEIC/HEIF, erro de conversão/substituição, retomada offline, perda de sessão e resposta de conclusão perdida sem duplicação. O teste de navegação verifica alvos de toque e os limites reais dos textos em EN/PT/ES, além de manter a data ao voltar da visita.

## Aceite físico pendente

- Safari e PWA no iPhone: teclado numérico, rotação, notch e área segura, zoom de texto e navegação com cinco itens.
- Câmera/galeria com fotos reais JPEG e HEIC; suspender o app durante upload, reabrir e confirmar Retry sem perder a visita.
- Modo avião: salvar uma visita, fechar/reabrir, recuperar rede e conferir History e confirmação do servidor.
- GPS: permitir/negar localização no aparelho, conferir precisão e destino físico; mapa/satélite em rede móvel.
- Cron/e-mail real e fotos recebidas no cliente precisam de teste autorizado no ambiente publicado. Nenhuma mensagem real foi enviada nesta entrega.

As capturas de revisão são de Chromium com viewport de iPhone e dados fictícios; não representam teste no Safari físico.

## Validação executada e capturas

Lint, typecheck e build de produção aprovados. **139 testes unitários em 25 arquivos** aprovados. **10 cenários mobile/offline** aprovados no Chromium com viewport de iPhone, sem retries do runner. Após colocar o mapa antes da lista, o cenário visual foi repetido e aprovado; a última execução inclui navegação Info/Pool/Spa nos três idiomas. Essas repetições não são cenários adicionais distintos.

O carregamento contínuo de tiles externos não foi certificado: a captura de mapa mostra pinos e controles, e pode mostrar o fundo cinza antes das imagens do fornecedor. Conferir mapa/satélite em rede móvel faz parte do aceite físico. Não foi executado Safari/WebKit nem GPS/câmera no iPhone físico. Não houve teste de e-mail real ou deploy. As suites SQL não foram repetidas nesta entrega de UI; migrations e funções do banco não mudaram.

Capturas reais do teste, com dados fictícios:

| Tela | Captura |
| --- | --- |
| Dashboard | [dashboard](screenshots/v23/dashboard.png) |
| Rota semanal e progresso | [route](screenshots/v23/route.png) |
| Mapa e pinos | [map](screenshots/v23/map.png) |
| Clientes | [customers](screenshots/v23/customers.png) |
| Perfil | [customer](screenshots/v23/customer.png) |
| Settings | [settings](screenshots/v23/settings.png) |
| Atendimento Pool | [service](screenshots/v23/service.png) |
| Atendimento Info | [service-info](screenshots/v23/service-info.png) |
| Atendimento Spa | [service-spa](screenshots/v23/service-spa.png) |
| Sessão ausente | [sync-auth-required](screenshots/v23/sync-auth-required.png) |
| Foto pendente com falha | [sync-failed-photo](screenshots/v23/sync-failed-photo.png) |
| Histórico confirmado | [sync-confirmed-history](screenshots/v23/sync-confirmed-history.png) |

## Refinamento com as dez referências

Nesta revisão foram analisadas as dez imagens anexadas na conversa, incluindo as telas adicionais de Settings e Customers. O diretório solicitado `docs/ux-references/v23` não existe no checkout nem na branch remota consultada; não foram inventados arquivos de referência ou inseridas imagens codificadas.

O resumo da rota agora é um cartão horizontal compacto, com anel e contadores; a barra duplicada continua disponível para tecnologia assistiva. Info/Pool/Spa aparecem antes dos atalhos da visita. Todos os painéis dos corpos d’água têm semântica de tabpanel, inclusive quando há apenas um. O checklist mostra tarefas marcadas/total e mantém seleção de um toque. Químicos, quantidades e captura/galeria têm espaçamento e estados visuais consistentes. O cabeçalho de Maps foi corrigido para identificar a tela.

O refinamento modifica somente apresentação/componentes de campo e o teste visual. Nenhuma mudança em APIs de negócio, banco, RLS, IndexedDB, uploads, idempotência ou relatórios. O teste visual agora confere também a ordem das abas e o contador após marcar uma tarefa. As capturas abaixo são atualizadas com os resultados desta rodada, sempre com dados fictícios. O aceite físico no iPhone e a disponibilidade dos tiles externos continuam pendentes conforme a lista anterior.

Validação desta revisão: lint, typecheck e build aprovados; 139 testes unitários e 10 cenários mobile/offline aprovados (sem retries), incluindo a nova checagem de hierarquia das abas e contador do checklist. EN/PT/ES em 320, 390 e 430 px. Screenshots atualizadas em `docs/screenshots/v23`. Não houve teste em aparelho físico, merge, deploy ou migration remota.
