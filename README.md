# ALYS Pool Manager

Aplicativo da ALYS Pool Services LLC para registrar manutenção de piscinas pelo celular. Inglês por padrão, com português e espanhol; tema azul-escuro, galões, ppm, USD e horário `America/New_York`.

**Fluxo do técnico:** Stops → Start Service → Readings → Chemicals → Checklist → Photo → Complete & Next. A visita fica salva no aparelho primeiro; **Synced** confirma que o servidor a registrou. O relatório é processado depois, sem bloquear o próximo cliente.

Este README é o roteiro de entrega e publicação com **Netlify Free + Supabase Free + Resend Free**, usando o domínio **alyspools.com**, registrado na Hostinger. Não é necessário contratar hospedagem na Hostinger. A renovação do domínio já comprado continua sendo responsabilidade do titular; planos gratuitos têm cotas e não garantem operação ilimitada sem custo.

## O que está incluído

- Login por senha, proprietário/administrador e técnico; autorização no servidor e RLS por empresa/atendimento atribuído.
- Clientes, propriedades, piscinas/spas, agendas recorrentes, stops do dia e planejamento de rotas.
- Leituras anteriores de 30 dias como referência, sem preencher medições atuais automaticamente.
- Leituras, produtos/quantidades, checklist por piscina, fotos comprimidas e indicadores de problemas.
- Rascunhos e fila offline por conta, sincronização com tentativas seguras e proteção contra visitas/relatórios duplicados.
- Histórico, fotos privadas e relatório por e-mail com foto. Relatórios respeitam a opção de envio de cada cliente.
- PWA instalável no celular. O app precisa permanecer aberto ou ser reaberto para sincronizar pendências locais.

Financeiro completo, cobrança, inventário e portal de clientes não fazem parte desta entrega. Mapas/otimização são opcionais; o fluxo de visitas funciona sem contratar provedor de mapas.

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

A lista remota deve incluir **001 a 014**, terminando em `202610270014_fast_technician.sql`. Elas criam tabelas, políticas RLS, bucket privado, fila de relatórios e provisionamento do proprietário. Não copie somente a última migration e não torne o bucket `visit-photos` público.

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

Para incluir técnicos, siga [acessos da equipe](docs/ENTREGA.md#acessos-da-equipe). Criar um usuário no Auth sem seu perfil não concede acesso ao app.

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
| `CUSTOMER_INVITES_ENABLED` | `false` |

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

1. Entre com o proprietário. Em **Clients**, cadastre cliente e contato; habilite relatórios somente quando autorizado pelo cliente.
2. Abra **Properties & pools**, cadastre endereço, piscinas, leituras/checklist e **Require a service photo** quando necessário.
3. Em **Settings**, configure dias recorrentes e técnico. Em **Route**, confira os stops gerados ou adicione um stop manual.
4. O técnico abre **Stops** e atende somente os stops atribuídos. Quantidades rápidas são atalhos de entrada, não recomendações de dosagem.
5. No celular, abra a rota online antes de ficar sem sinal. iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Android: Chrome → Instalar app.
6. Ao terminar, confira **Pending Sync / Synced / Failed**. Pendência no aparelho ainda não chegou ao servidor; reabra o app com rede para sincronizar. Não limpe dados do navegador nem saia da conta com trabalho pendente.

Use somente um domínio definitivo para operar. Aparelho perdido, limpeza do navegador ou pressão de armazenamento podem perder trabalho não sincronizado; IndexedDB não é backup.

## 9. Checklist para aceitar a entrega em produção

- [ ] Planos Free confirmados, adicionais/compras automáticas desativados e consumo disponível.
- [ ] Migrations 001–014 aplicadas, signup público bloqueado e bucket privado.
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

Validações e limites: [VALIDATION](docs/VALIDATION.md). Operação, equipe, atualização e recuperação: [ENTREGA](docs/ENTREGA.md). Detalhes técnicos: [Fast Technician Mode](docs/FAST-TECHNICIAN-MODE.md) · [Arquitetura](docs/ARCHITECTURE.md).

O código e os testes locais não comprovam publicação, DNS/HTTPS, execução da agenda remota, câmera física ou recebimento de e-mail. Esses pontos são os testes de aceite acima, nas suas contas. Nenhum serviço pago é necessário ao roteiro dentro das cotas Free; não há garantia de gratuidade ilimitada com aumento do uso.
