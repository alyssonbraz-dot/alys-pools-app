# V4 — staging e confiabilidade

## Observações verificadas

| Área | Resultado | Ação externa necessária |
| --- | --- | --- |
| Staging `https://alys-v3-staging.netlify.app/app` | **BLOCKED**: CONNECT tunnel HTTP 403 neste ambiente | Liberar acesso de rede e conectar Netlify para verificar deploy, branch, logs e APIs |
| Configurações Netlify | **BLOCKED**: nenhum token/site vinculado disponível | Acesso seguro ao site de staging, sem modificar o site de produção |
| Supabase remoto | **BLOCKED**: projeto conectado e credenciais não disponíveis | Identificar o projeto de teste e fornecer acesso seguro; conferir Auth, RLS, Storage e histórico 026/027 |
| Resend remoto | **BLOCKED**: sem chave/domínio/logs acessíveis | Configurar remetente e webhook de staging; enviar somente ao destinatário autorizado |
| API GitHub / PR | **BLOCKED**: GET do PR #9 retornou Forbidden | Permissão de API para abrir o PR V4 e consultar checks/Deploy Preview; Git fetch/push funciona |
| DNS / Hostinger | Preservados | Nenhuma ação nesta entrega |
| iPhone físico | Não executado | Homologar câmera, HEIC, teclado, GPS, bloqueio e instalação PWA em aparelho |

As permissões remotas não são inferidas do sucesso local. Não se afirma que o staging carrega ou que o login/Resend remotos estão homologados.

## Configuração preparada

Mantenha [as instruções de Netlify/Cloudflare](../DEPLOY-HOSTINGER-APP-PATH.md): `ALYS_APP_BASE_PATH=/app` no build e runtime, `APP_URL` com o endereço canônico do staging e `/app`. Publicação futura em alyspools.com usa origem e redirects próprios. Não altere DNS nem a origem Hostinger nesta branch.

O worker agendado continua chamando `/app/api/email/worker` na origem Netlify. Webhook existente: `/app/api/email/webhook`. Fotos continuam privadas; signed URLs, contratos de API, controle de escopo e idempotência não foram substituídos.

## Mudanças offline

- Mesma IndexedDB `alys-field-device-v1`, versão 1, mesmos IDs, chaves, drafts e blobs.
- Novo cache de assets `alys-field-shell-app-v4` (ou `alys-field-shell-v4` no build sem prefixo); somente assets públicos são substituídos, após instalação completa.
- `scopedWorkerReady()` aguarda a ativação do registro exato retornado por `/app/sw.js`; não depende de um eventual registro mais amplo do domínio.
- Falha ou timeout da instalação permanece explícito. Não é convertido em sucesso e não limpa visitas ou fotos.
- O teste browser exige `.pwa-ready` e ausência de `.pwa-failed`, além de testar os recursos e recuperação em `/app`.
- Sync continua enquanto o aplicativo está aberto. Não se promete execução contínua após iOS suspender/encerrar o processo.
- Dados de outra origem (por exemplo, Netlify → alyspools.com) não são transportados por IndexedDB automaticamente. Sincronizar no endereço antigo antes da transição, mantendo-o disponível; não reinstalar/limpar dados para contornar uma pendência.

## Testes reais versus fixtures

`test:db` executa PostgreSQL local descartável com o harness Auth/Storage das policies. É teste SQL/RLS real, sem equivaler a login remoto.

`playwright.v4.config.ts` usa **uma aplicação Next somente de testes** em `tests/visual-app`, com os componentes de produção reais e respostas API fictícias em `tests/v4/fixtures.ts`. Nenhuma rota de demonstração foi adicionada ao aplicativo de produção. As capturas desse ambiente são evidência de layout/interação, não de credenciais, banco ou entrega de email remotos. O Dev Indicator do Next é desativado somente no harness visual.

`playwright.v4-real.config.ts` executa o build de produção `/app` contra Supabase **local completo**, com usuários e clientes fictícios: login real, cookies, Owner/Technician, isolamento entre organizações, cadastro/edição de múltiplos imóveis, JPEG/HEIC, Storage privado, interrupção após aceite do upload, perda de sessão, reabertura offline e nova tentativa após commit incerto. Confere uma única visita, leitura, dosagem e registro de relatório, preservando os dois IDs de foto. Não usa mocks de Auth/Postgres/Storage; a rede é interrompida deliberadamente em cenários de falha. Resend fica desabilitado: registro de relatório não comprova envio externo.

O Supabase CLI local inicialmente expirou nos health checks. O segundo início usou `--ignore-health-check` e excluiu serviços opcionais; Auth/Storage continuaram com indicação Docker unhealthy, embora HTTP Auth retornasse 200 e os testes reais de sessão/Storage fossem executados. Não se considera esse aviso resolvido nem se replica essa configuração em staging.

Credenciais locais ficam em arquivos ignorados e nunca no Git. Fixtures não devem ser executadas contra Supabase hospedado. Os resultados finais constam em [DELIVERY.md](DELIVERY.md).
