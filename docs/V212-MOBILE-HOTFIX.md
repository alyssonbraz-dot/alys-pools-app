# V2.1.2 — recuperação de fotos e interface mobile

Base: `main` `eaab8e7` (V2.1.1). Branch: `fix/alys-v2-1-2-mobile-hotfix`. Nenhuma migration nova; manter 001–024. Nenhum reset, migration remota, merge ou deploy foi executado.

## Diagnóstico e alterações

O erro observado é compatível com uma foto cujo conteúdo/MIME não é JPEG ou excede o limite. A fila antiga enviava o Blob diretamente, embora o nome terminasse em `.jpg`. Mudar a extensão não converte a imagem. Não foi acessado o IndexedDB do iPhone de produção, então a causa exata daquele arquivo não foi verificada.

- Antes do upload, registros antigos sem `upload_blob` passam pela mesma conversão dos novos registros. O Blob original permanece em `blob`. A cópia JPEG preparada é persistida antes do envio.
- O navegador tenta decodificação nativa; HEIC/HEIF sem suporte nativo usa `heic-to@1.6.7/csp` (libheif). A importação é sob demanda, empacotada no site. Nenhuma foto é enviada a um conversor externo. A política permite workers locais `blob:`, mantendo `script-src` com nonce e sem `unsafe-eval` em produção.
- Redimensionamento até 1600 px no maior lado, fundo branco, JPEG inicialmente em qualidade 85%, com redução progressiva de qualidade e dimensões se necessário. O upload continua limitado a **2 MiB** e o servidor continua validando/reprocessando JPEG. Fontes maiores que 25 MiB são rejeitadas sem apagar o registro.
- Novas capturas salvam primeiro o original no aparelho. Uma falha de conversão mantém a foto e apresenta erro traduzido, sem simular uma prévia bem-sucedida.
- Troca de foto em visita pendente/falha é serializada com a sincronização via Web Locks. Navegadores antigos sem Web Locks recebem uma instrução para atualizar, preservando o registro; não há uma substituição sem proteção entre abas. Mantém ID da visita, horários, leituras, químicos, checklist, associação à piscina e notas. Usa novo ID somente para a foto, preserva os bytes anteriores em `replaced_photos` e só altera referências fotográficas da submissão.
- A substituição é bloqueada quando uma conclusão pode ter sido aceita pelo servidor. Nesse caso, repetir a submissão original recupera a confirmação. Falhas antigas 400/413 reconhecidas como rejeição fotográfica são recuperáveis; respostas antigas ambíguas permanecem imutáveis. Uma rejeição explícita 422 permite a correção já existente.
- Banco IndexedDB **`alys-field-device-v1`**, versão **1**, chaves e object store preservados. Novos campos são opcionais. Não há limpeza automática da fila nem migração destrutiva.
- Uma notificação concentra total pendente, cliente/visita, erro exato, progresso real, retry e troca da foto quando aplicável. Nomes podem ser recuperados de rotas anteriores em cache.
- Cinco abas do proprietário usam colunas iguais, rótulos traduzidos com quebra de linha e “Ajustes” como rótulo curto de Configurações em PT/ES (nome acessível completo preservado), ícones alinhados e área segura do iPhone. Técnicos mantêm as três abas autorizadas. Calendário diário usa controles de 44 px e conserva a data na volta da visita.

## Recuperar a visita no iPhone após a atualização aprovada

1. **Não limpe os dados do site, não saia da conta e não desinstale o app enquanto houver pendências.** O logout existente continua sendo uma ação explícita que limpa dados locais após aviso.
2. Abra o app online, na mesma conta e no mesmo iPhone que contém a visita.
3. Abra Stops e toque em **Retry sync / Tentar sincronizar**. A fila antiga será convertida sem recriar a visita.
4. Se a imagem estiver corrompida/incompatível, leia o erro e use **Replace photo / Trocar foto**, selecione a nova imagem e tente sincronizar novamente. Não é necessário digitar leituras novamente.
5. Somente **Synced** confirma o registro no servidor. Confirme a visita no histórico; entrega do e-mail tem estado separado.

A primeira conversão HEIC que exigir libheif precisa carregar o módulo do site. Sem conexão e sem o módulo previamente carregado, a conversão pode falhar temporariamente: o original permanece salvo para retry online. Cotas de armazenamento do aparelho continuam se aplicando; não se promete persistência contra exclusão manual pelo usuário/navegador.

## Validação local

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
# Com Supabase local configurado conforme LOCAL-DEVELOPMENT.md:
node tests/integration/setup.mjs
node tests/integration/backend.mjs
# Terminal separado:
node tests/integration/routing-stub.mjs
# Terminal separado, depois do build:
ROUTING_API_URL=http://127.0.0.1:8131 GEOCODING_API_URL=http://127.0.0.1:8131/search APP_URL=http://127.0.0.1:3004 APP_ENV=test EMAIL_DELIVERY_ENABLED=false TEAM_INVITES_ENABLED=false npm run start -- --port 3004
# Testes (somente dados fictícios locais):
TEST_BASE_URL=http://127.0.0.1:3004 npx --no-install playwright test
```

`v212-mobile.spec.ts` grava diretamente registros com formato V2.1.1 no IndexedDB, sem campos novos. Testa JPEG pequeno, JPEG real acima de 2 MiB, HEIC/HEIF HEVC sintético, imagem corrompida, substituição, perda de confirmação depois de uma gravação real, repetição idempotente e contagem de visitas/leituras/relatórios. Também mede os limites dos cinco rótulos em EN/PT/ES, larguras 320/375/390/430 px e retorno da visita mantendo a data.

`offline.test.ts` verifica adicionalmente preservação dos bytes originais, horários, associação à piscina, bloqueio de substituição após confirmação incerta e isolamento entre contas. `photo-security.test.ts` verifica CSP e mensagens traduzidas.

Resultados executados:

| Verificação | Resultado |
| --- | --- |
| Lint / TypeScript | Aprovados |
| Unitários | **116 testes em 19 arquivos aprovados** |
| Build de produção | Aprovado |
| Auth / PostgREST / Storage locais reais | Aprovados, com envio externo desativado |
| Integração completa | **47 testes aprovados**: 30 em viewport iPhone/Chromium, 14 Android/Chromium, 3 desktop |
| Ajuste final do rótulo curto de configurações | **6 revalidações mobile aprovadas**, incluindo cinco abas em EN/PT/ES, formulários e barra de conclusão |
| Catálogos EN/PT/ES | **1.087 chaves por idioma**, com parâmetros e cobertura verificados |

O fluxo Complete & Next abriu o stop seguinte em 155 ms no teste local com upload retido; esse número não é uma medição de desempenho em aparelho físico. Testes de navegador usam Chromium emulado; não substituem um iPhone físico/Safari nem garantem todos os perfis HDR/HEIC de todas as câmeras. O arquivo específico da falha de produção não foi fornecido/acessado. Nenhum e-mail real foi enviado.

## Publicação posterior, somente com aprovação

Não é necessário `supabase db push` para V2.1.2 em uma instalação V2.1.1 com schema 24. Revise o diff e os resultados, aprove o merge desta branch e só então acompanhe o deploy Netlify. Não execute seeds ou fixtures no projeto hospedado. Preserve as variáveis existentes; nenhuma integração paga foi adicionada.

As instruções de Netlify Free, Supabase Free, Resend Free e DNS Hostinger de `alyspools.com` permanecem no [README](../README.md). Licenças do decodificador: `/licenses/README.txt` e `/licenses/heic-to-LGPL.txt`.
