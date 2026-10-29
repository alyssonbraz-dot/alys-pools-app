# Auditoria de localização V2.1.1

Referência anterior: `main` `f7c01d3`. Idiomas: inglês (`en`), português brasileiro (`pt`/`pt-BR`) e espanhol (`es`, apresentação regional `es-US`). Inglês continua sendo o padrão. Preferência permanece no navegador durante navegação, reload e novo login.

## Cobertura do catálogo

| Medida | Antes | V2.1.1 |
| --- | ---: | ---: |
| Entradas PT no JSON original | 968 | 1.065 |
| Entradas ES no JSON original | 629 | 1.065 |
| Chaves explícitas EN | 0 (texto inglês implícito) | 1.065 |
| Chaves PT sem equivalente ES (comparação original) | 339 | 0 |
| Ausências ES após normalização das chaves | 337 | 0 |
| Diferenças entre os conjuntos finais EN/PT/ES | — | 0 |

As entradas anteriores com espaços nas bordas foram normalizadas sem perder a prioridade da tradução explícita: PT possuía 961 chaves distintas e ES 624 após normalização. As **339 divergências originais de chave em espanhol** foram resolvidas (337 ausências após normalização); o catálogo final também inclui novos controles, mensagens de validação, enums de apresentação e erros offline. Inglês agora possui catálogo explícito com o mesmo conjunto de chaves. Marca ALYS, nomes de idiomas e símbolos internacionais mantêm grafia própria.

## Texto fixo e mensagens corrigidas

- Estado do sistema: conexão, schema, Storage, e-mails, webhook, worker, geocoding, origem do aplicativo e instruções corretivas.
- Equipe/convites: técnicos e administradores, autorização de Owner, status, suspensão, reenvio e mensagens de configuração.
- Perfil do cliente: estado do cadastro, origem/modelo/estado do contrato, envio habilitado, coordenadas confirmadas, agenda ativa/pausada, dias e datas.
- Formulários: campo exato, imóvel/agenda/piscina, nome completo, dias de atendimento, datas, técnico, e-mail e conflitos com visita em andamento.
- Rota/técnico: anterior/hoje/próximo/calendário, data e fuso, quantidade ainda no dispositivo, mensagens dinâmicas de leituras e fotos obrigatórias.
- Offline: resumo da fila local, verificação de armazenamento, quota, conta alterada, salvamento interrompido e tentativas de sincronização.
- Histórico/química: carregamento de foto privada, estados de entrega, nomes de produtos conhecidos, unidades e descrições acessíveis das tabelas/fotos.
- Demonstração: banner, isolamento, envio externo bloqueado e mensagens de diagnóstico.
- Acessibilidade: nomes da navegação, data da rota, notificações, fotos, produtos e ações com o nome do imóvel preservado.

Templates mais específicos têm prioridade sobre padrões genéricos. Isso evita, por exemplo, traduzir apenas “is required” e deixar “one service photo” em inglês. Leituras conhecidas são traduzidas dentro da mensagem; nomes de piscina/cliente e notas permanecem literais. Dados financeiros e medições mantêm seus valores armazenados, com formatação de moeda/quantidade/data no idioma selecionado. Códigos de banco, parâmetros API e identificadores internos continuam iguais.

## Páginas auditadas

| Área | Rotas/componentes |
| --- | --- |
| Acesso | `/login`, `/join`, tela de erro e idioma global |
| Dashboard | `/`, métricas, MRR, avisos e fila do dispositivo |
| Clientes | `/customers`, `/customers/new`, `/customers/[id]`, edição e validações |
| Imóveis/piscinas | `/pools`, LocationPicker, `/locations` |
| Agendas/rotas | `/route`, `/stops`, calendário, mapa e controles de data |
| Técnico | `/visit/[id]`, leituras, produtos, checklist, fotos, erros e sincronização |
| Histórico | `/history`, tabelas químicas, relatórios, correções e estados |
| Equipe | `/team`, convites, ativação e permissões |
| Configurações | `/settings`, conta, padrões, idioma dos relatórios |
| Diagnóstico | `/settings/health`, cache e fila local |
| Revisão financeira | `/customers/legacy` |
| Offline/demo | `/offline`, PWA, fila e banner demo |

A auditoria automatizada cobre as strings literais de páginas/componentes, mensagens de erro API e falhas de armazenamento. Não tenta traduzir conteúdo livre dos usuários nem afirma inferir todos os possíveis textos de serviços externos. Erros desconhecidos do banco são substituídos por mensagens controladas, sem vazamento de SQL ou dados privados.

## Testes

- `tests/i18n-coverage.test.ts`: igualdade dos conjuntos EN/PT/ES, entradas não vazias, preservação dos parâmetros, textos literais, erros API/offline e detecção de JSX inglês sem tradução.
- `tests/i18n.test.ts`: idioma padrão, preservação de nomes, mensagens dinâmicas, prioridade dos templates, datas, USD e quantidades.
- `tests/integration/v211-localization.spec.ts`: EN/PT/ES nas telas principais, formulário e erros, data, troca imediata de idioma, reload e logout preservando a preferência. Executado em projetos de celular e desktop.
- `tests/integration/v211-hotfix.spec.ts`: cadastro e conflito real com campo identificado; navegação por datas com rascunho, foto e conclusão offline.

Resultados finais e limitações de execução são registrados em [V211-HOTFIX.md](V211-HOTFIX.md). Emulação de viewport iPhone/Android com Chromium não é verificação de Safari/WebKit nem de aparelhos físicos.
