# Revisão completa — ALYS Pool Manager

Revisão em 25/10/2026 do commit `82ed3db`, branch local `work`, correspondente à entrega enviada à `main`. Relatório em português; interface do produto em inglês por padrão, com PT/ES.

A fundação técnica suporta testes locais integrados, mas **recomendo corrigir os três achados P1 antes de usar com clientes reais**. Os testes existentes passam; cenários adicionais desta revisão reproduziram falhas de agenda, seleção de data e acesso a informações atuais de imóveis. Não encontrei acesso cruzado entre empresas nos cenários executados. Isso não equivale a uma certificação de segurança ou a um teste de invasão completo.

Esta revisão não alterou código de aplicação, migrations ou configurações de produção. Foi criado apenas este relatório. Os testes usaram dados fictícios locais. As reproduções SQL específicas foram encerradas com `ROLLBACK`; fixtures de integração continuam no banco local de desenvolvimento. Não houve publicação do aplicativo, compra, envio externo de e-mail ou utilização de dados reais de clientes.

## Resultado por prioridade

P1: corrigir antes de operação com dados reais. P2: corrigir no próximo ciclo de estabilização. Não foi reproduzido um incidente P0, como acesso anônimo a dados ou acesso entre organizações.

| ID | Prioridade | Achado | Evidência |
| --- | --- | --- | --- |
| R01 | P1 | Reatribuir agenda pode duplicar atendimento; arquivo/inativação não resolve stops já gerados | Reproduzido no PostgreSQL local |
| R02 | P1 | Resposta antiga substitui a rota da data atualmente selecionada | Reproduzido em Chromium mobile com resposta atrasada |
| R03 | P1 | Atribuição histórica dá acesso indefinido a instruções atuais do imóvel | Reproduzido com papel authenticated e perfil technician |
| R04 | P2 | Saída da conta indisponível pela navegação mobile normal | Reproduzido em Route e Settings |
| R05 | P2 | Limites independentes de cadastro podem quebrar ou omitir dados da rota; histórico sem paginação | Confirmado por inspeção do código; volume elevado não exercitado |
| R06 | P2 | Tradução parcial de mensagens operacionais | Status de rascunho reproduzido em português |

## R01 — Agenda pode manter ou duplicar visitas desatualizadas

**Local:** `src/lib/field/data.ts:9`; `supabase/migrations/202610230002_fast_route.sql:141`; `src/app/actions.ts:51`; `supabase/migrations/202610250006_customer_management.sql:90`.

Consultar a rota chama `generate_route`. A geração apenas insere registros e usa a unicidade `(property_id, technician_id, service_date)`. Alterar o técnico de uma agenda preserva o stop do técnico antigo e permite inserir outro stop para o novo técnico, no mesmo imóvel/dia. Desativar a agenda ou arquivar o cliente não cancela os stops pendentes já criados.

**Reprodução:** em uma transação local, criar cliente/piscina/agenda fictícios; gerar o dia futuro; mudar o técnico da mesma agenda; gerar novamente. Foram encontrados **2 stops** para o mesmo imóvel/dia. Depois, desativar agenda, arquivar cliente e gerar novamente: continuaram **2 stops pending**. A transação inteira foi revertida.

**Impacto:** dois técnicos podem receber o mesmo atendimento, ou continuar indo a um cliente encerrado. A navegação pelo calendário materializa dias futuros, ampliando o conjunto que precisa ser reconciliado. A tela Settings avisa que stops existentes são preservados; esse aviso não distingue com segurança reatribuição de um atendimento duplicado intencional.

**Correção recomendada:** tratar alterações de agenda e a reconciliação dos stops futuros em uma transação. Preservar visitas concluídas e alterações manuais intencionais; cancelar/substituir registros automáticos ainda pendentes de forma auditável. Definir uma identidade do atendimento que não dependa somente do técnico. Ao arquivar, oferecer tratamento explícito dos atendimentos abertos. Não basta adicionar uma restrição global por imóvel/dia se o negócio permitir duas visitas legítimas no mesmo dia.

**Teste de aceitação:** reatribuição, mudança de dias, encerramento e arquivo preservam histórico e deixam somente os atendimentos futuros esperados, inclusive quando o calendário já foi consultado.

## R02 — Troca rápida de data pode exibir stops do dia errado

**Local:** `src/components/field/field-app.tsx:46` e `:81`.

`loadRoute` aplica qualquer resposta recebida com `setRoute(data)`. Não há cancelamento da requisição nem identificação da seleção mais recente. A flag `cancelled` do efeito não impede as atualizações dentro de `loadRoute` depois de sua chamada.

**Reprodução:** abrir 25/10; reordenar um stop e reter a resposta de atualização desse dia; selecionar a semana de 01/11; aguardar a rota vazia da nova data; liberar a resposta de 25/10. O campo Service date continuou em **2026-11-01**, mas os botões e stops da rota de **2026-10-25** reapareceram. O atraso foi introduzido pelo Playwright somente para controlar a ordem das respostas; a falha ocorre no código real do cliente.

**Impacto:** o técnico pode abrir uma visita de outro dia sob um cabeçalho incorreto. O stop mantém seu ID original, portanto o servidor pode gravar a conclusão no atendimento antigo, mesmo com a data nova exibida. Também pode afetar o cálculo de trajeto, que usa `route.date`.

**Correção recomendada:** usar AbortController e/ou contador de requisição, verificando data e identidade antes de aplicar resposta, fallback, erro ou loading. Vincular toda a tela à mesma seleção confirmada. Cachear resultados por data pode continuar permitido, sem trocar a seleção atual.

**Teste de aceitação:** respostas em ordem invertida não alteram a data, os stops e a rota escolhidos mais recentemente; testar também falha tardia de uma requisição antiga.

## R03 — Técnico antigo pode ler instruções atuais de acesso

**Local:** `supabase/migrations/202610230002_fast_route.sql:95`; políticas `assigned_property`, `assigned_customer` e `assigned_pool`.

`can_access_property` autoriza o técnico quando existe **qualquer** stop já atribuído a ele naquele imóvel. Não verifica período, status ou vínculo operacional atual. Uma visita antiga concluída continua autorizando a leitura da linha atual de `properties`, inclusive `gate_notes`.

**Reprodução:** em transação local, manter somente uma atribuição concluída de 90 dias atrás para um técnico; alterar as instruções atuais do imóvel; executar SELECT com `SET ROLE authenticated` e identidade desse técnico. A consulta devolveu **1 registro contendo a instrução nova**, mesmo sem atendimento atual. Não foi usado service_role para o SELECT que demonstrou o acesso. Tudo foi revertido.

**Impacto:** retirar o técnico da agenda não revoga a consulta a futuras mudanças de códigos/notas de acesso e cadastro desse imóvel. O isolamento entre organizações continua presente; o problema é excesso de acesso dentro da organização.

**Correção recomendada:** separar leitura histórica de visita, contexto químico e acesso ao cadastro/instruções atuais. Conceder informação sensível atual por atribuição vigente ou janela de trabalho definida, com revogação no servidor. Manter o snapshot histórico permitido sem liberar gate notes atuais. Se o negócio deliberadamente permitir acesso permanente, essa política precisa ser uma decisão explícita e informada.

**Teste de aceitação:** técnico com somente visita antiga pode consultar o histórico autorizado, mas não recebe novos códigos de acesso; técnico atualmente designado continua operando e não ganha acesso a outro tenant.

## R04 — Não há saída da conta acessível no celular

**Local:** `src/components/shell.tsx:6`; `src/app/globals.css:8`; `src/app/(protected)/settings/page.tsx:19`.

O botão LogoutButton fica na sidebar, ocultada abaixo de 770px. A barra inferior e Settings não oferecem outra saída. `/login` só mostra esse botão no caso específico de mensagem de membership.

**Reprodução:** Chromium com viewport iPhone 13: **0 botões Sign out visíveis em Route**, **0 em Settings**, **1 existente quando elementos ocultos são incluídos**.

**Impacto:** no principal dispositivo de uso, a pessoa não encontra a ação que encerra a sessão e limpa dados locais com aviso de trabalho pendente. Isso dificulta troca de usuário e proteção do aparelho antes de compartilhá-lo.

**Correção recomendada:** incluir saída acessível em Settings ou menu do cabeçalho mobile, reutilizando o fluxo existente de confirmação de pendências e limpeza do IndexedDB. Testar também a reação de outras abas após sair.

## R05 — Paginação insuficiente pode comprometer rota e pesquisa histórica

**Local:** `src/lib/field/data.ts:11`, `:30` e `:53`; `src/app/(protected)/pools/page.tsx:13`; `supabase/config.toml:8`.

A rota consulta separadamente até1000 stops, propriedades, piscinas e clientes, sem buscar primeiro apenas os relacionamentos necessários. Esses conjuntos podem não conter os mesmos vínculos. Ao crescer a carteira, um stop pode apontar para propriedade/cliente fora da janela e disparar `Stop relationships missing`; piscinas fora do limite podem sumir da configuração apresentada, embora o banco ainda as exija ao concluir. As consultas administrativas de piscinas também ficam sujeitas ao limite PostgREST.

O histórico carrega somente200 visitas e faz busca no cliente sobre esse conjunto. Uma visita mais antiga pode existir no banco e não ser encontrada pela pesquisa geral; o filtro por cliente já ocorre no servidor antes do limite, o que reduz esse problema nesse fluxo específico.

**Evidência:** análise das consultas e de seus caminhos de erro. Não foi executado teste com mais de1000 entidades nem benchmark de carga; este achado não descreve uma falha observada em uma carteira pequena.

**Correção recomendada:** carregar os IDs da rota e consultar os relacionamentos correspondentes, com paginação em todas as coleções necessárias. Adicionar paginação/cursor e pesquisa no servidor para histórico/cadastros. Mostrar claramente o intervalo de resultados quando houver limite.

## R06 — Tradução não cobre todas as mensagens operacionais

**Local:** `src/components/field/field-app.tsx:234` e `:273`; `src/components/logout-button.tsx:13`; mensagens dinâmicas em `src/components/field/field-app.tsx:74`.

A interface principal troca de idioma, mas alguns textos são renderizados diretamente, sem passar pelo tradutor. O status `saveStatus` é um exemplo. Há também confirmação de saída em inglês e nomes genéricos de técnico usados como fallback.

**Reprodução:** abrir uma visita, selecionar português e observar que o status de salvamento continua com **Draft saved on this device**. As medições e a preferência de idioma continuaram preservadas, conforme esperado.

**Impacto:** português/espanhol ainda têm trechos em inglês em mensagens usadas para decidir se o trabalho está salvo ou pode ser sincronizado.

**Correção recomendada:** usar chaves estáveis e tradução de mensagens completas com parâmetros, incluindo confirmações, loading, erro e acessibilidade. Não traduzir nomes próprios, endereços ou notas digitadas. Adicionar verificações de idioma para estados de falha e offline, além do login.

## Pontos positivos verificados

- Sessão confirmada no servidor; papel e organização vêm de profiles, sem concessão por metadata enviada pelo usuário. Signup público bloqueado no backend local.
- RLS, FKs compostas e RPCs validam escopo de empresa, atribuição de stop e transações em lote. Testes negam outro tenant, alteração de papel e mutations indevidas.
- Clientes têm arquivo lógico; o histórico não é apagado junto com o cadastro.
- Conclusão de visita é transacional e idempotente. Histórico, leituras e detalhes internos são imutáveis; correções são anexadas.
- Fotos usam bucket privado, URLs assinadas, validação de tamanho, decodificação/regravação JPEG no servidor e remoção de metadados. Browser não recebe chave administrativa.
- Notas internas/equipamentos/filtro/reparos são gravados fora do snapshot público e não entram no relatório ao cliente.
- Fila offline preserva IDs, rascunhos e fotos; foi testada retomada sem duplicar visita. CacheStorage guarda shell/arquivos públicos, não HTML autenticado ou APIs privadas.
- Histórico químico de30 dias é por piscina, acompanha o cache da rota e não preenche as medições novas. Janelas consideram America/New_York.
- FC1/3/5 e pH7.0–8.0 com passo0.2 coexistem com entrada manual. Quantidades de produtos continuam separadas das leituras.
- CSV escapa delimitadores e protege células contra fórmulas. React escapa texto; marcadores do mapa usam textContent para nomes. A demonstração tem teste de texto com conteúdo de script.
- Worker de relatório tem claim/lease, payload congelado e chave idempotente. “Sent” exige ID de aceitação do provedor e não representa entrega na caixa postal.
- `.env.local` está fora do Git; `.env.example` contém placeholders. A revisão dos arquivos rastreados não detectou padrões de credenciais/chave privada.

## Validação executada nesta revisão

| Verificação | Resultado | Limite da evidência |
| --- | --- | --- |
| `npm run lint` | Aprovado | Análise estática |
| `npm run typecheck` | Aprovado | Tipos, não comportamento externo |
| `npm test` | 48 testes / 9 arquivos aprovados | Inclui contratos de e-mail/roteamento simulados |
| `npm run test:db` | 6 suítes SQL aprovadas, migrations001–009 | PostgreSQL17 descartável com harness Auth/Storage mínimo |
| `npm run build` | Aprovado | Build local de produção |
| `node tests/integration/backend.mjs` | Aprovado | Supabase real local: Auth, REST e Storage |
| Playwright de integração | 6 testes mobile aprovados | Next na porta3001; roteamento/geocodificação simulados em8131 |
| Playwright da demonstração | 3 testes aprovados | HTTP estático local, Chromium com viewport mobile |
| `npm audit --json` | 0 vulnerabilidades conhecidas reportadas | Estado do catálogo consultado; não analisa lógica de negócio |
| Reproduções SQL extras | R01 e R03 confirmados | Dados fictícios; transação revertida |
| Reproduções de navegador extras | R02, R04 e R06 confirmados | R02 usa atraso controlado de resposta local |

Os nove testes de navegador existentes verificam os fluxos cobertos, mas não contemplavam os casos adicionais encontrados. Passar a suíte não demonstra ausência dessas falhas.

## Integrações e preparação operacional

| Área | Estado observado | Necessário antes de operação |
| --- | --- | --- |
| Login e CRUD | Implementados e testados localmente | Configuração segura do projeto hospedado, provisionamento e recuperação de acesso |
| Mapa e otimização | UI/contrato testados com serviço local simulado | Validar tiles, geocodificação e trajetos com o provedor escolhido; estimativas não garantem ótimo global |
| Relatórios por e-mail | Código/fila testados; envio externo não validado | Resend/remetente verificado, scheduler, teste autorizado de entrega e rotina para falhas |
| Convites | Desativados por padrão; negativa503 testada | SMTP, redirect permitido e portal HTTPS existente; o projeto não implementa as páginas desse portal |
| Histórico de convites | Claim/status no banco | UI de falhas/reconciliação: o endpoint pode retornar requested0 mesmo quando o Auth rejeita convites; não oferece hoje resultado detalhado por cliente |
| Offline/PWA | Fluxo emulado aprovado | Testar câmera, instalação, armazenamento e retomada em iPhone/Android físicos; IndexedDB não é backup nem cofre |
| Escala e recuperação | Sem carga/restore completos exercitados | Monitoramento, backup e teste de restauração, alertas de fila e capacidade |
| Financeiro | Fundação de contratos e função de separação presentes | Não há módulo financeiro operacional, contas a receber/pagar, custos ou lucro líquido |

A mensalidade em Customers é cadastro, não prova de recebimento e não alimenta automaticamente contratos/contabilidade. A função de receita mantém MRR próprio separado de subcontrato mensal; repasses por visita/contrato fixo não são calculados por ela. Não há tela que apresente faturamento como lucro. A atribuição/frequência no perfil do cliente permanece independente da agenda em Settings, o que exige cuidado operacional e deve ficar mais explícito na UI.

Não foi feito novo teste de provedor externo nesta revisão. A validação anterior registrou OSRM bloqueado por proxy403. Não há evidência nova de que esse bloqueio foi resolvido. Nenhum convite ou relatório real foi enviado.

## Manutenção e segurança a fortalecer

Estes são riscos/limitações identificados por inspeção, não incidentes reproduzidos:

- A rota de upload limita cada arquivo, mas não estabelece uma cota persistente de objetos por stop/organização ou rate limit distribuído. Novos photo_id permitem acumular uploads, inclusive arquivos abandonados após edição/rejeição. Planejar cotas e limpeza auditável antes de crescer o uso de Storage.
- A CSP atual restringe frames, objetos e base URI; não define script-src/default-src. Evoluir a política com nonces/hash e validar compatibilidade do Next e Leaflet. Não foi reproduzido XSS no app Next.
- Geocodificação limita frequência por memória do processo. Isso não equivale a uma limitação global em múltiplas instâncias; validar termos e capacidade do provedor.
- A otimização altera a ordem via RPC e grava o plano em uma chamada posterior. Não é uma única transação: falha entre as duas etapas pode deixar a ordem alterada sem cálculo salvo. Fingerprints evitam usar várias estimativas desatualizadas, mas não tornam as duas gravações atômicas.
- Arquivos/componentes extensos e várias expressões em uma única linha dificultam revisão, depuração e manutenção. Separar apresentação, estado e operações com uma formatação consistente.
- Não há configuração de CI versionada para garantir que os checks sejam executados em cada mudança. Não foi consultada a configuração externa do GitHub; isso não afirma que inexiste alguma automação fora do repositório.
- O protótipo antigo na raiz e a demo estática continuam sem autenticação real. O Next não os serve como aplicativo protegido; não usar dados reais neles. Preferir instruções claras que levem ao arquivo correto.

## Sequência recomendada

1. Corrigir R01, R02 e R03, com testes de regressão que reproduzam exatamente os cenários acima.
2. Disponibilizar saída mobile, concluir mensagens EN/PT/ES e eliminar truncamentos de dados críticos da rota.
3. Validar em aparelhos reais; configurar somente as integrações aprovadas, com destinos de teste autorizados.
4. Exercitar backup/restauração, monitoramento e comportamento de filas antes do piloto com clientes reais.
5. Tratar financeiro como entrega própria futura, preservando carteira própria, subcontratos, recebimentos, custos e lucro como conceitos separados.

Não é necessário reescrever a fundação para corrigir estes problemas. São mudanças localizadas em reconciliação de agenda, controle de respostas no cliente, políticas de acesso e acabamento operacional.
