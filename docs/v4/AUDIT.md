# ALYS V4 — auditoria e arquitetura

Base: PR #9, `feature/alys-hostinger-app-path`, commit 6302db4. Branch V4 independente: feature/alys-v4-mobile-staging. Escopo autorizado: frontend, homologação de staging e Deploy Preview; nunca main, produção, DNS ou Hostinger.

## Inventário e decisões

- Navegação V3: Owner com cinco destinos e Team redundante no fluxo principal. V4: Home, Route, Customers, More; Team/Finance/Reports/Business Settings em More. Technician preserva Today/History/More e autorização server-side/RLS.
- Home V3 prioriza contribuição e cartões grandes antes da operação. V4 prioriza próximas visitas, progresso, pendências e MRR; dados avançados recolhidos.
- Visita: VisitEditor, ReadingInput, ChemicalQuickPicker, ServiceChecklist e PhotoCapture já possuem persistência e validação. Reconstruir sua composição/controles, mantendo contratos e outbox.
- Cadastro: CustomerOnboarding é transacional e preserva IDs. Tornar progressivo (cliente, local/piscina, serviço), sem duplicar formulários ou RPC.
- Finanças: reutilizar contribution, tarifas versionadas, calendário real e permissões Owner. Entrada principal simples, legado preservado em Advanced.
- Comercial: issue_flags, service_details (equipamento, filtro, reparos), equipamento da piscina, histórico/correções auditadas e fotos já existem. Reutilizar esses registros; prioridades e encerramentos devem ser auditáveis, sem inventar estados resolvidos a partir de ausência de dados.
- Offline: IndexedDB `alys-field-device-v1`, versão 1, nomes/chaves/IDs e blobs preservados. SW público restrito a /app/, caches separados, nenhum reset ou migração de armazenamento.
- i18n EN/PT/ES, timezone, unidades, contatos privados, GPS, gestão de técnicos e configurações continuam disponíveis.

## Arquitetura frontend

Shell e componentes V4 compartilhados; nova hierarquia JSX nas telas, tokens CSS próprios e foco visível. Reutilizar as funções de negócio e servidor. Divulgação progressiva com details/steps acessíveis; informação técnica avançada recolhida. Nenhuma nova biblioteca paga, sistema de tickets ou migration de banco planejada.

## Remoto — situação inicial

- Staging informado: https://alys-v3-staging.netlify.app/app
- Tentativa de acesso: CONNECT tunnel HTTP 403; site não pôde ser inspecionado.
- Nenhuma variável Netlify/Supabase/Resend disponível e nenhum conector remoto correspondente.
- Netlify (branch/env/runtime/logs/Preview): BLOCKED — conectar conta e liberar acesso ao staging.
- Supabase (projeto, Auth/RLS/Storage e migrations 026/027): BLOCKED — disponibilizar credenciais de teste seguras e identificar projeto de staging, sem escrita em produção.
- Resend (domínio/templates/assinatura/webhook/worker/entrega): BLOCKED — acesso seguro de staging e destinatário de teste explicitamente autorizado. Nenhum email real será enviado implicitamente.
- iPhone físico: BLOCKED — requer homologação em aparelho. Playwright usa Chromium móvel, não comprova Safari/câmera física.

Testes com fixtures/mocks e evidências locais serão distinguidos dos serviços reais no relatório final. A V4 não será declarada homologada remotamente enquanto esses bloqueios persistirem.
