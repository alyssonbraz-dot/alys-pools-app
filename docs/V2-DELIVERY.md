# ALYS V2 — entrega, revisão e atualização

Referência: 27/10/2026, America/New_York. O titular informou que produção já tem proprietário, cliente, piscina, visita e foto sincronizados. Esses dados **não foram acessados, alterados ou verificados remotamente** nesta implementação.

## Implementado

| Etapa | Resultado no código |
| --- | --- |
| Cadastro integrado | `/customers/new`: contato, imóveis, múltiplas piscinas, equipamentos, requisitos, faixa química, contrato e agendas na mesma operação |
| Perfil | `/customers/[id]`: contato/preço/contratos, imóveis, piscinas, agendas, próximos stops, histórico, fotos, notas e opt-in; edição integrada no mesmo perfil |
| Recorrência | Janela de 28 dias ao salvar agenda; geração idempotente da data ao abrir rota, sem fim obrigatório; pausa/retomada, reatribuição e proteção de atendimento iniciado |
| Equipe | `/team`, somente Owner: convites, status, edição, atribuições, carga, rota/histórico, suspensão e reativação |
| Convite | Supabase Auth OTP, link com token no fragmento, senha definida pelo destinatário, expiração/revogação/aceitação única; Resend com payload congelado, lease e deduplicação |
| Química | Tabelas de leituras e dosagens, 7/30/90 dias ou todo histórico, página de até 50 linhas, CSV da página, data fixa no scroll, valores ausentes como “—”, faixas específicas por piscina |
| Localização | Adapter Geoapify opcional, sugestões e autocomplete condicionado à configuração; fallback compatível com `/search`; coordenadas manuais, mapa/pino e confirmação antes de salvar |
| Dashboard | Proprietário: operação, carteira, MRR próprio e pendências; técnico mantém Stops compacto, progresso e próxima visita |
| Settings | Perfil da empresa, equipe, padrões de serviço/química/checklist, relatórios, lembretes internos, offline, conta e troca de senha com senha atual |
| Atendimento | Fluxo rápido preservado; foto pode ser associada a piscina/spa; requisito específico por corpo d’água opcional; upload/sync não bloqueiam próximo stop |
| PWA | Instalação recuperável, diagnóstico por recurso/status HTTP, query de versão preservada, cache verificado antes do indicador, versão anterior mantida durante atualização falha |
| E-mail | Integração existente preservada, nome do técnico em novos snapshots/relatórios; status de aceitação do provedor continua separado de Synced |

A agenda foi retirada do fluxo principal de Settings somente após o cadastro/perfil integrado estar funcional. A gestão avançada `/pools` continua disponível. Não houve reconstrução da autenticação, das migrations001–014 ou do armazenamento offline.

## Regras de negócio e limites

- MRR soma `contracts` ativos de origem **own**, cobrança **monthly**, cliente ativo/não arquivado e serviço recorrente vigente. Não soma `customer_details.monthly_price_cents` como contrato presumido; subcontratos ficam identificados separadamente no perfil. Não calcula lucro ou recebimento.
- Uma propriedade com várias piscinas pode compartilhar um stop; cada corpo tem leituras, dosagens e checklist próprios. O limite existente de **três fotos por stop** permanece. O formulário limita a três corpos com foto específica obrigatória; não habilite esse requisito para mais corpos do que o limite permite.
- Uma agenda permite vários dias, sem data final. Frequência exibida deriva dos dias selecionados. Agendas sobrepostas por propriedade/técnico/data continuam sujeitas à chave única original; uma reatribuição conflitante é recusada, não fundida silenciosamente.
- Na equipe, reatribuição de propriedade com uma agenda ativa atualiza os futuros elegíveis. Caso haja várias agendas ativas, edite a agenda específica no perfil. Imóvel sem agenda precisa de dias definidos no perfil; atribuição administrativa sozinha não inventa recorrência.
- Stops concluídos, snapshots, fotos e registros químicos ficam preservados. Alteração de agenda/pausa de cliente com stop em andamento exige concluir ou pular explicitamente primeiro. Stops manuais não são remanejados por edição de agenda; Owner pode reatribuir um stop não iniciado por ação explícita no planejamento.
- Padrões da empresa aplicam-se a **novas** piscinas no cadastro integrado; salvar padrões não sobrescreve configurações de piscinas existentes. Faixas químicas não são recomendações automáticas de dosagem.
- Exportações dizem “esta página”; não fingem exportar todo o banco. O histórico é paginado para não renderizar centenas de visitas. Dados digitados não são traduzidos; a interface continua em inglês por padrão com PT/ES.
- Pendências offline pertencem ao aparelho; dashboard mostra somente a fila deste dispositivo. O servidor não sabe o que ainda não foi enviado de outros aparelhos. App fechado/suspenso precisa ser reaberto para sincronizar visitas locais.
- Projetos Free continuam sujeitos a cotas, pausa por inatividade, orçamento de upload e consumo de fotos/payloads de relatórios. Nenhuma dependência paga foi adicionada e nenhuma retenção destrutiva foi automatizada.

## Arquivos e migrations

Principais arquivos novos: `src/components/customer-onboarding.tsx`, `location-picker.tsx`, `pin-map.tsx`, `team-manager.tsx`, `chemical-tables.tsx`, `chemical-ledger.tsx`, `company-settings.tsx`, `account-password.tsx`, `device-sync-summary.tsx`, `form-controls.tsx`; páginas de perfil/cadastro/equipe/rota e `/join`; APIs `/api/customers/onboard`, `/api/schedules`, `/api/team`, `/api/team/accept`, `/api/chemistry`, `/api/settings`, `/api/account`.

Também mudaram a página inicial, navegação, Settings, histórico, worker/relatório, validação, associação local de fotos, campos da rota, traduções e o service worker. O banco usa estas migrations novas, nesta ordem:

| Migration | Finalidade |
| --- | --- |
| `202610280015_unified_service.sql` | Metadados de piscina/imóvel, operação transacional de cadastro, idempotência e janela limitada de recorrência |
| `202610280016_team_access.sql` | Estado de acesso, guardas RLS/escrita, equipe/convites, claims e aceitação privilegiada |
| `202610280017_history_dashboard.sql` | Histórico químico paginado, filtros e métricas Owner sem duplicar MRR por piscina |
| `202610280018_company_defaults.sql` | Salvamento Owner dos padrões da organização |
| `202610280019_pool_photo_scope.sql` | Associação imutável de foto/corpo e validação transacional de requisitos por piscina |
| `202610280020_service_safety.sql` | Reconciliação por timezone, bloqueio de pausa em andamento, contatos privados da equipe, nome histórico do técnico e reatribuição explícita |

São adições ao banco e substituições versionadas de rotinas/políticas; não há reset, seed remoto ou remoção de clientes/visitas/fotos. Nenhuma migration001–014 foi editada. Como V2 passa a selecionar as colunas novas no login/rotas, **aplique015–020 antes de publicar o código V2**.

## Segurança

`access_state=active` é exigido no servidor e no banco, incluindo acessos com JWT anterior à suspensão. Helpers de autorização, políticas restritivas, guardas de escrita e predicates de fotos/histórico foram atualizados. Estado padrão `active` preserva contas existentes. O próprio técnico não altera papel/status e não consulta preço, contratos, equipe ou outra rota.

Novas tabelas de convites/detalhes da equipe são restritas ao Owner. Payload/token de entrega ficam em colunas sem SELECT para papéis do navegador; tokens são comparados por digest no servidor. A auditoria de convites registra somente estado/vínculo/expiração, sem copiar links, hashes ou payloads de envio; eventos privados da equipe ficam restritos ao Owner. A chave administrativa permanece somente no servidor. Convite nunca promove a Owner nem substitui associação de outra empresa. A aceitação exige OTP do Auth e atualização atômica do vínculo; a criação no Auth e o envio externo são etapas recuperáveis, não uma transação única de PostgreSQL.

Convites têm limite local de 48 horas e também a expiração efetiva do Supabase Auth; o menor prazo prevalece. Após 22 horas, reenvio incerto é bloqueado para respeitar deduplicação do Resend: reconcilie o provedor, revogue e emita novo convite quando apropriado. A interface não afirma entrega na caixa postal. Convite revogado/aceito não é reaproveitado. A suspensão não apaga informações já baixadas no aparelho nem invalida instantaneamente URLs assinadas ainda dentro de sua curta validade.

## Configuração pendente

Não habilite envio enquanto o domínio/remetente não estiver Verified. As variáveis novas são:

```dotenv
TEAM_INVITES_ENABLED=false
GEOCODING_PROVIDER=
GEOCODING_API_KEY=
GEOCODING_AUTOCOMPLETE_ENABLED=false
```

- Convites usam `RESEND_API_KEY`, `EMAIL_FROM` e `SUPABASE_SERVICE_ROLE_KEY` existentes, além de `TEAM_INVITES_ENABLED`. O opt-in de relatório do cliente e `EMAIL_DELIVERY_ENABLED` continuam separados. `CUSTOMER_INVITES_ENABLED` é o antigo recurso de portal, não convites de técnicos; mantenha-o desativado.
- Geocodificação é opcional. Para o adapter Geoapify: `GEOCODING_PROVIDER=geoapify`, chave no servidor, e autocomplete somente após habilitar explicitamente `GEOCODING_AUTOCOMPLETE_ENABLED=true`. Não adicione chave com prefixo `NEXT_PUBLIC_`.
- Antes de obter/usar chave, confira [termos/plano](https://www.geoapify.com/pricing/) e [API de endereço](https://www.geoapify.com/address-autocomplete/), permissão para uso comercial, atribuição e limites da sua conta. As páginas externas não puderam ser consultadas nesta rede; não afirmamos contrato/cota vigente verificados. Não é obrigatório contratar API paga. Sem provedor aprovado, use coordenadas manuais.
- O modo compatível `GEOCODING_API_URL` continua com busca explícita; não habilita autocomplete irrestrito de Nominatim público. O endereço só é alterado após seleção/edição do usuário; pino/coordenadas existentes não são sobrescritos por resultados de busca.
- `ROUTING_API_URL` continua opcional. O planejador informa erro/configuração ausente em vez de inventar tempos viários. Google/Apple Maps continuam como navegação externa.

## Atualizar a produção existente, na ordem correta

**Código de revisão:** branch `feat/alys-v2`. `main` não foi alterada para evitar deploy automático antes do banco. Não recrie projeto, proprietário ou cadastros de produção.

1. Sincronize pendências dos aparelhos. Faça backup privado do banco **e** dos objetos do Storage; exportação SQL não contém as fotos.
2. Revise as seis migrations acima e os resultados locais. Se possível, teste em projeto de homologação com dados fictícios e plano Free.
3. No checkout da branch revisada, confirme o project-ref correto e liste pendências:

```bash
git fetch origin
git switch feat/alys-v2
npm ci
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx --yes supabase@2.121.0 migration list --linked
npx --yes supabase@2.121.0 db push --dry-run
```

4. Depois de aprovar o escopo e o projeto de destino, aplique as migrations (isso não é feito por um push no GitHub):

```bash
npx --yes supabase@2.121.0 db push
npx --yes supabase@2.121.0 migration list --linked
```

Não execute `db reset`, seeds ou setup de integração remoto. Não publique `.env.*.local` nem credenciais.

5. Mantenha envios externos desativados. Cadastre as variáveis novas no Netlify se for usar os recursos opcionais. No Supabase Auth, mantenha signup público bloqueado e revise a expiração dos convites. O link de entrada do técnico usa `/join` no domínio do app.
6. Após banco aprovado/aplicado, revise e faça merge da branch para `main`, pelo fluxo normal do GitHub. O Netlify conectado deve gerar novo deploy; aguarde **Published**, confira logs do adapter e da função agendada. Não faça force push.
7. Execute o checklist abaixo em `app.alyspools.com` ou no domínio principal que você configurou. Um build verde não comprova produção funcionando.
8. Em falha de código, restaure um deploy anterior compatível no Netlify e investigue. Não reverta banco apagando colunas/registros; faça correção incremental. As adições usam defaults compatíveis com a versão anterior, mas qualquer rollback precisa do teste de login/visita/foto.

## Aceite manual no ambiente publicado

- [ ] Proprietário existente entra e os clientes, piscinas, visitas e fotos anteriores continuam acessíveis.
- [ ] Novo cadastro fictício autorizado cria cliente, duas piscinas e agenda sem data final; repetir a mesma gravação não duplica dados.
- [ ] Stop do dia aparece automaticamente; mudar dias/técnico, pausar e retomar preserva concluídos/manuais e bloqueia mudança de atendimento iniciado.
- [ ] MRR inclui contrato próprio ativo uma vez e exclui subcontrato, contrato inativo e serviço pausado.
- [ ] Owner acessa Team; técnico recebe convite autorizado, define senha e só consulta suas rotas/histórico. Revogar/expirar convite impede aceitação; suspender impede acesso com sessão anterior.
- [ ] Tabelas mostram valores reais por corpo, ausentes como “—”, faixas configuradas e exportação correta da página.
- [ ] Localização é conferida visualmente; edição do pino não muda dados até salvar. Provedor opcional e atribuição estão aprovados.
- [ ] Settings não sobrescreve piscinas existentes ao mudar padrões; troca de senha exige senha atual.
- [ ] PWA instala em iPhone real. Se falhar, copie somente caminho/status de “Installation details”, sem chaves, dados de cliente ou tokens de convite.
- [ ] Rota carregada reabre sem rede; rascunho/foto sobrevivem a fechamento, atualização e reconexão; conclusão não duplica.
- [ ] Fotos por piscina são identificadas e requisito específico é respeitado; fotos anteriores continuam abrindo de forma privada.
- [ ] Somente após verificação do remetente, o destinatário autorizado confirma relatório/convite na caixa postal; status de e-mail permanece separado de Synced.
- [ ] Confira uso/limites nos planos Free, backup e tempo de interação em aparelho real. O alvo15–30s não foi medido com manutenção/câmera física.

## Estado da entrega

Implementado e validado localmente conforme [VALIDATION](VALIDATION.md). Migrations aplicadas **somente no Supabase local**, sem reset. Não houve acesso às contas hospedadas, deploy Netlify, alteração de DNS, envio externo ou ativação paga nesta execução.

O erro de PWA relatado em produção não pôde ter sua causa exata confirmada: as consultas públicas a app.alyspools.com/alyspools.com foram bloqueadas pelo proxy403 antes da origem. Isso não indica indisponibilidade do site. O código agora corrige fragilidades conhecidas do instalador e fornece diagnóstico verificável; a instalação real publicada continua no aceite. Autocomplete real, entrega Resend, acionamento remoto da agenda e desempenho em iPhone também dependem de configuração/validação nas contas do titular. Não descrevemos essas etapas como concluídas.
