# ALYS Pool Manager V2.1 — entrega e atualização segura

Branch de revisão: `fix/alys-v2-1-complete`, baseada no `main` V2 `868e30d`. Nenhuma alteração de produção, envio real de e-mail ou contratação foi executada nesta entrega. **Ordem: revisão → migrations → merge GitHub → deploy Netlify → aceite em produção.**

## Problemas investigados e decisões

| Área | Evidência no código / reprodução local | Correção |
| --- | --- | --- |
| Equipe não carrega | `team_contacts()` da V2 compara `id=auth.uid()` enquanto `id` também é coluna de retorno; PostgreSQL responde `42702: column reference "id" is ambiguous`. Reproduzido no Supabase local. | Migration 021 qualifica `actor.id`; teste SQL e ativação Owner no navegador exercitam o caminho. |
| Convites desativados | A V2 testa uma flag independente do envio de relatórios. Um remetente verificado não habilita `TEAM_INVITES_ENABLED`. URL de aplicação também precisa ser válida. Não há acesso às variáveis reais do Netlify para confirmar qual falta em produção. | Diagnóstico Owner informa nomes das variáveis ausentes/inválidas, sem valores. Configuração de convites e de relatórios permanece independente. |
| Conta adicional Owner | Aceitação anterior só permitia técnico. | Convite guarda papel no servidor; Owner exige confirmação explícita. Ativação usa o papel persistido, nunca papel enviado pelo destinatário. Proteção transacional do último Owner ativo. |
| Endereços | Filtro de geocoding presumindo EUA; coordenadas presentes não significavam localização confirmada. | US/BR, ZIP/CEP, marcador/manual, confirmação individual e controle de concorrência. Rota usa somente localização confirmada para estimativas. Conclusão não depende de mapa. |
| Fusos/unidades | Datas e algumas telas fixavam Nova York; histórico sem preferência imutável. | NY/SP por imóvel/rota, conversão canônica e metadados em novas visitas. Datas antigas não são reescritas. |
| MRR antigo | Preço em cadastro não é contrato recorrente verificado. | Revisão manual com preço, dias, técnico, início, origem e estado. Não há backfill automático de receita. |
| PWA | Cache depende de todos os assets Next. Falha pública específica não pôde ser reproduzida remotamente: proxy desta rede negou `alyspools.com/sw.js` com CONNECT 403. | Shell público versionado, validação dos assets, retry e aviso de quota. IndexedDB existente, fotos e fila não são apagados ao atualizar. |
| E-mail | `sent` significava aceitação da API, não entrega na caixa postal. | Estados distintos, Reply-To, webhook com assinatura Svix, eventos idempotentes, bloqueio de endereço com bounce/complaint e heartbeat do agendamento. |

As migrations 001–020 permanecem intactas. Leitores antigos continuam disponíveis. `pools.gallons` é ampliado de inteiro para numeric (valores existentes preservados exatamente), permitindo litros sem arredondamento destrutivo. Internamente permanecem galões, °F, fl oz e lb; ppm/pH não mudam. Novas visitas guardam unidades, fuso, idioma de relatório e nome do técnico no snapshot. Históricos anteriores usam interpretação imperial/NY original. Edição de preferências não altera medições nem relatórios já congelados.

A equipe pode trabalhar em fusos diferentes. A rota seleciona um fuso explicitamente; o cache local separa o mesmo dia em NY e SP. Otimização aplica-se ao grupo selecionado e preserva os demais stops; um plano é invalidado quando ordem/coordenadas/estado/fuso divergem. Horário inexistente na transição DST é rejeitado; repetição escolhe o primeiro instante válido.

## Migrations novas

1. `202610280021_access_delivery.sql`: convites Owner/técnico, último Owner, correção de contatos, saúde de destinatários, eventos de entrega e heartbeat privado.
2. `202610280022_locations_preferences.sql`: países, unidades, coordenadas confirmadas, fusos e snapshots; cadastro integrado e métricas por data local.
3. `202610280023_operations_review.sql`: revisão de contratos antigos, configurações protegendo marcador demo, diagnóstico Owner e leitores versionados de histórico.

RLS não foi desativada. Nenhum bucket se torna público. Novas funções administrativas exigem Owner ativo e organização correspondente; webhooks/worker usam apenas servidor. Contas suspensas com JWT ainda válido perdem acesso no servidor e RLS. O dispositivo offline não pode receber uma revogação instantânea sem rede: use dispositivos pessoais protegidos e sincronize/saia ao devolver aparelhos.

## Atualizar uma produção V2 existente

Não recrie Supabase, Owner ou clientes. Faça backup/exportação do banco e inventário do Storage antes da atualização; confirme uma forma de restauração disponível no seu plano. Nenhum backup pago é contratado pelo código.

Revisão local, sem publicar:

```bash
git fetch origin
git switch fix/alys-v2-1-complete
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`test:db` cria PostgreSQL Docker descartável, sem porta/volume externo. Exige Docker e imagem `postgres:17-alpine`. Nunca aponte fixtures ou seeds ao projeto hospedado.

**Somente após aprovação**, com o projeto correto conferido:

```bash
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx --yes supabase@2.121.0 migration list --linked
npx --yes supabase@2.121.0 db push --dry-run
# Esperado em produção V2: somente 021, 022 e 023 pendentes.
npx --yes supabase@2.121.0 db push
npx --yes supabase@2.121.0 migration list --linked
```

Pare se a lista divergir. Não rode `db reset`, `migration repair` nem seeds para contornar erros. Se usar SQL Editor manualmente, aplique os três arquivos completos na ordem, uma transação por arquivo, e mantenha o histórico de migrations consistente antes de voltar à CLI; não reaplique arquivos já executados.

Depois de confirmar o banco, configure variáveis, aprove o merge da branch em `main` pelo GitHub e deixe a integração existente do Netlify publicar. Não rode `netlify deploy --prod` em paralelo ao deploy Git. Para inspecionar o diff antes do merge:

```bash
git diff origin/main...origin/fix/alys-v2-1-complete --stat
git diff origin/main...origin/fix/alys-v2-1-complete -- supabase/migrations
```

As alterações são expansivas e o aplicativo V2 pode continuar usando seus endpoints durante a janela de migrations. Em caso de falha de frontend, restaure o deploy anterior no Netlify; **não reverta o banco apagando tabelas/colunas ou dados**. Preserve fila, payloads congelados e IDs para diagnóstico.

## Netlify, domínio e variáveis

Mantenha Netlify/Supabase/Resend em planos gratuitos, sem compra automática de créditos. Cotas vigentes devem ser verificadas nos painéis; esta rede não permitiu verificar preços/termos externos. Não há dependência paga obrigatória. Hostinger fornece o DNS do domínio já comprado; o roteiro DNS/HTTPS completo está no [README](../README.md).

Use `app.alyspools.com` como origem se esta for a URL final, ou `https://alyspools.com` se o aplicativo estiver na raiz. Configure **uma única origem canônica** em `APP_URL`, Supabase e DNS. Evite alternar origens: o cache e as sessões pertencem ao domínio de cada navegador.

| Variável | Escopo e uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Públicas; build/runtime do mesmo projeto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente servidor/Functions; nunca `NEXT_PUBLIC_*`. |
| `APP_URL` | Origem HTTPS final, sem caminho/query. Netlify `URL` é fallback; não usar URL de preview como link oficial. |
| `EMAIL_DELIVERY_ENABLED` | `true` somente para envio autorizado; controla relatórios. |
| `TEAM_INVITES_ENABLED` | `true` habilita convites somente após configuração revisada; independente dos relatórios. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Servidor. Remetente existente: `ALYS Pool Services <reports@alyspools.com>`. Preserve domínio verificado. |
| `EMAIL_REPLY_TO` | Opcional; e-mail válido controlado pelo titular. Não comprova existência da caixa postal. |
| `RESEND_WEBHOOK_SECRET` | Segredo `whsec_...` do endpoint Resend; somente servidor. |
| `REPORT_WORKER_SECRET` | Aleatório com pelo menos 32 caracteres; mesmo valor no runtime e função agendada. |
| `CUSTOMER_INVITES_ENABLED`, `CUSTOMER_PORTAL_URL` | Recurso separado. Não habilitar para corrigir convites da equipe. |
| `GEOCODING_PROVIDER`, `GEOCODING_API_KEY` | Opcional: `geoapify` e chave privada; verificar plano/termos comerciais atuais antes de habilitar. |
| `GEOCODING_AUTOCOMPLETE_ENABLED` | `true` libera sugestões automáticas. Manual funciona sem provedor. |
| `GEOCODING_API_URL` | Adaptador legado opcional, HTTPS; usar só endpoint aprovado para uso comercial. |
| `ROUTING_API_URL` | Opcional, serviço compatível OSRM aprovado. Sem ele não há estimativas inventadas. |
| `NEXT_PUBLIC_MAP_TILE_URL` | Template público opcional. Respeitar atribuição/cotas de tiles. |
| `APP_ENV` | Rótulo opcional: production/staging/demo. Não ativa o isolamento demo. |

Variáveis privadas precisam estar disponíveis em **Functions/runtime**, não apenas no build. Redeploy após alterar variáveis. Nunca colar segredos em logs, issues ou screenshots. Templates `.env.example`, `.env.production.example`, `.env.demo.example` não contêm credenciais.

## Supabase Auth e convites

- Desabilitar cadastro público; manter e-mail/senha. Não criar cadastro público de Owner.
- Site URL = origem oficial; Additional Redirect URLs = `https://app.alyspools.com/join` (substitua pela origem real), e somente callbacks usados e controlados. Staging usa sua própria origem/projeto.
- Conferir validade de convite/OTP e política de senha no painel Auth. O link do aplicativo também expira segundo `team_invitations.expires_at`.
- A equipe usa `admin.generateLink` no servidor e envia via Resend. Não depende de ativar SMTP de convite padrão nem de `CUSTOMER_INVITES_ENABLED`.
- O hash de ativação fica no fragmento `#` do link; não é escrito em logs. A conta nasce `invited` e só ganha acesso após definir senha e aceitar a linha de convite válida.
- Reenvio conserva mensagem/token e chave idempotente no prazo seguro de 22h. Após esse prazo, conferir aceitação no provedor e revogar antes de criar outro convite. Não prometer resend infinito sem risco de duplicação.
- Owner adicional exige confirmação explícita. O último Owner ativo não pode ser suspenso/inativado/removido. Suspender Owner revoga convites pendentes emitidos por ele.

## Resend, worker e entregas

Não reconfigure o domínio já verificado sem necessidade. No Resend, após aprovação, crie webhook para `https://app.alyspools.com/api/email/webhook`, habilitando `email.delivered`, `email.bounced`, `email.complained`, `email.failed`; salve o segredo em `RESEND_WEBHOOK_SECRET` e redeploy. Assinaturas inválidas são rejeitadas; o código guarda somente IDs, tipo e timestamps técnicos. Uma entrega confirmada não garante leitura pelo destinatário.

O worker `netlify/functions/report-worker.ts` executa a cada 15 minutos na publicação de produção, chama `/api/email/worker` com Bearer secreto e processa um job. A conclusão também aciona processamento assíncrono. Netlify local/preview não prova cron de produção. Em Functions, confirme que `report-worker` está agendado e invocado. System Health mostra heartbeat real; ausência ou atraso gera `Not verified`/`Warning`. Capacidade deste mecanismo não é ilimitada: verificar fila e cotas, especialmente em vários técnicos com 20 stops/dia.

`Queued` é fila; `Sending` é lease; `Accepted by provider` é recibo Resend; `Delivered` só aparece com webhook validado; `Failed` inclui rejeição/bounce. O retry usa a mesma visita/job/payload/chave e para antes da expiração da deduplicação do provedor. Corrigir e-mail com bounce exige revisão do contato, não recriar a visita. Relatórios continuam respeitando opt-in e destinatário atual; fotos permanecem privadas e seguem anexadas no e-mail autorizado.

## Demo segura

Fundação pronta; nenhum site de demo público foi ativado. Preferir projeto Supabase e site Netlify de staging separados dentro das cotas gratuitas; organização demo isolada por RLS também é suportada. Nunca compartilhar a chave administrativa ou uma senha entre testadores.

1. Copie `.env.demo.example` para `.env.demo.local` e configure somente o projeto aprovado de teste, origem do site e `DEMO_PROVISIONING_ALLOWED=true`.
2. Aplique migrations 001–023 nesse projeto e desabilite cadastro público.
3. Execute localmente em computador confiável:

```bash
node scripts/setup-demo.mjs --env-file=.env.demo.local \
  --project-host=SEU_PROJETO_DEMO.supabase.co \
  --email=EMAIL_DO_TESTADOR \
  --output=/tmp/alys-demo-activation.json
```

O script cria somente organização demo com dois clientes/imóveis fictícios (US/BR), piscinas e stops. Salva link privado em arquivo modo 0600, sem enviar e-mail, sem senha compartilhada e sem imprimir token. O titular pode entregar esse arquivo/link por canal privado autorizado. Cada pessoa cria a própria senha; use nova organização para cada novo e-mail. Rerun preserva senha/dados de membro ativo.

Banner identifica demo. O worker bloqueia e-mail de clientes mesmo com credenciais globais configuradas; convites externos da demo são bloqueados. Configurações públicas não removem `settings.demo`. O modo não dá acesso aos clientes de outras organizações. Os stops de exemplo são pontuais; novos dias podem ser planejados pelo próprio testador.

## PWA e aceite em dispositivos

Abra a rota online e aguarde `Offline shell ready`; isso valida recursos do shell, não significa que todas as rotas foram baixadas. Carregue cada rota desejada. Após atualização, aguarde a instalação; se falhar, Settings → Check offline installation. Não limpe dados do site para corrigir cache com visitas/fotos pendentes.

Rascunhos/fotos/fila continuam no IndexedDB original, por conta/organização; cache público atualizado não apaga esses registros. Quota cheia informa que a alteração **não foi salva**. iOS pode suspender execução em segundo plano e remover armazenamento sob pressão; `persist()` é pedido, não garantia. Instale por Safari → Compartilhar → Adicionar à Tela de Início. Reabra e mantenha o aplicativo em primeiro plano para sincronizar. Nenhum teste automatizado substitui aceite em iPhone/Android físico.

## Checklist de produção após autorização

- [ ] Backup conferido; migrations 001–023 listadas; dados/histórico/fotos preservados.
- [ ] DNS/HTTPS da origem oficial; `APP_URL` e redirects Auth correspondentes.
- [ ] Owner atual entra; Team carrega; System Health não mostra segredos.
- [ ] Convite autorizado de Técnico chega, ativa senha, vê só a rota atribuída; revogar/expirar/reenvio seguros.
- [ ] Convite autorizado Owner ativa conta independente; suspensão revoga acesso com sessão existente; último Owner protegido.
- [ ] Localizar ZIP e CEP com provedor aprovado ou manual; confirmar imóvel individualmente; mapa/navegação usam ponto salvo.
- [ ] Sexta-feira no Brasil continua sexta; NY atravessa DST sem gerar stops duplicados.
- [ ] MRR legado revisado explicitamente, subcontratos separados, nenhum preço duplicado por piscina.
- [ ] Temperatura/volume/produtos em unidades corretas; CSV/relatório preservam snapshot e foto.
- [ ] Uma visita autorizada com opt-in chega ao e-mail controlado; aceitação é distinta de entrega; webhook confirmado e retry sem duplicação.
- [ ] Netlify mostra cron real e heartbeat recente; fila não cresce sem processamento.
- [ ] Em iPhone e Android físicos: abrir rota online, desligar rede, foto/rascunho, fechar/reabrir, completar, reconectar; conferir uma visita e um job apenas.
- [ ] PT/EN navegação/reload, formulário, erros e estados; espanhol existente preservado.
- [ ] Demo usa dados fictícios e não envia e-mail de cliente.

## Validação e limites

Veja resultados executados abaixo (atualizados ao encerrar a entrega). Testes de integração usam Supabase Auth/PostgREST/Storage **locais**, Chromium mobile emulado e respostas locais controladas para geocoding/rotas. Resend é simulado nos testes; não houve envio externo. A verificação do domínio/remetente e do envio prévio em produção foi informada pelo titular, não reexecutada nesta entrega.

Pendente de credenciais/aprovação/ambiente real: confirmar variáveis e causa exata do aviso no Netlify, configurar webhook e cron reais, verificar plano/termos Geoapify/tiles/roteamento, publicar staging/demo e aceitar em aparelhos físicos. A rede do executor respondeu CONNECT 403 ao consultar `alyspools.com/sw.js` e a página de preços Geoapify. Nenhuma conclusão sobre os cabeçalhos/assets atuais do site público foi inferida desse bloqueio.

### Resultados executados nesta entrega

- Baseline V2: lint, typecheck, 74 testes unitários, 12 suítes SQL e build aprovados antes das alterações.
- V2.1: lint sem avisos/erros; typecheck; **97 testes em 17 arquivos** aprovados; **13 suítes SQL** aprovadas contra PostgreSQL 17 descartável, aplicando migrations 001–023 do zero.
- Supabase local atualizado sem reset; testes reais Auth/PostgREST/Storage aprovados.
- **16 testes Playwright Chromium mobile** aprovados contra build de produção e Supabase local, incluindo regressões V2, fotos, upload interrompido, offline/reabertura, repetição de conclusão, Owner/técnico, suspensão, expiração/revogação, PT/EN/ES e demo.
- `Complete & Next`: **163 ms** no último teste, com upload retido artificialmente. É tempo do avanço local nessa execução, não uma medição em celular físico nem uma promessa de tempo total de manutenção.
- `npm run build` aprovado. Provisionamento de demo local executado e repetido sem e-mails externos; ativação e isolamento exercitados no navegador.
- PWA validado em Chromium mobile emulado. Safari/iOS/WebKit e Android físicos não foram testados neste ambiente. E-mails reais, cron público, DNS, migrações remotas e deploy continuam pendentes de aceite autorizado.

Relação completa de arquivos: [V21-FILES.md](V21-FILES.md).
