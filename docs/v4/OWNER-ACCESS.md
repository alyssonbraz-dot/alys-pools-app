# V4 — recuperar acesso Owner no staging

Preview informado: `https://deploy-preview-10--alys-v3-staging.netlify.app/app` (PR #10). Branch de correção: `feature/alys-v4-mobile-staging`.

## O que foi confirmado e o que está bloqueado

O Preview retorna `CONNECT tunnel failed, response 403` na rede deste ambiente. A API GitHub também retorna `Forbidden`. Não há credenciais/conector de Netlify ou Supabase hospedado disponíveis; os únicos bindings encontrados são de Supabase **localhost**. Portanto, **o project ref remoto, o registro da sua conta, o estado das policies remotas e a causa específica dessa conta não foram verificados**. Não se atribuiu o problema a uma linha de produção sem inspecioná-la.

As migrations 001–027 e o banco local foram examinados. O código anterior convertia tanto perfil ausente quanto erro SQL/RLS/coluna ausente na mesma mensagem `membership`. Assim, a mensagem observada não comprova sozinha que basta inserir um Owner.

O bootstrap inicial `bootstrap_owner` (013) somente aceita `service_role`, preserva um perfil Owner compatível, mas cria uma organização se não houver perfil. Ele não procura uma organização órfã existente. O script inicial agora recusa uma empresa de nome correspondente quando o perfil está ausente, antes de criar Auth ou chamar o bootstrap. **Não use setup-owner como tentativa de recuperação.** A recuperação abaixo nunca cria Auth users nem organizações.

## Fluxo e schema reais

- Login por senha: `src/app/actions.ts` chama `auth.signInWithPassword`; sessão é verificada por `auth.getUser()` no servidor. Cookies continuam limitados a `/app`. O login não cria perfil/empresa e não usa `user_metadata` para autorizar.
- Vínculo: `public.profiles.id` é PK e FK para `auth.users.id`; `organization_id` é obrigatório e referencia `public.organizations.id`. Há **um perfil por Auth UUID**. Não existe tabela `memberships` neste modelo.
- `profiles.role`: `owner`, `admin`, `technician` ou `customer`. Aplicativo operacional permite os três primeiros somente com `access_state='active'`. Estados (016): `invited`, `active`, `suspended`, `inactive`.
- Policy `own_profile` (001): sessão autenticada lê `id=auth.uid()`. Não há INSERT/UPDATE de perfil concedido ao browser. `manager_profiles` amplia leitura de gerente dentro da mesma organização; `is_owner` exige Owner ativo, `is_manager` exige Owner/admin ativo. Policies restritivas exigem operador ativo nas tabelas de operação.
- Convite pendente deve seguir `accept_team_invitation`; recuperação não ativa convidados nem promove technician/admin/customer. A proteção do último Owner (021), auditoria e policies existentes permanecem.
- `getOperatorAccess()` distingue `membership`, `inactive`, `accesscheck`, `signin` e `setup`. `getOperator()` continua retornando null e APIs continuam negando acesso se qualquer verificação falhar. Uma policy que simplesmente oculta a linha ainda exige a inspeção administrativa abaixo para distingui-la de perfil realmente inexistente.

## 1. Identificar o projeto conectado ao Preview #10

No painel Netlify do site **alys-v3-staging**, abra o deploy do PR #10 e confira commit/branch. Em **Project configuration → Environment variables**, confira os valores efetivos de **Deploy Previews**, incluindo overrides por branch/deploy. Não basta olhar apenas o contexto Production ou o arquivo `.env.local` do computador.

| Variável | Conferência |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Fonte da identidade do projeto. No endereço padrão `https://PROJECT_REF.supabase.co`, copie apenas `PROJECT_REF`; no painel Supabase abra exatamente esse projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública/anon do mesmo projeto, presente no build e runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave server-only do mesmo projeto, nunca em variável `NEXT_PUBLIC_*`, HTML ou Git |
| `ALYS_APP_BASE_PATH` | `/app`, build e runtime |
| `APP_URL` | URL canônica do ambiente de teste com `/app`; afeta links/redirects, não atribui papéis |

Em Supabase → Project Settings, confronte Project URL/ref com o valor Netlify. Confira no deploy o **valor usado no build**: `NEXT_PUBLIC_*` é incorporado nos assets; uma alteração só em runtime pode deixar bindings inconsistentes. Alterações de variáveis públicas exigem novo build do Preview, sem publicar produção. Não envie chaves nem cookies no chat. No navegador, o nome padrão do cookie `sb-<ref>-auth-token` pode ajudar na conferência; nunca copie seu conteúdo.

**Se o Preview usa o banco de produção, pare.** Deploy Preview não isola banco automaticamente. Não execute o recovery, seeds ou testes de escrita ali. Primeiro separe/identifique o Supabase de staging autorizado. Uma confirmação textual no SQL é uma conferência humana, não um detector automático de produção.

## 2. Inspeção somente leitura no Supabase correto

No SQL Editor **do projeto de staging verificado**, abra [inspect-owner-access.sql](../../scripts/sql/inspect-owner-access.sql), substitua `REPLACE_WITH_EXACT_LOGIN_EMAIL` pelo e-mail exato do login e execute o arquivo inteiro. Ele retorna Auth UUID, perfil/estado/função, organização, organizações existentes, colunas, RLS/policies, funções e convites pertinentes. Não consulta clientes ou fotos e não altera dados de negócio. Trate o resultado como informação administrativa privada.

Se houver histórico de migrations, confira separadamente:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

O schema esperado está nas migrations 001–027, em particular 001 (vínculo/RLS), 013 (provisionamento inicial), 016 (estados), 021 (Owner/convites), 026/027 (financeiro/ponte). Se faltar tabela/coluna/policy, investigue o histórico antes de atribuir Owner. Não aplique todas as migrations cegamente nem substitua uma 026 pelo outro histórico.

| Resultado | Ação segura |
| --- | --- |
| Nenhum Auth user com esse e-mail | Verifique projeto e identidade usados no login. Não crie outro usuário nem copie usuários de produção automaticamente |
| Auth existente, perfil ausente, organização existente comprovada e administrador autorizado | Recovery com UUIDs exatos, abaixo |
| Owner ativo na organização correta | Não alterar papel. Verificar erro de consulta, grants/policy `own_profile`, migrations, build/runtime e sessão/projeto |
| Owner inactive/suspended | Conferir motivo/autoridade; recovery exige o estado anterior exato e registra a aprovação |
| Owner invited ou convite prepared/sent/failed | Concluir/revisar o convite existente; recovery não o contorna |
| Technician/admin/customer ou organização diferente | Não promover/mover automaticamente. Conferir conta correta e autorização/convite com administrador |
| Organização não encontrada ou nome ambíguo | Parar. Selecionar UUID comprovado, nunca a primeira organização ou apenas correspondência por nome |

## 3. Recuperação administrativa, idempotente e transacional

Depois de confirmar autoridade administrativa e staging separado, abra [recover-staging-owner.sql](../../scripts/sql/recover-staging-owner.sql). O arquivo só executa como `postgres`/`supabase_admin` e não instala função/RPC/migration.

Preencha o JSON no início:

- `confirmation`: `I_VERIFIED_SEPARATE_STAGING_AND_ADMIN_AUTHORITY`.
- `user_id` + `email`: Auth UUID e e-mail existentes, conferidos juntos.
- `organization_id` + `organization_name`: UUID e nome exato da organização existente, conferidos juntos.
- `expected_role` / `expected_access_state`: `missing` / `missing` para perfil comprovadamente ausente; ou `owner` / `inactive` (ou `suspended`) para reativação previamente autorizada. Owner já ativo é no-op.
- `display_name`: nome para perfil ausente; nome de perfil existente é preservado.
- `reason`: referência da aprovação/incidente (8–500 caracteres); aparece na auditoria privada.

Execute **o arquivo completo em uma única execução/sessão** no SQL Editor. Não rode o JSON e o bloco DO em abas diferentes. O primeiro ensaio termina em **ROLLBACK**: confira o resultado da SELECT final. Nenhuma alteração desse ensaio persiste. Para aplicar em staging após conferir o ensaio, execute novamente o mesmo arquivo trocando somente o `rollback;` final por `commit;`.

O bloco usa o mesmo lock por usuário do bootstrap; bloqueia perfil/identidades, não reatribui tenant, não promove outros papéis e não passa por convites pendentes. Inserção/reativação e auditoria são atômicas. Repetição bem-sucedida não duplica perfil, empresa ou auditoria. Auth UUID, senha, cookies e dados operacionais não são alterados. Qualquer erro exige `ROLLBACK` antes de nova tentativa; não continue um transaction abortado. Não desabilite RLS nem use um UPDATE geral de roles.

## 4. Verificar acesso sem apagar pendências locais

Na mesma origem do Preview, abra novamente `/app/` com a sessão existente; a função vem do banco a cada verificação, sem inserir Owner no JWT. Se a sessão venceu, faça login com o mesmo usuário/senha. Não limpe Safari/IndexedDB, reinstale PWA nem confirme saída que remove rascunhos para resolver este problema.

Confira `/app/`, `/app/route`, `/app/customers`, `/app/team` e `/app/finance`. Home/Route/Customers devem abrir; Team e Finance ficam em More. Acesso de Technician e de outra organização deve continuar negado ao financeiro/equipe. Depois, confira `/app/api/session` no navegador autenticado: mesmo `userId`, organização correta, `role: owner`. Não publique cookies/token nem faça teste de envio externo para validar essa recuperação.

## Validação desta correção

Executada apenas localmente, com dados fictícios:

| Validação | Resultado |
| --- | --- |
| Lint / TypeScript | Passaram |
| Unitários | 222 testes em 35 arquivos passaram |
| PostgreSQL/RLS | Passou nos dois históricos 026/027, incluindo o bloco original de recovery e bootstrap inicial |
| Inspeção somente leitura | Arquivo SQL completo passou no Supabase local, com Auth/Postgres reais |
| Build de produção `/app` | Passou |
| Browser com Supabase local completo | 3 passaram: recuperação + cinco telas Owner + suspensão/reativação; Owner autorizado; Technician de outro tenant bloqueado |
| Preview #10 / projeto Supabase remoto / usuário real | BLOCKED por rede e ausência de acesso administrativo remoto |

Comandos:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
ALYS_TEST_V1_BRIDGE=1 npm run test:db
ALYS_APP_BASE_PATH=/app npm run build
# Exige o Supabase local e fixture de integração descritos no README, nunca um projeto hospedado:
npx playwright test --config playwright.owner-access.config.ts
```

O teste SQL executa o bloco administrativo original (extraído do runbook) dentro do PostgreSQL descartável. Cobre privilégio de administrador, usuário/organização/e-mail exatos, idempotência, auditoria, estados, convites e isolamento RLS. O teste browser local cria uma única identidade fictícia sem perfil, confirma bloqueio, recusa duplicação pelo setup inicial, recupera para a organização já existente, repete sem duplicar e verifica as cinco telas, suspensão/reativação e a mesma senha.

**Não houve alteração de dados remotos nem homologação do usuário real.** O administrador precisa retornar apenas o diagnóstico não secreto (project ref, presença do perfil, role/access_state e erro SQL/código, se houver) para confirmar a causa específica, sem enviar chaves, senhas ou dados de clientes.
