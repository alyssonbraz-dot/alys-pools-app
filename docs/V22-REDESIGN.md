# V2.2 — interface completa para operação no celular

Base aprovada: `main` `ee6399d`, incluindo V2.1.2. Branch: `feature/alys-v2-2-complete-redesign`.

## Arquitetura e inventário

O redesenho substitui as duas folhas antigas com regras cumulativas por tokens e componentes compartilhados. Tipografia do sistema, ícones SVG locais da mesma família, superfícies, hierarquia, espaçamento, estados, diálogos inferiores e controles usam os mesmos contratos. Não foi adicionada biblioteca visual pesada. O azul de interação foi ajustado para `#0876ad`: contraste calculado de 4,99:1 em branco e 4,69:1 no fundo `#f5f8fb`, preservando o navy da marca. Isso não substitui uma auditoria completa de acessibilidade.

- Shell: `AppShell`, `DesktopSidebar`, `MobileBottomNavigation`. Proprietário: Dashboard, Customers, Routes, More. Técnico: My Route, Current Service, History.
- Componentes: PageHeader, SectionHeader, Card, StatCard, StatusIndicator, EmptyState, ErrorState, LoadingSkeleton, MobileDataCard, ResponsiveDataTable, StickyActionBar, BottomSheet, ConfirmationDialog, ReadingInput, ServiceChecklist, PhotoCapture, ChemicalQuickPicker e QuantityPreset.
- Proprietário: `/`, `/customers`, `/customers/new`, `/customers/[id]` e edição, `/pools`, `/route`, `/stops`, `/history`, `/reports`, `/finance`, `/team`, `/more`, `/settings`, `/settings/health`, `/locations`, `/customers/legacy`.
- Contratos, agendas recorrentes, atribuições, piscinas e histórico de um cliente continuam nos módulos existentes do perfil; não há uma segunda implementação do cadastro.
- Técnico: `/` e `/service` abrem piscina atual; `/stops` abre a lista e datas; `/visit/[id]` conserva o dia escolhido, rascunho e fotos. O histórico mostra somente visitas autorizadas.
- Compartilhado: `/login`, `/join`, `/offline`, erro, 404 e demonstração `demo/index.html` adotam a identidade V2.2.
- Lógica reutilizada: RLS/Auth, cadastro transacional, comparação de agendas, cálculo de MRR `owner_overview`, unidades canônicas, validação de conclusão, IndexedDB, IDs de fotos/visitas, conversão HEIC e outbox de relatórios. Financeiro mostra MRR próprio e valores de subcontratos separadamente; não calcula lucro líquido.

## Fluxo de campo

Antes: lista de stops, formulário longo e produtos adicionados em formulários expandidos. Agora: piscina atual com dados essenciais e Start; leituras prioritárias; produto → quantidade → Add; checklist; câmera; Finish & Next. Seções têm atalhos diretos. Dados anteriores são referência, não medições novas. Leituras vazias continuam distintas de zero.

Após persistência local, o próximo stop abre sem aguardar upload ou e-mail. `Synced` depende da confirmação do servidor. Motivos de skip são auditados; restaurar o stop mantém seu rascunho e o registro do motivo. Pular um stop requer conexão; completar visitas em cache continua disponível offline.

Produtos favoritos e recentes são preferências por conta/aparelho, separadas da fila. Atalhos não assumem dose nem recomendam tratamento. Produto/concentração e unidades são preservados, com conversão canônica imperial/métrica existente. Há edição, desfazer remoção e confirmação para limpar a lista. Um produto selecionado deve ser adicionado ou cancelado antes de finalizar. Piscinas e spas usam abas que preservam os valores de cada corpo d’água. A barra de conclusão tem uma área própria, fora da rolagem dos campos; o visualViewport adapta o editor ao teclado sem impedir zoom.

## Dados e migration

Migrations 001–024 são preservadas. A única migration nova é **025 — route_skip_events**: tabela append-only com RLS, RPC de skip com motivo e request ID, e metadata de schema 25. Ela não altera clientes, visitas, leituras ou fotos existentes. O IndexedDB continua no mesmo nome e versão, sem limpeza ou migração destrutiva. Nenhuma migration remota foi executada.

## Validação e evidências

Baseline: lint/typecheck, 116 testes unitários, 14 suítes SQL e build aprovados. Capturas `docs/screenshots/v22/before-*.png` usam dados fictícios locais na V2.1.2.

Resultados de entrega:

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Sem erros/avisos |
| `npm run typecheck` | Aprovado |
| `npm test` | 119 testes em 21 arquivos |
| `npm run test:db` | 15 suítes PostgreSQL descartáveis, migrations 001–025 |
| Auth/PostgREST/Storage reais locais | Login, RLS, validação/rollback, imutabilidade de perfil e uploads privados aprovados |
| Playwright completo | **55 aprovados**, sem retry: 34 mobile Chromium, 18 Android Chromium e 3 desktop Chromium |
| Demonstração independente | 4 testes aprovados |
| `npm run build` | Build de produção aprovado |
| WebKit / Safari físico | Não executado; download WebKit bloqueado por HTTP 403 |

Após os últimos ajustes de contraste e visibilidade do contador, lint/typecheck/build foram repetidos e **2 regressões dirigidas passaram no build final**, cobrindo conclusão/recuperação, fila em stop já concluído e navegação do técnico em EN/PT/ES nas larguras 320–430. Comandos reproduzíveis estão no [guia local](LOCAL-DEVELOPMENT.md); use fixtures novas ao repetir toda a suíte. Migrations 001–024 não foram modificadas.

### Medições

Amostras da suíte completa, sem throttling de CPU/rede, em Supabase local:

| Métrica | Perfil iPhone 13 / Chromium | Perfil Pixel 5 / Chromium |
| --- | --- | --- |
| Primeiro request de rota → piscina atual visível | 631 ms | 216 ms |
| Finish & Next → próxima piscina visível, com upload retido | **102 ms** | **120 ms** |
| Adição de químico | 3 botões | 3 botões |
| Atendimento mínimo do roteiro | 8 botões + 1 seleção de arquivo | 8 botões + 1 seleção de arquivo |
| Layout shift na retomada após reload offline | 0,184 | 0 |

Os 8 botões incluem Start, FC, pH, produto, quantidade, Add, Mark all done e Finish. Não incluem gestos de rolagem, operação da câmera nativa, manutenção física, tarefas adicionais ou digitação de notas. O alvo de 15–30 segundos de interação real ainda precisa de cronometragem por técnico em aparelho físico.

`layoutShift` é uma amostra sintética por documento, reiniciada no reload; não é CLS padronizado/agregado da sessão. A retomada/reconexão pode mover conteúdo quando avisos entram/saem (amostra 0,184); isso permanece uma limitação a observar no aceite físico. Não há percentis nem comparação cronometrada com o app anterior. No reteste do build final, o perfil mobile registrou 295 ms para rota inicial, 91 ms para Finish & Next e layout shift 0, mantendo os mesmos 3/8 botões. Essa amostra adicional não é uma média nem invalida o deslocamento observado na suíte completa. Dados e condições em [V22-PERFORMANCE.json](V22-PERFORMANCE.json).

A cobertura inclui login/convites, edição durante atendimento, isolamento de empresas/técnicos, fotos JPEG pequenas/grandes e HEIC/HEIF, conversão com falha, fila antiga, substituição de foto, retries idempotentes, troca de datas, idiomas, múltiplos corpos d’água e conclusão com upload bloqueado. As 17 páginas de proprietário são verificadas nas larguras **320, 375, 390, 430, 768 e 1024 CSS px**, incluindo Histórico expandido; o editor de campo também passa pela mesma matriz. A inspeção procura overflow do documento, e não apenas a existência da página.

A barra de câmera está dentro da rolagem; a barra de conclusão e a navegação ocupam áreas distintas. Avisos de sincronização ficam no scroll do editor, com contador acessível no topo; na lista/prévia têm rolagem própria para não ocupar a tela inteira. O teste de teclado usa redução de viewport e foco; não emula integralmente o teclado nativo do iOS.

### Capturas antes/depois

Dados exclusivamente fictícios, capturados localmente. Abra as imagens para comparar em tamanho integral.

| Tela | V2.1.2 | V2.2 |
| --- | --- | --- |
| Dashboard | [Antes](screenshots/v22/before-dashboard.png) | [Depois](screenshots/v22/after-dashboard.png) |
| Clientes | [Antes](screenshots/v22/before-customers.png) | [Depois](screenshots/v22/after-customers.png) |
| Histórico | [Antes](screenshots/v22/before-history.png) | [Depois](screenshots/v22/after-history.png) |
| Atendimento | [Antes](screenshots/v22/before-service.png) | [Depois](screenshots/v22/after-service.png) |
| Piscina atual | — | [V2.2](screenshots/v22/after-current-pool.png) |
| Mais | — | [V2.2](screenshots/v22/after-more.png) |
| Recuperação de sincronização | — | [V2.2](screenshots/v22/after-sync-recovery.png) |

### Comparação do fluxo

| Operação | Fluxo anterior | V2.2 |
| --- | --- | --- |
| Abrir app como técnico | Lista e seleção do atendimento | Piscina atual e Start |
| Registrar químico | Linha de formulário com produto/quantidade/unidade | Produto → quantidade explícita → Add; favoritos/recentes |
| Consultar referência | Tabela química expandida no formulário | Últimos valores visíveis e histórico de 30 dias recolhível |
| Trabalhar em piscina/spa | Formulário sequencial de todos os corpos | Abas com valores independentes preservados |
| Terminar | Persistência local/next já existiam | Mesmo contrato durável; próxima piscina com contexto e Start |
| Pular/restaurar | Mudança de status | Motivo auditado + restauração preservando rascunho |

A V2.1.2 já salvava a conclusão localmente antes da rede; o redesenho conserva essa garantia. Não foi feito benchmark cronometrado da versão anterior, portanto não há percentual de aceleração comprovado. As medições novas usam navegador emulado e Supabase local; não representam tempo de manutenção nem de operação da câmera do sistema.

A [lista de arquivos](V22-FILES.md) acompanha a entrega.

### Limitações conhecidas

- Safari e iPhone físicos, Home Screen instalado, suspensão do processo e teclado/câmera reais ainda precisam de aceite no dispositivo. Emulação Chromium não comprova esses comportamentos.
- Sincronização em segundo plano depende do app aberto/reaberto; não há promessa de execução com o navegador encerrado.
- Pular um stop exige conexão. Leituras, fotos e conclusão de stops previamente armazenados continuam offline.
- Favoritos/recentes ficam neste navegador, por conta; não são sincronizados entre aparelhos.
- Finanças mostram contratos/MRR próprio e repasses separados; não registram pagamentos, despesas ou lucro líquido.
- Não foram testados DNS/HTTPS Hostinger, cron hospedado, cotas das contas gratuitas ou envio real Resend nesta entrega.

WebKit foi solicitado via Playwright. O download dos três mirrors foi bloqueado nesta rede com HTTP 403 `Domain forbidden`; Safari físico permanece uma verificação posterior. Nenhum envio real de e-mail está autorizado nesta entrega.

## Publicação segura — somente após aprovação

1. Revisar branch, diferenças, capturas e resultados; fazer backup do Supabase hospedado.
2. Em ambiente de publicação autorizado: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
3. Confirmar o projeto correto: `npx --yes supabase@2.121.0 login`, `link --project-ref SEU_PROJECT_REF`, `migration list --linked`, `db push --dry-run`. Em V2.1.2/schema 24, somente 025 deve estar pendente.
4. **Somente com autorização explícita:** aplicar 025 via `db push`, conferir schema 25 e só depois aprovar merge/deploy Netlify. Não usar `db reset`, seeds ou fixtures em produção.
5. Se for necessário reverter o frontend, mantenha a migration aditiva e os dados/fila locais; não faça downgrade destrutivo nem limpe IndexedDB para resolver falha de sincronização.
6. Aceite em aparelho físico: entrar como Owner/Técnico, Histórico expandido sem zoom, teclado, câmera HEIC, fila antiga, offline, skip/restauração, Finish & Next, idiomas e modo instalado.

Preservar as configurações de Netlify Free, Supabase Free, Resend Free e domínio Hostinger `alyspools.com`, descritas no [README](../README.md). Nenhum serviço pago novo é necessário. Não houve merge, deploy ou envio de mensagem externa.
