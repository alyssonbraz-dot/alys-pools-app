# ALYS Pool Manager

Aplicativo da ALYS Pool Services LLC para registrar manutenção de piscinas pelo celular. Inglês por padrão, com português e espanhol; tema azul-escuro, USD e ppm. Unidades imperiais/métricas e fusos `America/New_York`/`America/Sao_Paulo` são configuráveis por empresa/imóvel.

**Fluxo do técnico:** Current Pool → Start Service → Readings → Chemicals → Checklist → Photo → Finish & Next. A visita fica salva no aparelho primeiro; **Synced** confirma que o servidor a registrou. O relatório é processado depois, sem bloquear o próximo cliente.

**Celular como interface principal:** navegação inferior fixa, calendário diário compacto, botões de pelo menos 44 px nos atalhos de campo e formulários em uma coluna. Clientes e equipe aparecem como cartões em telas pequenas. Salvar/concluir fica acima da navegação inferior, com espaço para a área segura do aparelho. O tema azul-escuro e os três idiomas foram preservados.

Este README é o roteiro de entrega e publicação com **Netlify Free + Supabase Free + Resend Free**, usando o domínio **alyspools.com**, registrado na Hostinger. Não é necessário contratar hospedagem na Hostinger. A renovação do domínio já comprado continua sendo responsabilidade do titular; planos gratuitos têm cotas e não garantem operação ilimitada sem custo.


## V2.4 — Profitability & Business Costs

Nova branch de revisão `feature/alys-v2-4-profitability`: Owner → More → **Business Costs** para custos, responsabilidades e condições de pagamento; **Finance / Profit Result** para resultado consolidado; **Pool Profitability** dentro de Properties & Pools no cliente. Previsões, recebimentos registrados e pagamentos devidos ficam separados. Campos ausentes não viram custo zero.

A entrega exige a migration aditiva **026** em instalações que já possuem 001–025. Consulte [uso, cálculos, segurança, testes, screenshots e limitações V2.4](docs/V24-PROFITABILITY.md). A migration foi validada somente localmente. Não aplique em produção, faça merge ou publique esta branch sem aprovação.

## Reconstrução visual V2.3 — três telas

Branch de revisão `feature/alys-v2-3-mobile-rebuild`, continuando a V2.3 anterior. Dashboard, Today’s Route e Service Visit têm novas composições JSX e componentes mobile reutilizáveis. O [relatório de reconstrução](docs/V23-ACTUAL-REBUILD.md) contém comparações BEFORE/AFTER em 390 px, arquivos e limitações. Backend, contratos de API, schema e fila offline permanecem os mesmos. Não execute reset, migration remota ou publicação para revisar a interface.

## V2.3 — mobile UX

Branch `feature/alys-v2-3-mobile-ux`, baseada no último merge `67c6415`. Cabeçalho azul ALYS, cartões brancos, calendário semanal, progresso circular, cinco destinos mobile por função e mapa com alternância mapa/satélite. A visita conserva FC/pH rápidos, favoritos, checklist, fotos e Finish & Next; Info e os corpos d’água ficam no topo. Clientes continuam reunindo endereços/piscinas.

Não há migration nova nem alteração da fila IndexedDB. Veja [entrega V2.3, screenshots e aceite no iPhone](docs/V23-MOBILE-UX.md). O satélite usa tiles públicos Esri sob seus termos e disponibilidade; `NEXT_PUBLIC_SATELLITE_TILE_URL` permite configurar outro fornecedor autorizado. Não foi contratado nenhum serviço. GPS e trajetos mantêm a configuração existente. Publicação e merge continuam dependentes de aprovação.

## Clientes, GPS e acesso dos técnicos

Branch de revisão: `fix/customer-gps-team-credentials` (base V2.2.1). Endereços, piscinas e spas são gerenciados em **Customers → cliente → Properties & Pools**. Não há seção independente no menu; favoritos antigos `/pools` e `/locations` redirecionam para Customers. No Dashboard, Missing coordinates abre a lista de clientes filtrada, incluindo locais ainda não confirmados.

**GPS:** no endereço do cliente, toque em **Use current GPS location**, permita a localização, confira o pino e marque **I confirm this service location**; depois salve o cadastro. Este botão usa a posição do aparelho: use-o estando no imóvel correto. Latitude/longitude manuais continuam disponíveis. HTTPS é obrigatório em produção (localhost funciona no desenvolvimento). O GPS é uma captura pontual, sem rastreamento contínuo e sem chave de API. Navegar usa as coordenadas confirmadas; caso contrário, o endereço. Em Routes → Route map & planning → Starting location & time, o GPS também pode preencher a origem; **Save starting location** confirma a alteração. Mapas, geocodificação de texto e estimativas viárias mantêm seus provedores e cotas já documentados abaixo; capturar GPS não ativa nenhum plano.

**Credenciais:** o Owner (Administrador) abre **Team & Technicians → técnico → Manage technician login** para editar o e-mail de login e/ou definir uma senha de pelo menos 16 caracteres. Confirme sua própria senha de administrador. A conta do técnico deve ter aceitado o convite. Nenhum e-mail é enviado por essa ação; compartilhe as novas credenciais por um meio seguro. Senhas existentes não são recuperáveis nem exibidas. Técnicos, administradores legados de função `admin`, contas de outra organização e contas Owner não podem usar esse endpoint para alterar credenciais. A verificação é no servidor, com leitura RLS e revalidação de organização/função antes do acesso privilegiado ao Supabase Auth. A auditoria registra somente os tipos de alteração, nunca senhas ou hashes.

Alterar a senha afeta novos logins; para bloquear sessões já abertas, use **Suspend Access**. A sessão do Owner permanece conectada após confirmar sua senha. `SUPABASE_SERVICE_ROLE_KEY` continua exclusivamente no servidor, como na configuração existente; não há nova variável ou migration. Fotos, visitas, relatórios e a fila IndexedDB não são alterados.

Detalhes e comandos de validação: [Clientes, acesso e GPS](docs/CUSTOMERS-GPS-ACCESS.md). Merge, migrations remotas e publicação continuam dependentes de aprovação.

## V2.2.1 — fotos e clientes

Branch de revisão: `fix/alys-v2-2-1-ios-sync-customers`. O patch recupera uploads interrompidos, identifica falta de sessão, preserva fotos/fila e retoma a sincronização ao voltar para o app. Câmera e galeria têm entradas separadas. **Prévia local não confirma upload; Synced depende do servidor.** Não remova a PWA nem limpe dados do Safari para tratar uma pendência.

Customers agora reúne o perfil em Overview, Properties & Pools, Service e History. Adicione/edite imóveis, piscinas e spas no perfil; o cadastro e as agendas continuam transacionais. Os links antigos `/pools` e `/locations` agora redirecionam para Customers.

**Sem migration nova:** requer as migrations 001–025 da V2.2. Consulte [diagnóstico, testes, capturas e aceite no iPhone](docs/V221-IOS-SYNC-CUSTOMERS.md). Safari/iPhone físico ainda precisam de aceite; não há alegação de teste no aparelho. Merge e deploy dependem de aprovação.

## V2.2 — interface reconstruída para celular

A branch de revisão `feature/alys-v2-2-complete-redesign` traz navegação por perfil, componentes compartilhados e todas as telas na nova identidade visual. O técnico abre a piscina atual, registra leituras e químicos, tira a foto e usa **Finish & Next**; o próximo stop abre após a gravação local, sem esperar upload/e-mail. Proprietário: Dashboard, Customers, Routes e More, com History, Reports, Finance, Team e Settings.

Consulte a [entrega V2.2](docs/V22-REDESIGN.md) para inventário, capturas antes/depois, benchmarks, testes e aceite em aparelho físico. A V2.1.2 de fotos continua preservada, incluindo a fila antiga do IndexedDB.

**Atualização de V2.1.2:** a migration aditiva **025** registra motivos de skip e é necessária antes do frontend V2.2. Não altera visitas existentes. A aplicação remota, merge e deploy exigem autorização; não execute seeds nem `db reset` em produção. Instalações novas da V2.4 usam migrations 001–026. O roteiro gratuito de Netlify, Supabase, Resend e DNS Hostinger abaixo continua válido.

## Atualizações anteriores

Os diagnósticos e históricos continuam em [V2.1.2 — fotos e recuperação](docs/V212-MOBILE-HOTFIX.md) e [V2.1.1 — clientes, datas e idiomas](docs/V211-HOTFIX.md). Para uma futura publicação aprovada da V2.4, consulte a entrega V2.4 e aplique todas as migrations pendentes até 026, com backup e aprovação. Não recrie empresa, proprietário ou clientes existentes.

## O que está incluído

- Login por senha, proprietário/administrador e técnico; autorização no servidor e RLS por empresa/atendimento atribuído.
- Clientes, propriedades, piscinas/spas, agendas recorrentes, stops do dia e planejamento de rotas.
- Leituras anteriores de 30 dias como referência, sem preencher medições atuais automaticamente.
- Leituras, produtos/quantidades, checklist por piscina, fotos comprimidas e indicadores de problemas.
- Rascunhos e fila offline por conta, sincronização com tentativas seguras e proteção contra visitas/relatórios duplicados.
- Histórico, fotos privadas e relatório por e-mail com foto. Relatórios respeitam a opção de envio de cada cliente.
- PWA instalável no celular. O app precisa permanecer aberto ou ser reaberto para sincronizar pendências locais.

A V2.4 inclui estimativas de lucratividade, custos e valores devidos. Cobrança, pagamentos bancários, contabilidade fiscal, inventário e portal de clientes não fazem parte desta entrega. Mapas/otimização são opcionais; o fluxo de visitas funciona sem contratar provedor de mapas.

## 1. Preparar as contas gratuitas

Use contas sob seu controle em [GitHub](https://github.com), [Netlify](https://app.netlify.com), [Supabase](https://supabase.com/dashboard) e [Resend](https://resend.com). Tenha acesso ao DNS de `alyspools.com` na Hostinger.

1. Selecione somente planos **Free**, sem adicionais pagos nem compra automática de créditos.
2. Confira cotas de tráfego, execução, armazenamento e envios no painel de cada serviço. Ao atingir limites, reduza/pause o uso; não autorize upgrade automático.
3. Ative autenticação de dois fatores nas contas administrativas.
4. Guarde chaves e senhas em gerenciador de senhas/configurações seguras, nunca neste repositório ou no chat.

Links para conferir condições vigentes: [Netlify](https://www.netlify.com/pricing/) · [Supabase](https://supabase.com/pricing) · [Resend](https://resend.com/pricing). As páginas de preços não puderam ser consultadas nesta rede; não há promessa de cotas específicas neste documento.

## 2. Baixar o projeto

No computador, instale Git e **Node.js 22 ou superior**. Docker é necessário apenas para desenvolvimento/testes locais, não para publicar usando o Supabase hospedado.

```bash
git clone https://github.com/alyssonbraz-dot/alys-pools-app.git
cd alys-pools-app
npm ci
cp .env.production.example .env.production.local
```

Para testar esta entrega antes do merge aprovado, selecione a branch de revisão e reinstale as dependências:

```bash
git fetch origin feature/alys-v2-4-profitability
git switch --track origin/feature/alys-v2-4-profitability
npm ci
```

Se a branch local já existir, use `git switch feature/alys-v2-4-profitability`. Para testar sem publicar, siga [desenvolvimento local](docs/LOCAL-DEVELOPMENT.md); o teste local usa `.env.example`, não credenciais de produção.

Se já tiver o projeto, atualize seu checkout e execute `npm ci`. Preserve arquivos `.env.*.local` existentes: eles são privados e ignorados pelo Git. No Windows, use WSL2/Ubuntu para os comandos de terminal deste guia.

## 3. Criar o Supabase e aplicar o banco

1. No painel Supabase, crie um projeto no plano **Free**. Prefira uma região dos EUA próxima à operação na Flórida.
2. Guarde a senha do banco. Em **Project Settings → API / API Keys**, obtenha a URL do projeto, a chave pública/publishable e a chave administrativa `service_role` ou secret equivalente. A interface do painel pode mudar.
3. Coloque os valores nos campos correspondentes de `.env.production.local`. Não use URL `localhost` nem chaves do backend local no site publicado.
4. Aplique todas as migrations pelo terminal:

```bash
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx --yes supabase@2.121.0 migration list --linked
npx --yes supabase@2.121.0 db push
npx --yes supabase@2.121.0 migration list --linked
```

`SEU_PROJECT_REF` é o identificador no painel/URL do projeto Supabase. Confira que o projeto vinculado é o correto antes de confirmar `db push`. Em banco já utilizado, faça backup antes da atualização e revise as migrations pendentes.

A lista remota deve incluir **001 a 025**, terminando em `202610300025_route_skip_events.sql`. Elas criam tabelas, políticas RLS, bucket privado, fila de relatórios e provisionamento do proprietário. Não copie somente a última migration e não torne o bucket `visit-photos` público.

**Nunca execute `db reset`, `supabase/seed.dev.sql` ou `tests/integration/setup.mjs` na produção.** Não há seed automático de clientes reais ou fictícios no deploy.

No painel **Authentication**, mantenha login por e-mail/senha habilitado e **Allow new users to sign up desativado**. O arquivo `supabase/config.toml` controla o ambiente local; essas configurações precisam ser conferidas também no projeto hospedado.

## 4. Criar seu acesso de proprietário

Em `.env.production.local`, preencha `ALYS_INITIAL_OWNER_PASSWORD` com uma senha única de pelo menos 16 caracteres, além da URL/chave administrativa do Supabase. Execute no computador confiável:

```bash
node scripts/setup-owner.mjs \
  --env-file=.env.production.local \
  --project-host=SEU_PROJECT_REF.supabase.co \
  --email=alyspools@gmail.com \
  --name="ALYS Owner" \
  --company="ALYS Pool Services LLC"
```

O hostname deve corresponder exatamente à URL do seu projeto. O script cria somente Auth + organização + perfil owner, sem cliente fictício, convite ou envio de mensagem. O endereço é confirmado administrativamente; use apenas o seu e-mail.

A repetição preserva a senha existente e não duplica organização. Se houver erro depois da criação do Auth, corrija a configuração/migrations e repita com o mesmo e-mail. Remova `ALYS_INITIAL_OWNER_PASSWORD` do arquivo após concluir; não a coloque no Netlify.

Na V2, inclua técnicos por **Team & Technicians**, com convite para cada pessoa criar sua própria senha. A configuração de envio e a alternativa administrativa de contingência estão em [acessos da equipe](docs/ENTREGA.md#acessos-da-equipe). Criar um usuário no Auth sem seu perfil não concede acesso ao app.

## 5. Publicar no Netlify Free

1. No Netlify, escolha **Add new project / Import an existing project → GitHub**.
2. Autorize o repositório `alyssonbraz-dot/alys-pools-app` e selecione a branch **main**.
3. Use a raiz do repositório, build **`npm run build`**, publish directory **`.next`**, Node **22**. O arquivo `netlify.toml` já configura esses valores e o adapter Next.js.
4. Antes do primeiro build válido, abra **Project configuration → Environment variables** e cadastre:

| Variável | Valor / uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://SEU_PROJECT_REF.supabase.co`, disponível no build e runtime |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave pública do mesmo projeto, build e runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | chave administrativa do projeto, somente servidor/Functions |
| `EMAIL_DELIVERY_ENABLED` | `false` inicialmente; `true` somente após preparar remetente e teste |
| `RESEND_API_KEY` | chave Resend, somente servidor/Functions |
| `EMAIL_FROM` | `ALYS Pool Services <reports@alyspools.com>`, após verificar o domínio no Resend |
| `REPORT_WORKER_SECRET` | segredo aleatório com pelo menos 32 caracteres, somente servidor/Functions |
| `CUSTOMER_INVITES_ENABLED` | `false`, portal de clientes desativado |
| `TEAM_INVITES_ENABLED` | `false` até remetente/fluxo de convite estarem verificados |

Para gerar o segredo, rode `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` **no seu terminal privado** e copie o resultado somente para a configuração segura. Não publique o resultado nem use os placeholders dos exemplos como segredo.

As duas variáveis `NEXT_PUBLIC_*` são públicas por definição. Nenhuma chave administrativa, senha ou token pode ter esse prefixo. Se houver seleção de escopo, disponibilize segredos às Functions, e as variáveis públicas ao build/runtime. A função agendada precisa de `EMAIL_DELIVERY_ENABLED` e `REPORT_WORKER_SECRET` no runtime também.

5. Faça o deploy e aguarde **Published**. Anote o endereço `https://SEU-SITE.netlify.app`.
6. Abra `/login` nesse endereço e teste o login. Se as variáveis públicas mudarem, execute novo build/deploy.
7. Em **Supabase → Authentication → URL Configuration**, use temporariamente esse endereço HTTPS como **Site URL** e redirect permitido exato.

Não envie `.env.production.local` ao GitHub e não publique `demo/` ou `index.html` como se fossem o aplicativo. O app exige servidor Next.js; upload estático no gerenciador de arquivos da Hostinger não executa login/API/relatórios.

## 6. Conectar alyspools.com pela Hostinger

Recomendação para preservar seu site institucional: publicar o aplicativo em **`https://app.alyspools.com`**. O domínio continua registrado na Hostinger; o app é servido pelo Netlify com HTTPS gratuito. Você também pode usar a raiz, conforme a alternativa abaixo.

### Opção recomendada: app.alyspools.com

1. No Netlify, abra **Domain management → Add a domain** e adicione `app.alyspools.com`. Escolha DNS externo e siga a verificação de propriedade, se solicitada.
2. Na Hostinger, abra **Domains → alyspools.com → DNS / Nameservers → DNS records**. Se os nameservers apontarem para outro provedor, edite a zona nesse provedor, não na Hostinger.
3. Adicione o registro abaixo usando **o hostname real do seu site Netlify**:

| Tipo | Nome/Host | Destino | TTL |
| --- | --- | --- | --- |
| CNAME | `app` | `SEU-SITE.netlify.app` | padrão do painel |

O destino não inclui `https://` nem `/`. Substitua registros A/AAAA/CNAME conflitantes **somente para `app`**, depois de guardar a configuração anterior. Preserve MX, TXT, DKIM, SPF e os registros da raiz/`www` usados por outros serviços.

4. Aguarde a propagação. No Netlify, confira a verificação DNS e a emissão do certificado em **HTTPS / TLS certificate**. Não pague certificado nem habilite proxy externo adicional para esta configuração.
5. Defina `app.alyspools.com` como domínio principal. Confirme que `https://app.alyspools.com/login` abre sem alerta de certificado.
6. No Supabase Auth, altere **Site URL** e redirects permitidos para `https://app.alyspools.com`. Não precisa adicionar domínio personalizado pago ao Supabase: sua API continua `*.supabase.co`.
7. Faça login novamente no domínio definitivo. Cookies, rascunhos e fotos locais são separados por domínio: **sincronize pendências no endereço antigo antes de trocar**.

### Alternativa: usar alyspools.com diretamente

Se não houver site que precise ser preservado na raiz, adicione `alyspools.com` e `www.alyspools.com` no Netlify e escolha a raiz como principal. No DNS externo, configure `@` com **o A/ALIAS exato indicado pelo painel Netlify**, e `www` com o CNAME indicado. Não use IP copiado de tutoriais antigos: siga os valores apresentados para seu site. Remova apenas conflitos desses hosts, preservando registros de e-mail.

Depois, configure Auth Site URL/redirects para `https://alyspools.com` e faça os testes nesse endereço. Essa alternativa substitui o site existente na raiz. Não mude nameservers de toda a zona sem antes preservar todos os registros necessários.

## 7. Ativar os relatórios com foto pelo Resend

1. No plano **Free** do Resend, abra **Domains → Add Domain** e adicione `alyspools.com`.
2. Copie **exatamente** os registros de verificação/DKIM e os registros de envio SPF/MX mostrados pelo Resend para a zona DNS autoritativa. Nome, tipo, prioridade e destino devem vir do painel; não invente valores.
3. Preserve os MX do seu correio existente. O MX de envio do Resend normalmente usa um subdomínio específico: não o substitua pelo MX da raiz. Não crie dois registros SPF concorrentes no mesmo host; revise a configuração se houver conflito. Não é preciso ativar recebimento no Resend para enviar relatórios.
4. Aguarde o status **Verified** e crie uma chave com permissão de envio para o domínio, se disponível.
5. No Netlify, salve a chave em `RESEND_API_KEY` e use `EMAIL_FROM=ALYS Pool Services <reports@alyspools.com>`. O domínio verificado permite esse remetente; receber respostas nesse endereço exige uma caixa/alias configurada separadamente. Gmail pode ser destinatário, não remetente verificado de `alyspools.com`.
6. Faça um deploy com as variáveis atualizadas. Para o teste controlado, use **somente dados fictícios** e destinatário **alyspools@gmail.com**, previamente autorizado. Ative **Enable service report emails for this client** no cadastro desse cliente de teste.
7. Defina `EMAIL_DELIVERY_ENABLED=true`, atualize o deploy e conclua uma visita com foto. Confira **History → Synced**, status do relatório e recebimento real no Gmail/Spam, com foto legível.

**Sent** indica que o Resend aceitou a mensagem com ID; não comprova recebimento ou abertura. Falha de e-mail não desfaz a visita. Reenvios usam o mesmo job/payload/chave para evitar duplicação; erros incertos antigos exigem reconciliação, não criação de novo relatório.

### Recuperação automática da fila

A conclusão confirmada tenta enviar um relatório imediatamente em segundo plano. O arquivo **`netlify/functions/report-worker.ts`** acrescenta recuperação **a cada 15 minutos**, mesmo com o app fechado, no deploy de produção. Ele chama o endpoint protegido usando o segredo no header; não precisa de serviço externo pago nem token na URL.

Após publicar, confira **Functions → report-worker → Schedule / Logs**. Preview/local não executa a agenda de produção. `URL` é a variável do próprio Netlify com a origem HTTPS do site; não precisa cadastrar URL extra. Se mudar domínio, mantenha o principal correto e confirme que o worker não recebe redirect/erro.

A agenda processa **um job devido por chamada**, além das tentativas imediatas por conclusão; um backlog grande pode demorar e deve ser acompanhado. Erros ficam na fila e respeitam leases/backoff; History permite retry administrativo. Com `EMAIL_DELIVERY_ENABLED=false`, a função agendada não faz requisição nem envia. A agenda consome cotas do plano Netlify; sua execução remota precisa ser confirmada no painel.

## 8. Cadastrar a operação e instalar no celular

1. Entre com o proprietário. Em **Clients → Add Customer**, preencha contato, imóvel, piscina(s), contrato e dias de atendimento; use **Save Customer & Activate Service**. O cadastro é transacional e gera uma janela de próximos stops.
2. O perfil do cliente reúne piscinas, agendas, preços, relatórios, histórico e localização. Use **Edit customer & service** para editar; agendamento não é mais o formulário principal de Settings.
3. Use **Team & Technicians** para equipe e **Route** para planejamento ou stop extra manual. O proprietário abre no Dashboard; o técnico abre em Stops e acessa somente seus atendimentos.
4. No celular, abra a rota online antes de ficar sem sinal. iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Android: Chrome → Instalar app.
5. Confira **Offline shell ready** e a rota carregada. Em falha, use **Settings → Check offline installation** e consulte **Installation details**. Não limpe dados locais para resolver instalação.
6. Ao terminar, confira **Pending Sync / Synced / Failed**. Pendência no aparelho ainda não chegou ao servidor; reabra o app com rede para sincronizar. Não limpe dados do navegador nem saia da conta com trabalho pendente.

Use somente um domínio definitivo para operar. Aparelho perdido, limpeza do navegador ou pressão de armazenamento podem perder trabalho não sincronizado; IndexedDB não é backup.

## 9. Checklist para aceitar a entrega em produção

- [ ] Planos Free confirmados, adicionais/compras automáticas desativados e consumo disponível.
- [ ] Migrations 001–020 aplicadas, signup público bloqueado e bucket privado.
- [ ] URL final com HTTPS e login funcionando em celular real.
- [ ] Proprietário consegue cadastrar cliente, piscina, agenda e stop.
- [ ] Técnico acessa somente seus stops e não consegue gerenciar clientes/equipe.
- [ ] Visita com leitura/checklist/foto aparece como Synced e continua no histórico após recarregar.
- [ ] Em modo avião, rascunho/conclusão local sobrevivem à reabertura; voltar online sincroniza sem duplicar visita.
- [ ] Falha de upload preserva foto local e permite retry; só confirmação do servidor indica Synced.
- [ ] Gmail autorizado recebe relatório com foto, e fila agendada aparece nos logs do Netlify.
- [ ] Backup do banco e das fotos privadas planejado; consumo e retenção revisados.

Comece com uma foto comprimida por visita. Fotos/relatórios consomem Storage, banco e tráfego; a aplicação também tem limites de upload próprios. Confira o uso semanalmente nos três provedores. Supabase Free pode pausar projetos inativos e não substitui estratégia de backup; exportação do banco não inclui os arquivos do Storage.

## 10. Desenvolvimento e testes locais

Para instalar backend local, criar somente dados fictícios e executar testes, siga [Desenvolvimento local](docs/LOCAL-DEVELOPMENT.md). Para uma demonstração sem instalar serviços, abra **`demo/index.html`** no navegador; ela não tem autenticação/backend/envio real e não deve receber dados reais.

Com dependências instaladas:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`test:db` usa Docker/PostgreSQL descartável do próprio teste. Integração mobile/offline exige Supabase local e o procedimento específico do guia local.

## Estado da entrega e suporte

Validações e limites: [VALIDATION](docs/VALIDATION.md). Atualização V2: [V2-DELIVERY](docs/V2-DELIVERY.md). Operação, equipe e recuperação: [ENTREGA](docs/ENTREGA.md). Detalhes técnicos: [Fast Technician Mode](docs/FAST-TECHNICIAN-MODE.md) · [Arquitetura](docs/ARCHITECTURE.md).

O código e os testes locais não comprovam publicação, DNS/HTTPS, execução da agenda remota, câmera física ou recebimento de e-mail. Esses pontos são os testes de aceite acima, nas suas contas. Nenhum serviço pago é necessário ao roteiro dentro das cotas Free; não há garantia de gratuidade ilimitada com aumento do uso.


## V2.1: configuração de equipe, entregas e demonstração

Para convites de Técnico/Owner, configure no runtime Netlify: `TEAM_INVITES_ENABLED=true`, `APP_URL=https://app.alyspools.com` (ou a origem real), `RESEND_API_KEY`, `EMAIL_FROM` e `SUPABASE_SERVICE_ROLE_KEY`. Isso é independente de `CUSTOMER_INVITES_ENABLED` e de `EMAIL_DELIVERY_ENABLED`. O destinatário define a própria senha. Supabase Auth deve usar a origem real como Site URL e a URL `/join` correspondente na lista de redirects; cadastro público desativado.

`EMAIL_REPLY_TO` é opcional e precisa ser um endereço válido controlado por você. Para confirmar entrega e tratar bounce/complaint, configure o webhook Resend `/api/email/webhook` e `RESEND_WEBHOOK_SECRET`. Sem webhook validado, o sistema mostra **Accepted by provider**, não **Delivered**. Settings → **System Health** mostra configuração, heartbeat do worker, cache e fila local; somente Owner tem acesso.

O [guia V2.1](docs/V21-DELIVERY.md) contém todas as variáveis, migrations, comandos de atualização, limites do PWA/iOS, diagnóstico dos problemas, configuração gratuita com o domínio Hostinger, demonstração privada com dados fictícios e checklist de aceite em produção.

Para regressão mobile local, use o backend local de [LOCAL-DEVELOPMENT](docs/LOCAL-DEVELOPMENT.md), com `.env.local` contendo somente chaves locais e envio desabilitado:

```bash
node tests/integration/setup.mjs
node tests/integration/backend.mjs
# Terminal separado: provedor fictício local, sem requisições a terceiros.
node tests/integration/routing-stub.mjs
# Terminal separado, depois de npm run build:
ROUTING_API_URL=http://127.0.0.1:8131 GEOCODING_API_URL=http://127.0.0.1:8131/search APP_URL=http://127.0.0.1:3002 EMAIL_DELIVERY_ENABLED=false TEAM_INVITES_ENABLED=false npm run start -- --port 3002
# Terminal dos testes:
TEST_BASE_URL=http://127.0.0.1:3002 npx --no-install playwright test
```

Instale o browser de teste se necessário (`npx --no-install playwright install chromium`). Não execute fixtures contra produção. A demonstração estática continua disponível; ela não substitui Auth/RLS/Storage do aplicativo real.
