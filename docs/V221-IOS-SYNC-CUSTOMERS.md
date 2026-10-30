# V2.2.1 — fotos recuperáveis e navegação centrada no cliente

Base: `main` **05d7c63**, com V2.2 e migrations 001–025. Branch: `fix/alys-v2-2-1-ios-sync-customers`. Não houve merge, deploy, envio real de email ou aplicação de migrations remotas nesta entrega.

## Diagnóstico: o que foi confirmado

**A causa específica no iPhone de produção permanece sem confirmação física.** Não foram fornecidos logs da falha do aparelho. WebKit não pôde ser instalado: os mirrors Playwright responderam HTTP 403 `Domain forbidden`. A inspeção pública de `alyspools.com/login` e `/sw.js` também foi bloqueada pelo túnel HTTP da cloud; isso não é um diagnóstico de indisponibilidade do site.

Foi reproduzido um defeito concreto no transporte usado pelo app: um evento XHR `load` com status **0** fazia `new Response(..., {status:0})` lançar `RangeError` fora da Promise. A Promise permanecia pendente e podia prender o processamento compartilhado da fila. O teste falhou na V2.2 e passou com a correção. Não se afirma que esse foi o evento ocorrido no aparelho do usuário.

Comparação Git de V2.1.2 (`37a0a5e`) com a main V2.2: **sem diferenças** em `offline/store.ts`, `offline/upload.ts`, `field/photos.ts` e `api/photos/route.ts`. O redesenho mudou componentes e navegação, mas não há evidência para atribuir a falha exclusivamente a uma alteração do conversor ou do servidor de fotos.

Outras lacunas corrigidas e testadas:

- Conexão IndexedDB fechada pelo navegador ficava reutilizada em memória. Agora o app reabre a conexão antes de iniciar uma transação. Não repete uma transação cujo commit seja incerto, nem insere `await` entre criação da transação e seu primeiro request.
- Falha na verificação de sessão podia deixar somente `Pending Sync`, sem motivo persistido na visita. Agora aparecem falha de conexão ou `Sign in to sync`, com link para entrar novamente.
- Não havia retomada explícita em `pageshow`, foco e retorno à visibilidade. O fluxo pausa requisições ao sair, retoma em primeiro plano e revalida a sessão antes de enviar bytes.
- O URL de decodificação era revogado antes de `drawImage`/`toBlob`. Agora permanece vivo durante a conversão e é liberado no final, inclusive em falha. Essa mudança protege o ciclo de vida da imagem; não comprova um defeito específico do decodificador nativo do Safari.
- Um `upload_blob` existente era reutilizado sem revalidar MIME, tamanho ou assinatura JPEG. Agora caches sem MIME, grandes demais ou com HEIC marcado como JPEG são reconstruídos do original preservado; rejeições de foto 400/413 também permitem reconstrução, com o mesmo ID. O multipart declara JPEG explicitamente após preparo.
- Uma resposta JSON de sucesso sem confirmação válida podia avançar indevidamente. Agora o caminho da foto deve corresponder a organização/stop/photo ID, e o `visit_id` deve ser o ID da visita local, antes da limpeza local.

## Pipeline e preservação

| Etapa | Comportamento V2.2.1 |
| --- | --- |
| Câmera / galeria | Entradas separadas: câmera traseira preferida e galeria sem `capture`. A seleção só é limpa após o processamento. |
| Persistência inicial | Materializa os bytes do arquivo da câmera em Blob antes de gravar. `Saved locally` depende do commit no IndexedDB. |
| Conversão | Decodificador nativo primeiro; fallback local `heic-to/csp` para HEIC/HEIF. JPEG até 1600 px e 2 MB; originais salvos ficam preservados. |
| Conclusão | Grava a visita local, enfileira e abre o próximo stop sem aguardar upload/email. |
| Upload | Mesmo bucket privado, mesmo MIME `image/jpeg`, mesmo caminho determinístico e checagens server-side/RLS. 100% de bytes não significa visita sincronizada. |
| Confirmação | Caminho do upload e ID da visita verificados. `Synced` somente após confirmação do servidor. |
| Recuperação | Falhas ficam na fila, com motivo, etapa e Retry. Sessão perdida pausa uploads até autenticar novamente. |
| Histórico / relatório | Mantidos fotos privadas, URLs assinadas e outbox único da visita. Relatório continua assíncrono. |

O IndexedDB permanece **`alys-field-device-v1`, versão 1, store `records`**. As chaves e os formatos de rascunho/fila não são substituídos. `File` antigo continua aceito como Blob; registros V2.1.2 com apenas `blob`, sem `upload_blob`, continuam recuperáveis. Não há migração local destrutiva, reset da fila ou exclusão automática durante upgrades.

O service worker usa um novo cache **público** `alys-field-shell-v221`, concluindo o aquecimento antes de remover caches públicos obsoletos. Ele não limpa o IndexedDB, não armazena respostas de `/api/` e conserva fallback do shell anterior se a instalação nova falhar. Atualização não exige remover a PWA nem limpar Safari.

Retries preservam IDs da visita/foto, leituras, químicos, checklist, vínculos piscina/foto e horários. Uma substituição intencional de imagem continua criando uma nova revisão de armazenamento, mantendo a imagem antiga no registro local de substituições até a confirmação; não reutiliza uma chave imutável para bytes diferentes. Uma confirmação incerta de visita permanece somente leitura e deve ser repetida com o mesmo payload.

Prazos: requisições de sessão/visita 20 s; XHR 60 s com watchdog de 65 s; abertura do IndexedDB 15 s; decodificação nativa/encodificação 20 s por etapa. Falhas mantêm o trabalho pendente. Não há promessa de execução enquanto o iOS suspende o processo: mantenha ou reabra a rota/atendimento para sincronizar.

Limites existentes: três fotos por visita, origem até 25 MB, saída JPEG até 2 MB. Não houve aumento dos limites de servidor nem dependência paga nova.

## Clientes: antes e depois

| Antes | Depois |
| --- | --- |
| Atalhos independentes para Properties & pools no menu e na lista | Customers como entrada principal. Imóveis/piscinas dentro do perfil. `/pools` permanece compatível com links antigos. |
| Lista focada em contato | Nome clicável, imóvel de referência, contagem de imóveis/piscinas/spas, dias, técnicos, contrato e MRR próprio autorizado. Busca imediata; filtros avançados recolhíveis. |
| Perfil longo com todos os módulos juntos | **Overview / Properties & Pools / Service / History**. Histórico e ledger são carregados na seção pertinente. |
| Editar conjunto sem foco no item escolhido | Add/Edit property, Add pool, Add spa e Edit water body abrem o editor do cliente no item escolhido; ao salvar, retornam à seção. |
| Cadastro integrado existente | Mesmo `save_customer_bundle`, transação/rollback e proteção de agendas durante visitas em progresso preservados. |

Contratos existentes podem ser consultados e editados na seção Service. Imóveis contêm piscinas/spas, equipamentos e instruções; Service reúne agendas/atribuições; History inclui visitas, químicos, fotos e relatórios do cliente. Nenhum relacionamento ou registro foi excluído.

O imóvel de referência da lista é o mais antigo, com desempate estável por ID; não foi criada uma preferência nova de imóvel principal no banco. A contagem inclui os corpos d'água cadastrados, cujos estados continuam visíveis no perfil. Dias e técnicos vêm das agendas vigentes, não apenas de metadados do contato.

MRR próprio segue a elegibilidade de `owner_overview`: cliente ativo, contrato próprio mensal ativo e agenda ativa vigente no fuso do imóvel. Conta cada contrato uma vez, independentemente da quantidade de piscinas. Subcontratos não são somados ao MRR. A API inclui `own_mrr_cents` somente para Owner. Receita não é lucro nem caixa recebido. O campo histórico do CSV de cadastro não foi reclassificado como MRR.

## Evidências e testes

Baseline da main: lint/typecheck, 119 testes unitários e 15 suítes SQL aprovados. Nenhuma migration 001–025 foi modificada.

Os testes novos de recuperação usam **Auth/PostgREST/Storage locais reais**, com dados fictícios e envio externo desligado. O roteiro:

1. Captura JPEG sem MIME informado pelo seletor e seleciona HEIC pela galeria, conferindo bytes originais persistidos e JPEG preparado.
2. Retém a resposta após o servidor aceitar a primeira foto, conclui localmente e abre o próximo stop.
3. Simula suspensão, fecha a aba e reabre offline, sem apagar fila ou fotos.
4. Remove cookies para provocar falta real de autenticação no backend local; confere `Sign in to sync` antes de novos uploads.
5. Restaura a sessão, simula HTTP 503 numa foto e repete explicitamente.
6. Perde a resposta de uma conclusão já commitada, repete com o mesmo ID/payload e verifica **uma visita, uma leitura, um químico e um relatório na fila**.
7. Confere **duas fotos e dois vínculos de corpo d'água**, dois arquivos privados no Storage, JPEGs recuperáveis por URL assinada e exibição no Histórico.

O teste de clientes cria duas propriedades/três corpos d'água pela interface, acrescenta spa e imóvel dentro do perfil, preserva os IDs existentes e confere MRR da lista contra o RPC do dashboard. Navegação e limites do viewport são verificados em **320, 375, 390, 430, 768 e 1024 px**, com abas traduzidas em EN/PT/ES. Os testes legados conservam cenários JPEG grande, HEIC/HEIF inválido, fila V2.1.2, substituição e retries sem duplicação. A composição de relatório com múltiplos anexos também é testada sem enviar email real.

Validação realizada:

| Verificação | Resultado |
| --- | --- |
| Lint | Sem erros/avisos |
| Typecheck | Aprovado |
| Unitários | **134 testes**, 23 arquivos |
| SQL | **15 suítes**, com as mesmas migrations 001–025 preservadas |
| Suíte completa de integração | **59 aprovados**, sem retry; mobile Chromium, Android Chromium e desktop |
| Regressão final de cache/fotos | **22 aprovados** no build final, incluindo seis casos novos de cache preparado nos dois perfis mobile |
| Build de produção | Aprovado |
| WebKit / iPhone físico | Não executados; download do WebKit bloqueado pela rede |

Depois da validação completa, a verificação de cache preparado foi ampliada. A regressão dirigida final reexecutou todos os formatos V2.1.2, a recuperação V2.2.1 e o fluxo de clientes no build final: **65 cenários distintos cobertos** (59 da suíte completa + seis casos novos; os outros 16 dos 22 retestes não contam novamente). Nenhum desses comandos usou retries do runner.

Comandos de integração executados, com `TEST_BASE_URL=http://127.0.0.1:3006` e o backend local configurado no guia:

```bash
node tests/integration/setup.mjs
node tests/integration/backend.mjs
npx --no-install playwright test
# Após ampliar a proteção do cache, no build final:
npx --no-install playwright test v212-mobile.spec.ts v221-recovery.spec.ts \
  v221-cached-photos.spec.ts --project=mobile-chromium --project=android-chromium
```

A regressão adicional semeia filas anteriores com `upload_blob` sem MIME, JPEG acima de 2 MB ou HEIC marcado como JPEG. Confere reconstrução em JPEG aceito pelo servidor, preservação dos bytes originais enquanto o upload está pendente, ID estável e replay sem visita/relatório duplicados. Forçar falta de cookies/suspensão por eventos é simulação controlada; não equivale a expiração temporal natural nem a encerramento do processo pelo iOS físico.

### Capturas

| Tela | Antes V2.2 | V2.2.1 |
| --- | --- | --- |
| Lista | [Antes](screenshots/v221/before-customers.png) | [Depois](screenshots/v221/after-customers.png) |
| Perfil | [Antes](screenshots/v221/before-profile.png) | [Visão geral](screenshots/v221/after-customer-overview.png) |
| Imóveis e piscinas | — | [Depois](screenshots/v221/after-customer-properties.png) |
| Serviço | — | [Depois](screenshots/v221/after-customer-service.png) |
| Histórico do cliente | — | [Depois](screenshots/v221/after-customer-history.png) |
| Recuperação | — | [Sessão requerida](screenshots/v221/sync-auth-required.png) · [Foto com falha](screenshots/v221/sync-failed-photo.png) · [Histórico confirmado](screenshots/v221/sync-confirmed-history.png) |

Todos os dados das capturas são fictícios. [Lista de arquivos](V221-FILES.md).

## Publicação segura — após aprovação

1. Revisar branch, código, testes e capturas. Fazer backup do banco hospedado e preservar dados de Safari/PWA com trabalho pendente.
2. Confirmar V2.2/schema 25 no ambiente existente. **Esta entrega não tem migration nova.** Se houver migrations antigas pendentes, revisar/aplicar somente com autorização específica; não usar `db reset` nem fixtures no servidor hospedado.
3. Usar `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`. Para a matriz local, seguir [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md), com fixtures novas e Auth/Storage locais; resultados/screenhots do runner ficam no diretório de saída Playwright.
4. Somente após autorização, aprovar merge/deploy no Netlify existente. Manter Netlify Free, Supabase Free, Resend Free e DNS Hostinger descritos no [README](../README.md); nenhum ajuste de infraestrutura é necessário para o patch.
5. Abrir o app conectado e conferir versão 2.2.1 em System Health. Deixar o shell offline atualizar. Reabrir normalmente para carregar o app novo; não apagar dados, não desinstalar a PWA e não encerrar uma captura antes de `Saved locally`.
6. Em rollback do frontend, preservar banco e IndexedDB. Não reverter/deletar fotos, visitas ou tabelas para resolver uma pendência local.

## Aceite obrigatório no iPhone físico

- Safari e PWA Home Screen, nos três idiomas: câmera JPEG/HEIC, galeria HEIC/HEIF e JPEG acima de 2 MB; verificar legibilidade da foto no relatório.
- Capturar duas/três fotos offline, confirmar `Saved locally`, concluir e avançar. Fechar/reabrir a PWA e verificar os mesmos rascunhos, leituras, químicos e horários.
- Alternar para outro app/bloquear o aparelho durante upload. Voltar e observar retomada/Retry; não deve aparecer Synced antecipadamente.
- Deixar a sessão expirar offline, reconectar e autenticar pela ação **Sign in**, na conta original, sem usar limpeza de dados/Sign out com pendências.
- Simular rede instável, pressionar Retry repetidamente e conferir uma visita, fotos corretas e um único relatório na fila. Envio real somente após autorização e para destinatário de teste controlado.
- Abrir Histórico, conferir todas as fotos do servidor; uma prévia local não comprova upload. Confirmar a etapa/mensagem de qualquer falha sem compartilhar cookies, tokens, códigos de acesso ou dados reais.
- Customers → perfil → imóveis/piscinas → edição → salvar: conferir todos os imóveis/spas, dias, técnicos e contratos, sem overflow ou destinos administrativos para Technician.

A confirmação física ainda é necessária para fechar a causa observada em produção; a cloud comprova os cenários automatizados de recuperação, não o comportamento do hardware/câmera/suspensão do iOS.
