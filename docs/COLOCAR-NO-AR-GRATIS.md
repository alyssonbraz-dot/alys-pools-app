# Colocar o básico no ar — sem contratar plano pago

Prioridade: login → cliente/piscina → stop → visita com foto → histórico → relatório por e-mail. O código prepara publicação; um build local não significa que há um site público ou e-mail entregue.

## Serviços e condição de custo

Candidatos: **Netlify Free** para o Next.js, **Supabase Free** para login/banco/fotos e **Resend Free** para relatórios. Use o endereço gratuito `*.netlify.app`; não compre domínio para hospedar o app. Não use Vercel Hobby para esta operação comercial sem verificar seus termos de uso.

Selecione somente planos Free, sem adicionais pagos, compra automática de créditos ou upgrades. Antes de criar/publicar, confira os limites apresentados na própria conta. Esta sessão não conseguiu consultar as páginas oficiais de preços por bloqueio403 da rede: não há garantia aqui sobre cotas vigentes. Plano gratuito não oferece capacidade ilimitada; ao atingir limite, prefira pausar o uso em vez de contratar cobrança.

Links oficiais: [Netlify](https://www.netlify.com/pricing/) · [Supabase](https://supabase.com/pricing) · [Resend](https://resend.com/pricing).

Fotos consomem armazenamento e tráfego. Comece com uma foto comprimida por visita e acompanhe o consumo no Supabase. A aplicação tem cotas próprias de upload e não aumenta planos automaticamente. Não apague fotos vinculadas a visitas para liberar espaço sem uma decisão de retenção e backup.

## O que depende do proprietário

É preciso uma conta sua em cada serviço escolhido e um projeto Supabase hospedado. Senhas, tokens e chaves devem ser adicionados em configurações seguras, nunca em issue, README ou chat.

**Remetente é uma etapa separada da hospedagem:** para enviar pelo Resend aos clientes, use um domínio que você já possui e configure a verificação DNS. Não basta preencher seu Gmail em EMAIL_FROM. O remetente de teste do Resend pode servir para validar somente o e-mail do próprio titular da conta, conforme as restrições do provedor; não substitui um remetente liberado para todos os clientes. Se não houver domínio próprio, escolher um transporte autorizado da sua conta de e-mail é uma pendência; a versão atual usa Resend e não implementa Gmail SMTP/OAuth.

## 1. Criar o backend gratuito

1. No Supabase, criar projeto **Free**, guardar a senha do banco de forma privada e não ativar serviços pagos.
2. Configurar API URL, chave publicável e chave administrativa desse projeto. Não usar as chaves do Supabase local54321.
3. Aplicar **todas** as migrations, em ordem, incluindo013. Pelo CLI:

```bash
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx --yes supabase@2.121.0 db push
```

Revise o projeto vinculado antes do `db push`. Não execute `db reset`, seed.dev.sql ou tests/integration/setup.mjs no projeto hospedado. O seed de testes bloqueia host remoto.

4. No Auth do projeto hospedado, manter signup público desativado e provedor de e-mail/senha habilitado. O config.toml local não configura automaticamente todos os parâmetros do painel hospedado.
5. Após criar o site, configurar Site URL/redirects do Auth para o endereço HTTPS exato do app. Não adicionar wildcard desnecessário.

## 2. Criar somente o seu acesso

Copiar `.env.production.example` para `.env.production.local`, que é ignorado pelo Git. Preencher URL/chaves do projeto remoto no arquivo privado ou em variáveis seguras do processo.

Criar uma senha forte de pelo menos16 caracteres para `ALYS_INITIAL_OWNER_PASSWORD`; não colocá-la em comando versionado nem nas variáveis públicas do site. Executar no computador/ambiente confiável:

```bash
node scripts/setup-owner.mjs \
  --env-file=.env.production.local \
  --project-host=SEU_PROJECT.supabase.co \
  --email=SEU_EMAIL \
  --name="Seu nome" \
  --company="ALYS Pool Services LLC"
```

O script exige confirmação do hostname de destino, usa Auth Admin e uma RPC exclusiva de service_role para criar organização/perfil owner. Não envia convite e não cria clientes ou visitas. O e-mail é marcado confirmado por este canal administrativo; o script não prova propriedade por link de confirmação. Use apenas o seu endereço.

Reexecutar não duplica organização nem altera senha existente; contas com vínculo conflitante são recusadas. Se a criação do Auth concluir e o perfil falhar, corrigir migrations/permissões e repetir com o mesmo e-mail. Remover ALYS_INITIAL_OWNER_PASSWORD do ambiente após provisionar. Nunca colocar service_role em NEXT_PUBLIC_*.

## 3. Publicar o app no plano Free

No Netlify, importar o repositório `alyssonbraz-dot/alys-pools-app`, branch main. O `netlify.toml` fixa o adapter Next.js, build e Node22. Usar o site gratuito, sem domínio comprado ou add-on pago.

Configurar estas variáveis no Netlify antes do build válido:

| Variável | Escopo/valor |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | URL do projeto hospedado, usada no build e runtime |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | chave pública do mesmo projeto, build e runtime |
| SUPABASE_SERVICE_ROLE_KEY | segredo apenas no servidor/runtime |
| EMAIL_DELIVERY_ENABLED | false até o teste controlado de e-mail |
| RESEND_API_KEY | segredo do provedor, somente servidor |
| EMAIL_FROM | remetente verificado do seu domínio |
| REPORT_WORKER_SECRET | segredo aleatório com pelo menos32 caracteres, servidor |
| CUSTOMER_INVITES_ENABLED | false |

Não colocar ALYS_INITIAL_OWNER_PASSWORD no site. Não é necessário configurar mapas, roteamento ou convites para concluir uma visita. Se mudar NEXT_PUBLIC_*, refazer o build. Não publicar a pasta demo como se fosse o app com login/banco.

## 4. Configurar relatório com foto

1. Criar chave Resend em uma conta no plano Free e verificar o domínio/remetente existente.
2. Configurar RESEND_API_KEY e EMAIL_FROM no servidor.
3. Usar primeiro somente o destinatário de teste autorizado, `alyspools@gmail.com`. Não enviar dados reais de clientes nesse teste.
4. Habilitar envio somente depois da configuração correta: EMAIL_DELIVERY_ENABLED=true. Habilitar também Enable service report emails no cadastro do destinatário autorizado.
5. Concluir uma visita controlada com foto. Confirmar o registro em History, status da fila/aceitação e recebimento real na caixa postal com foto legível. Aceitação não prova entrega; Gmail/Spam devem ser conferidos pelo destinatário.

Não foram enviadas mensagens reais por esta preparação. Se não houver domínio/remetente autorizado, o registro da visita/foto funciona, mas envio aos clientes permanece bloqueado.

## 5. Fluxo básico de operação

1. Fazer login com seu acesso; abrir Clients e cadastrar os dados corretos.
2. Abrir Properties & pools, configurar piscina, checklist/leituras e **Require a service photo** quando o relatório precisar sempre de foto.
3. Em Route, adicionar stop do dia ou configurar recorrência em Settings.
4. Abrir Stops → Start service, registrar leituras/produtos/foto → Complete & Next.
5. Confirmar “synced”/registro em History. “Salvo neste dispositivo” ainda não é confirmação do servidor.
6. Conferir Email pending/sent/failed. Uma falha no e-mail não deve apagar ou duplicar a visita.

O servidor tenta processar um relatório após a conclusão. O endpoint de worker processa um relatório por chamada, reduzindo tempo de execução em serverless. Para este piloto sem scheduler configurado, um gestor usa Retry report delivery em History quando necessário. Com o app fechado e sem invocações, não há promessa de retentativas automáticas contínuas; um scheduler gratuito com segredo é uma configuração operacional adicional, não provisionada aqui. A fila permanece no banco.

## Verificação antes de considerar entregue

- URL HTTPS abre no celular, login correto e outra organização não acessa os dados.
- Foto chega ao bucket privado, aparece no histórico e pode ser consultada após recarregar.
- Conclusão repetida não duplica visita/outbox.
- Destinatário autorizado confirma recebimento do e-mail e foto. Não usar só o status Sent como prova.
- Planos das três contas continuam Free, sem upgrade/compra automática configurados; cotas disponíveis conferidas.

A câmera física, a disponibilidade do site e o transporte real precisam ser testados no ambiente publicado. Os testes locais de banco/Storage e do provedor simulado não substituem essa validação.

## Estado desta preparação

- `npm run lint`, typecheck,50 testes unitários e build Next aprovados.
- 8 suítes SQL aprovadas com migrations001–013; bootstrap recusado para anon/authenticated, idempotente para service_role e sem seed de clientes.
- Criação de owner e repetição do script testadas com Auth real local; a senha original permaneceu válida.
- Auditoria npm reportou zero vulnerabilidades conhecidas na consulta realizada.
- Adapter Netlify5.16.4 executou o build Next e o empacotamento da função Node. O empacotamento Edge terminou em `fetch failed`; a configuração não foi validada de ponta a ponta no Netlify. As páginas externas de preços também retornaram bloqueio de proxy403. Não é possível deduzir a causa exata do fetch do Edge somente dessa mensagem.
- Sem acesso Netlify/Supabase hospedado e sem RESEND_API_KEY/remetente verificado no ambiente. Nenhum site foi criado ou publicado e nenhum relatório real foi enviado.
