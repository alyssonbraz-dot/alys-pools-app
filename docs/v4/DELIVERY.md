# ALYS V4 — entrega para revisão

Branch: `feature/alys-v4-mobile-staging`, baseada em `6302db4` da `feature/alys-hostinger-app-path` (PR #9). Destino do novo PR: essa branch de staging, sem merge na main. Nenhuma publicação de produção, DNS, alteração Hostinger, migration remota ou envio de e-mail real foi executado.

## Experiência implementada

- Owner: Home / Route / Customers / More. Technician: Today / History / More. Team saiu da navegação principal e permanece em More. Administração/finanças continuam protegidas no servidor e por RLS.
- Home: resumo do dia, progresso circular, próxima visita e ação principal; MRR próprio, clientes e sincronização. Contribuição e controles avançados ficam recolhidos.
- Route: calendário semanal, cartões compactos numerados, status, Start/Navigate, próxima parada fixa. Reordenação, atribuição e skip permanecem no menu da parada.
- Visita: composição JSX reconstruída com FC/pH, incremento/decremento e entrada direta, referência anterior separada, químicos favoritos, checklist em uma coluna e câmera no rodapé. Finish & Next continua salvando duravelmente antes de avançar. Detalhes técnicos/comerciais e de relatório são expansíveis.
- Clientes: pesquisa e perfil integrado; cadastro em Customer / Pool & schedule / Agreement. Edição mantém IDs e vários imóveis/piscinas/spas; campos avançados ficam recolhidos.
- Finance: receita mensal, pagamentos fixos dos técnicos, contribuição e clientes/contratos. Mão de obra própria configurada aparece separadamente; sem preço permanece desconhecida. A seleção entre previsão e visitas confirmadas atualiza os totais. Contribuição não é lucro líquido nem extrato de caixa.
- Issues / Repairs: achados, prioridade e fotos/histórico original. Resolução/reabertura são correções auditadas de gerente, preservando o registro original. Sem novo sistema de tickets ou migration.
- More preserva Team, Finance, Reports, Issues / Repairs e Business Settings; Advanced mantém mapas, configurações antigas, financeiro V1 e subcontratos recebidos. Dados legados não foram excluídos.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Navegação / identidade | `src/components/shell.tsx`, `src/lib/business/navigation.ts`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/components/v4/primitives.tsx`, `src/components/v4/v4.css` |
| Home / Route | `src/components/mobile/dashboard.tsx`, `src/components/mobile/field-layout.tsx` |
| Visita / cadastro | `src/components/field/field-app.tsx`, `src/components/field/service-controls.tsx`, `src/lib/quick-reading.ts`, `src/components/customer-onboarding.tsx`, `src/components/v4/customer-service-summary.tsx` |
| More / comercial / financeiro | `src/components/v4/more-screen.tsx`, `src/components/v4/commercial-details.tsx`, `src/components/v4/issue-log.tsx`, `src/lib/field/issue-log.ts`, `src/app/(protected)/issues/page.tsx`, `src/components/business/contribution-screen.tsx` |
| PWA / dados | `src/components/pwa.tsx`, `src/lib/offline/worker-ready.ts`, `public/sw.js`, `src/app/manifest.ts`, `src/lib/field/data.ts`, `src/lib/field/types.ts` |
| Idiomas / evidência | `src/lib/i18n/messages.json`, `tests/v4/`, `tests/visual-app/`, `playwright.v4*.config.ts`, `tests/integration/v4-live-roles.spec.ts`, `tests/integration/v221-recovery.spec.ts` |

**Migrations novas: nenhuma.** Schema, políticas, APIs de conclusão/upload, IDs, filas, rascunhos e blobs da IndexedDB são preservados. O cache público muda para v4, separado entre `/app/` e raiz. Leitura de equipamento pelo técnico usa somente piscinas autorizadas da rota e a RLS existente.

## Screenshots reais de componentes, dados fictícios

Viewport CSS de 390 px; imagens podem ter resolução física maior por causa do DPR móvel. Os cenários visuais usam os componentes de produção com API interceptada. O perfil completo e o login são capturas do aplicativo com Supabase local e dados fictícios; o login é capturado antes de preencher credenciais. Há também uma captura do resumo compartilhado no harness visual.

| Tela | Captura |
| --- | --- |
| Home Owner | [home-390.png](../screenshots/v4/home-390.png) |
| Route Owner | [route-390.png](../screenshots/v4/route-390.png) |
| Today Technician | [technician-today-390.png](../screenshots/v4/technician-today-390.png) |
| Visita | [visit-390.png](../screenshots/v4/visit-390.png) |
| Customers | [customers-390.png](../screenshots/v4/customers-390.png) |
| Customer profile / resumo | [profile-390.png](../screenshots/v4/profile-390.png) |
| Customer profile / página completa local | [profile-full-390.png](../screenshots/v4/profile-full-390.png) |
| Cadastro / cliente | [new-390.png](../screenshots/v4/new-390.png) |
| Cadastro / piscina | [onboarding-pool-390.png](../screenshots/v4/onboarding-pool-390.png) |
| Team | [team-390.png](../screenshots/v4/team-390.png) |
| Finance | [finance-390.png](../screenshots/v4/finance-390.png) |
| Reports | [reports-390.png](../screenshots/v4/reports-390.png) |
| Issues / Repairs | [issues-390.png](../screenshots/v4/issues-390.png) |
| More | [more-390.png](../screenshots/v4/more-390.png) |
| Login | [login-390.png](../screenshots/v4/login-390.png) |

A revisão visual avalia hierarquia, cartões, densidade, rodapé e navegação, separadamente dos testes funcionais. Foram corrigidos contraste do nome ALYS, checklist em duas colunas herdado, aviso duplicado de salvamento, precedência do rodapé antigo que sobrepunha a navegação em 4 px e reconciliação visual da mão de obra própria. A aplicação visual de testes usa build de produção para evitar interferência de HMR/service worker durante as capturas. As três configs Playwright usam diretórios de saída distintos para preservar os traces de execuções simultâneas.

## Validação

| Verificação | Resultado |
| --- | --- |
| ESLint | Passou, sem erros/avisos |
| TypeScript | Passou |
| Vitest | 207 testes, 34 arquivos, passaram |
| PostgreSQL/RLS descartável | Passou com histórico atual e com `ALYS_TEST_V1_BRIDGE=1` |
| Build de produção `/app` | Passou |
| Playwright `/app` | 2 passaram: SSR/rotas/assets/manifest e foto + próxima parada offline |
| Playwright Supabase local real | 4 passaram: recuperação JPEG/HEIC, cadastro/edição de vários imóveis, Owner autorizado e Technician de outra empresa isolado |
| Playwright visual V4 | 6 passaram: matriz de telas 375/390/430 px, conclusão local com câmera e próxima parada, cadastro progressivo, EN/PT/ES, correções auditadas e financeiro. Reexecução focada de visita/cadastro: 2 passaram, incluindo rodapé da visita nas três larguras |

O teste real de recuperação interrompe o transporte após Storage aceitar uma foto e após o servidor confirmar a visita. A nova tentativa conserva o payload/timestamp, dois IDs de foto, uma visita, uma leitura, uma dosagem e um registro de relatório. Nenhum envio externo foi feito.

Na matriz executada, documento sem overflow horizontal, navegação com alvos de pelo menos 44 px e sem interseção entre destinos. O teste também verifica que rodapés de visita/cadastro e próxima parada ficam acima da navegação. A matriz principal usa inglês; More do técnico cobre os três idiomas nas três larguras, e o perfil real cobre as abas traduzidas em 320 px. Não se considera isso equivalente a teste físico de safe area/teclado Safari.

Comandos reproduzíveis:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
ALYS_TEST_V1_BRIDGE=1 npm run test:db
ALYS_APP_BASE_PATH=/app npm run build
npx playwright test --config playwright.app-path.config.ts
npx playwright test --config playwright.v4.config.ts
# Somente depois do setup de Supabase LOCAL descrito no README:
npx playwright test --config playwright.v4-real.config.ts
```

## Pendências de homologação

**Staging Netlify e Deploy Preview: BLOCKED.** O endereço informado é `https://alys-v3-staging.netlify.app/app`, mas a rede retorna CONNECT HTTP 403. Credenciais/configurações remotas de Netlify, Supabase e Resend não estão disponíveis. Não há link de staging validado nesta entrega. Detalhes e ações necessárias: [STAGING.md](STAGING.md).

É necessário conectar os serviços de staging, confirmar variáveis/branch/logs e executar login/Storage/RLS/worker/webhook no projeto de teste. O teste local confirma enfileiramento de relatório único, não entrega por Resend. GitHub API também negou leitura do PR #9; a criação do PR será reportada separadamente do push Git.

iPhone físico/Safari: homologar câmera nativa, HEIC de diferentes aparelhos, teclado, safe areas reais, instalação PWA, bloqueio e retomada. Chromium em viewport móvel não comprova comportamento físico. Desempenho de rede 4G não foi medido; não há promessa de tempo de visita em produção.
