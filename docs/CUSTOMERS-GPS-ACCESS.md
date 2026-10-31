# Clientes, GPS e acesso dos técnicos

Branch de revisão: `fix/customer-gps-team-credentials`, baseada no patch V2.2.1 `504656c`. Não houve deploy, merge ou alteração do banco remoto. A versão do aplicativo continua 2.2.1, com schema 025.

## Organização das telas

Imóveis, endereços, piscinas, spas e coordenadas ficam no perfil do cliente, em **Properties & Pools**. Essa seção é interna ao cliente. `/pools` e `/locations` passam a redirecionar para `/customers`, preservando favoritos sem manter formulários paralelos. O menu More não tem mais Locations.

O indicador Missing coordinates no Dashboard abre `/customers?locations=missing`. O filtro considera latitude/longitude ausentes e coordenadas ainda não confirmadas. É possível remover o filtro no controle Only properties missing coordinates. Nenhum imóvel ou piscina é apagado ou desvinculado.

## GPS e navegação

- No cadastro do imóvel, **Use current GPS location** solicita uma posição do navegador. A precisão em metros aparece quando disponível. Use este controle estando no endereço do cliente: ele não deduz o endereço digitado.
- A captura não salva o cadastro nem confirma o local. Confira o pino, ajuste latitude/longitude se necessário, marque a confirmação e salve o cliente.
- Negar permissão, indisponibilidade ou timeout produzem mensagens específicas em EN/PT/ES. Os campos já preenchidos permanecem intactos.
- No planejamento da rota do administrador, o mesmo controle preenche a origem; **Save starting location** é necessário para persistir. A autorização existente no servidor/RLS permite ao técnico alterar apenas a própria rota. A tela rápida do técnico mantém o planejamento fora do fluxo de atendimento.
- Navegar na piscina atual, na lista de stops e no mapa usa as coordenadas confirmadas. Sem confirmação ou com coordenadas inválidas, usa o endereço. Google Maps e Apple Maps mantêm os links existentes.
- A captura é pontual, com precisão alta solicitada e timeout de 15 segundos. Não existe rastreamento contínuo, monitoramento em segundo plano ou salvamento automático da posição.
- Em produção, o navegador exige HTTPS e permissão de localização. Não há chave ou dependência paga para obter GPS. Geocodificar texto e calcular trajetos continuam usando os provedores opcionais já configurados; capturar GPS não ativa esses serviços.

## Administração das credenciais

O administrador com função **Owner** pode consultar o e-mail de login e definir um novo e-mail/senha de um técnico da mesma organização que já aceitou o convite. O controle fica em Team & Technicians → técnico → Manage technician login.

A senha atual do técnico não é exibida: o Supabase guarda uma representação não recuperável. O administrador escolhe a nova senha, com pelo menos 16 caracteres, confirma-a e informa sua própria senha. Pode alterar somente o e-mail, somente a senha ou ambos. A ação não cria convites nem envia relatórios pelo Resend.

O endpoint `POST /api/team/credentials`:

1. Exige origem válida e uma sessão Owner ativa; não aceita Technician ou o papel legado `admin`.
2. Valida UUID, e-mail, tamanho da senha e limite de corpo; rejeita campos extras como função/organização.
3. Localiza o técnico com a sessão RLS do Owner e o identificador da organização.
4. Confirma a senha do Owner em um cliente Auth separado, sem persistir sessão/cookies, e encerra essa sessão temporária.
5. Revalida Owner ativo e o destino antes da operação privilegiada.
6. Usa a chave service role exclusivamente no servidor para atualizar o usuário Auth. Não altera função, organização ou status do técnico.
7. Registra REQUESTED e UPDATED/FAILED no audit_log existente, com ator, destino e indicadores booleanos. Não registra senha, hash, tokens ou e-mail submetido. Falha no registro inicial impede a alteração; falha na confirmação de auditoria após sucesso é comunicada explicitamente.

O Owner continua conectado. Não há endpoint de leitura de senha. Se a intenção for bloquear um técnico imediatamente, use **Suspend Access**; redefinir credenciais não garante o encerramento imediato de um JWT já emitido. Convites e seus tokens permanecem no fluxo existente, sem reaproveitar contas convidadas ainda não aceitas.

## Configuração e validação

Use as instruções do README e de LOCAL-DEVELOPMENT.md. Não há nova variável de ambiente, migration, bucket ou dependência. A chave server-side SUPABASE_SERVICE_ROLE_KEY já faz parte da configuração de equipe/fotos existente. Não execute seed ou reset em produção.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Com Supabase local, fixtures fictícias preparadas conforme LOCAL-DEVELOPMENT.md e o servidor de teste em 3006:

```bash
TEST_BASE_URL=http://127.0.0.1:3006 npx --no-install playwright test \
  v221-customer-access-gps.spec.ts v221-recovery.spec.ts \
  v211-localization.spec.ts \
  --project=mobile-chromium --project=android-chromium \
  --project=desktop-chromium --output=/tmp/alys-customer-gps-results
```

As fixtures usam apenas Supabase local. E-mail de relatórios e convites permanecem desativados nos testes. Coordenadas são simuladas pelo navegador; isso valida captura, formulário, confirmação e persistência, sem alegar teste com o receptor GPS de um aparelho físico. O aceite de permissão/GPS no Safari de um iPhone real continua pendente.

As migrations 001–025, permissões existentes de fotos/visitas/relatórios e a fila IndexedDB permanecem intactas. Os testes de recuperação incluem JPEG/HEIC, suspensão, perda de sessão, resposta de conclusão perdida e reenvio sem duplicação.

## Resultados executados

- Lint, typecheck e build de produção: aprovados.
- Unitários: **139 testes em 25 arquivos**, incluindo destinos confirmados, coordenadas inválidas, erros GPS traduzidos e validação de credenciais.
- Banco: **15 suítes SQL**, em PostgreSQL descartável local, aprovadas; nenhuma migration foi modificada.
- Regressão ampla: **19 testes Playwright** aprovados, com EN/PT/ES em Chromium mobile/Android/desktop e recuperação de visitas/fotos JPEG/HEIC no Supabase local.
- Após os últimos ajustes no filtro de coordenadas e no texto de GPS da origem: **8 testes afetados** aprovados novamente, em Chromium mobile e Android. Incluem confirmação de GPS antes de salvar, preservação dos campos após negar permissão, redefinição real de credenciais fictícias, sessão Owner preservada, rejeição de outra organização/Owner/Technician/origem inválida e ausência de senhas na resposta/auditoria.
- São **21 cenários de integração distintos** cobertos nessas execuções; os oito finais incluem seis repetições e dois cenários adicionais da origem GPS. Não foi uma única execução de 27 cenários distintos.
- A prévia local em `http://localhost:3000/login` respondeu HTTP 200, com entrega de e-mails e convites desativada.

A validação final dos testes afetados usou:

```bash
TEST_BASE_URL=http://127.0.0.1:3006 npx --no-install playwright test \
  v221-customer-access-gps.spec.ts \
  --project=mobile-chromium --project=android-chromium \
  --output=/tmp/alys-customer-gps-final-affected-results
```

Nenhum envio real de e-mail, alteração de DNS, publicação, migration remota ou teste de GPS físico foi realizado.
