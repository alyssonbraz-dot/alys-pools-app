# V2.3 — reconstrução dos três layouts mobile

Branch de revisão: `feature/alys-v2-3-mobile-rebuild`, iniciada em `818128d` de `feature/alys-v2-3-mobile-ux`. Sem merge, deploy ou alterações do banco de produção.

As dez referências estão visíveis nas mensagens anteriores da conversa; **não estão disponíveis como arquivos no workspace**. A pasta `docs/ux-references/v23` não existe no checkout consultado. A comparação estrutural usa as imagens da conversa, sem alegar leitura de arquivos locais inexistentes e sem copiar marcas, imagens, nomes ou endereços de clientes do Skimmer.

## Estruturas substituídas

- **Dashboard:** retirados o PageHeader e o bloco escuro de estatísticas da entrada. Novo `MobileDashboard` com hero azul, calendário de sete dias, indicador real da fila local e cartões por técnico, cada um com progresso circular e acesso à rota na data selecionada. Usa `/api/route` existente. Estatísticas, financeiro, atenção e atalhos administrativos continuam disponíveis em Your business. Receita não é tratada como lucro.
- **Today’s Route:** novo `RouteStopCard` substitui o JSX do cabeçalho de cada parada. Coluna numérica de altura total, corpo branco, cliente como título, endereço, status, metadados e ações. Verde para concluído, cinza para pendente, azul para atendimento ativo; pendência local não ganha confirmação de servidor. Numeração permanece ligada à posição na lista original, inclusive com filtros. Opções de planejamento são recolhidas, data e progresso continuam visíveis e o próximo destino tem navegação persistente.
- **Service Visit:** novo hero azul com cliente e endereço, abas Info/Pool/Spa, e componentes `ServiceCard` separados para Recent Activity, Pool Info, Equipment, Checklist, Readings, Dosages, Notes, Photos e Email. Instruções e ações secundárias foram para Info. Removido o salto automático inicial para Readings. FC/pH, opcionais, dosagens, checklist, captura, galeria e todas as operações usam seus callbacks anteriores. Finish & Next fica fixo acima da navegação inferior, com área segura.

O cartão Equipment mostra problemas anotados **nesta visita**; não inventa um inventário ou dados de equipamentos que a API não fornece. Dados cadastrais existentes continuam no cliente. Email distingue o rascunho local do relatório posterior à confirmação do servidor; não exibe um envio inexistente. Histórico continua sendo referência, sem preencher medições novas.

## Gate visual — 390 px

Capturas de navegador com viewport **390 × 844 CSS px**, DPR 3 (PNG 1170 × 2532), dados fictícios. BEFORE foi renderizado antes das alterações; AFTER foi renderizado com o build de produção reconstruído. Os testes criam fixtures novas, portanto quantidades/nomes de demonstração podem variar entre as capturas. Não são comparações pixel a pixel dos dados.

| Tela | BEFORE | AFTER |
| --- | --- | --- |
| Dashboard | [before-dashboard.png](screenshots/v23-rebuild/before-dashboard.png) | [after-dashboard.png](screenshots/v23-rebuild/after-dashboard.png) |
| Today’s Route | [before-route.png](screenshots/v23-rebuild/before-route.png) | [after-route.png](screenshots/v23-rebuild/after-route.png) |
| Service Visit | [before-service.png](screenshots/v23-rebuild/before-service.png) | [after-service.png](screenshots/v23-rebuild/after-service.png) |

Inspeção visual manual efetuada nas três imagens AFTER, comparando as referências da conversa e as capturas BEFORE. Critérios observados:

1. Dashboard: calendário e cartões individuais de técnicos substituem os antigos KPIs como foco inicial; hero e hierarquia mudaram materialmente.
2. Rota: blocos verticais numerados e cartões horizontais substituem a numeração pequena do layout antigo; header azul e navegação persistente são visíveis.
3. Visita: header com cliente/endereço e sequência de cartões independentes substituem o formulário compacto antigo; as abas e Finish & Next permanecem acessíveis.

A primeira renderização foi revisada novamente porque opções empilhadas escondiam as paradas e o layout anterior interferia no rodapé. A revisão final recolhe essas opções, remove o salto inicial para as leituras e fixa o rodapé acima da altura real da navegação. Passar testes não foi usado como prova de aceite visual. As imagens mostram estados reais, incluindo aviso de rota em cache quando presente; nenhum aviso foi removido para maquiar capturas.

## Arquivos de implementação

- `src/components/mobile/dashboard.tsx`: novo Dashboard e busca da rota diária existente.
- `src/components/mobile/field-layout.tsx`: novos MobileHeader, ProgressDial, RouteStopCard e ServiceCard.
- `src/components/mobile/rebuild.css`: composição e responsividade desses componentes.
- `src/app/(protected)/page.tsx`: integração do novo Dashboard e seção administrativa recolhível.
- `src/app/layout.tsx`: carregamento do CSS dos novos componentes.
- `src/components/field/field-app.tsx`: composição nova de rota/visita, preservando estado, handlers e payloads.
- `src/lib/i18n/messages.json`: títulos e textos em EN/PT/ES.
- `tests/integration/v23-mobile.spec.ts`: presença dos nove cartões, ordem DOM das abas, header/rodapé em viewport, larguras e capturas.
- Testes offline/localização ajustados para cliente como título e seção administrativa recolhível.

Nenhum arquivo de migrations, RLS, APIs de negócio, sincronização, service worker ou schema IndexedDB foi alterado. Sem dependência ou plano pago novo.

## Validação e limites

Comandos locais: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Testes Playwright usam Supabase local, Resend/convites desativados e fixtures fictícias. Cobertura: navegação e overflow em EN/PT/ES, abas de corpos d’água, checklist, fotos JPEG pequenas/grandes e HEIC/HEIF pendentes anteriores, substituição de imagem inválida, perda de sessão, resposta de conclusão perdida, ausência de duplicação e fechamento/reabertura offline.

Não houve teste de Safari/WebKit nem de iPhone físico. Pendentes no aparelho: câmera/galeria reais, GPS, teclado, rotação, zoom de texto, notch/área segura, suspensão durante upload e retorno da rede. Tiles externos e envio real de e-mail precisam de aceite autorizado no ambiente publicado. Não foi certificada uma duração de 15–30 segundos de interação física.

## Resultados executados

- Lint, typecheck e build de produção: aprovados no código final.
- Unitários: **139 testes / 25 arquivos** aprovados.
- Integração mobile/offline: **13 cenários distintos** aprovados em Chromium. A rodada ampla teve nove cenários aprovados e um seletor antigo incompatível com o novo título do cliente. Depois de atualizar esse seletor, passaram o cenário offline e os três cenários de localização EN/PT/ES. O cenário visual foi repetido novamente após acertar a distância do rodapé para a navegação e passou. Repetições não entram como cenários adicionais.
- A captura final valida header da visita, Finish & Next e navegação inferior dentro do viewport; a decisão visual também foi feita por inspeção das imagens, independentemente dos testes.
- Larguras de interface: 320, 390 e 430 CSS px. Capturas de aceite: 390 CSS px.
- Os testes SQL não foram repetidos: nenhuma definição de banco/RLS mudou. Os testes de integração usam Auth/PostgREST/Storage locais reais.

Reprodução das suítes selecionadas, após preparar Supabase/fixtures locais conforme LOCAL-DEVELOPMENT.md e iniciar o servidor seguro de testes em 3006:

```bash
TEST_BASE_URL=http://127.0.0.1:3006 npx --no-install playwright test \
  v23-mobile.spec.ts v221-recovery.spec.ts v212-mobile.spec.ts \
  offline-shell.spec.ts v211-localization.spec.ts \
  --project=mobile-chromium --output=/tmp/alys-rebuild-results
```

Última captura e gate: `v23-mobile.spec.ts --project=mobile-chromium`, aprovado. Os seis PNGs acima correspondem a capturas efetivamente renderizadas; não foram gerados por ferramenta de criação de imagens nem editados para representar uma interface inexistente.

As capturas AFTER finais foram repetidas em um contexto novo de 390 × 844, sem redimensionamento entre larguras, e esperaram dois frames de renderização antes de salvar. Dashboard, rota e visita apresentaram `innerWidth=390`, `innerHeight=844` e navegação inferior iniciando em y=772. Na visita, o rodapé e a navegação foram verificados dentro do viewport.

## Revisão operacional posterior

Correções encontradas na revisão da reconstrução:

- O atalho Today’s Route do Dashboard ignorava o dia selecionado no calendário. Agora ele e os cartões dos técnicos carregam a mesma data e fuso na URL.
- O estado de erro/dados de uma consulta anterior podia aparecer ao trocar de dia ou repetir uma requisição. Agora cada resultado pertence ao usuário, organização, dia, fuso e tentativa esperados; respostas atrasadas são descartadas e há Retry explícito. O cliente também recusa respostas com escopo inconsistente, sem substituir a autorização/RLS do servidor. Quando o nome de um técnico não vem na resposta, usa um rótulo genérico em vez de atribuir a rota ao Owner.
- Trocar o fuso em Maps mudava a URL para `/route`. O destino `/maps` agora é mantido.

Arquivos: `src/components/mobile/dashboard.tsx`, `src/components/field/field-app.tsx` e `tests/integration/v23-review.spec.ts`.

Validação desta revisão: lint, typecheck e build aprovados; 139 testes unitários e cinco testes mobile/offline aprovados. Os três testes novos verificam respostas com usuário/organização/data/fuso incorretos (simulados), retry, resposta atrasada, manutenção da data nos links e troca de fuso no mapa. A rodada inclui também o cenário visual EN/PT/ES em 320/390/430 px e a reabertura offline. Nenhum backend, schema, RLS ou formato da fila foi alterado; o aceite físico no iPhone permanece pendente.

## Continuidade visual — foco em produtividade

- Calendário horizontal de domingo a sábado, com mês/ano central e setas de semana com alvos de 44 px; os nomes acessíveis continuam traduzidos.
- Cartões de parada mostram cliente, endereço, status, ação principal e GPS. Metadados, Apple Maps, Skip, reatribuição e ordenação continuam acessíveis em More, sem disputar espaço com Start Service.
- Histórico dos últimos 30 dias mostra a tabela diretamente quando há registros. Ausência de dados continua explícita; valores anteriores não são copiados para as novas medições.
- Cabeçalho e cartões de técnicos ficaram mais compactos. A seta de navegação usa o ícone SVG ALYS, evitando depender de glifos de fonte.

Componentes alterados nesta etapa: `src/components/route-calendar.tsx`, `src/components/mobile/field-layout.tsx`, `src/components/mobile/rebuild.css`, `src/components/field/chemistry-history.tsx` e `src/components/field/field-app.tsx`. Testes de interface atualizados para histórico aberto e ordenação em More. As capturas AFTER permanecem nos caminhos da tabela acima; as capturas BEFORE são preservadas.

Inspeção visual realizada nas três telas em 390 CSS px. Validação: lint, typecheck, build e 139 testes unitários aprovados; sete cenários selecionados mobile/offline aprovados, incluindo navegação EN/PT/ES, abertura das ações secundárias, troca de mapa/fuso, respostas atrasadas, visitas e fotos pendentes e reabertura offline. Após substituir a seta textual por SVG, o cenário visual final foi repetido e aprovado; essa repetição não representa um cenário adicional distinto.

As referências usadas continuam sendo as dez imagens disponíveis na conversa, não arquivos locais inexistentes. Sem mudança de backend, RLS, migrations, schema IndexedDB, relatórios ou contratos. Sem envio real de e-mail, merge, deploy ou banco remoto. O aceite de câmera/GPS/Safari e área segura no iPhone físico continua pendente.
