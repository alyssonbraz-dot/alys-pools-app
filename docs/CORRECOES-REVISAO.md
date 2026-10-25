# Correções da revisão — 25/10/2026

Referência: revisão do commit82ed3db em REVISAO-COMPLETA-2026-10-25.md. O relatório original descreve aquela versão e foi preservado como registro. Esta entrega implementa as correções abaixo; não houve deploy ou envio externo.

| Item | Implementação | Verificação |
| --- | --- | --- |
| R01 — agenda | Reconciliação transacional por trigger; ID do stop preservado em reatribuição; cancelamento auditado de futuros abertos; concluídos e skips manuais preservados; alteração de agenda com stop em andamento é rejeitada | SQL de reatribuição, desativação/reativação e arquivo |
| R02 — data | AbortController, sequência de requisição e conferência da data selecionada antes de aplicar resposta, cache, erro ou loading; operações antigas não iniciam atualização de outra data | Browser com resposta antiga retida e seleção de outro dia |
| R03 — informações atuais | RLS exige atribuição aberta numa janela de trabalho; conclusão ou skip manual de hoje mantém acesso no mesmo dia; histórico tem customer_id imutável preenchido no servidor | SQL: técnico histórico não lê propriedade atual, mas consulta snapshots antigos; técnico atual continua autorizado |
| R04 — saída mobile | Ação em Settings, confirmação de pendências reutilizada e redirecionamento das outras abas | Browser mobile, duas abas, conferência da limpeza do IndexedDB |
| R05 — limites | Paginação de relacionamentos por IDs da rota e cadastros; histórico com busca/status no servidor e páginas de50 | Unitário com1201 registros; SQL com260 visitas e leitura de páginas antigas |
| R06 — idiomas | Status de rascunho, confirmações e mensagens dinâmicas traduzidos; prioridade da chave canônica impede colisões de fragmentos | Browser PT/ES, formulário preservado, unidade de i18n e demonstração |

## Stops do dia

Nova página protegida `/stops`, acessível na barra mobile e no menu desktop. Dia atual em America/New_York, progresso, filtros pendentes/concluídos/todos e ações de iniciar visita/navegar. Abre o mesmo editor de serviço, com histórico químico de30 dias. A PWA instalada abre Stops. O planejamento semanal permanece em Route. A tela não exige carregar um mapa para iniciar o serviço.

## Proteções adicionais

- Ordem e plano viário gravados numa única RPC; uma mudança concorrente de status/posição rejeita o cálculo antigo. A assinatura de coordenadas invalida métricas quando o cadastro muda.
- Orçamento persistido de uploads, retry estável e ferramenta administrativa de limpeza com simulação padrão. Somente arquivos órfãos de stops fechados com reserva antiga são elegíveis; nenhuma exclusão foi executada nesta entrega.
- Geocodificação com controle de frequência persistido no banco entre instâncias.
- CSP de scripts com nonce/strict-dynamic; estilos inline necessários ao Leaflet continuam permitidos. Shell offline genérico preserva sua própria política. A proteção é testada com script sem nonce inserido no HTML, não por execução de código privilegiada pelo DevTools.
- Resultado de convite distingue aceitação, falha, incerteza e pedido anterior. Não ativa SMTP/portal nem reenvia automaticamente.
- Dados de frequência/técnico no perfil do cliente identificados na UI como cadastro, separados da agenda operacional.
- Workflow de checks adicionado. Execução remota do GitHub Actions não é presumida a partir dos testes locais.

## Decisões e limites

A janela de cadastro atual do técnico é ontem até os próximos7 dias para stops abertos, mais conclusões/skips manuais de hoje. Usuário com somente histórico antigo lê snapshots autorizados, sem receber novos códigos. Cache offline já baixado depende de proteção do aparelho; RLS não revoga bytes de um dispositivo desconectado.

Conflito com outro stop já existente no técnico/dia é marcado `schedule_conflict` e não duplica o atendimento. Visita já iniciada exige intervenção explícita. Não há cancelamento físico nem perda do histórico. Bancos legados com duplicatas concluídas não são apagados pela migração.

Sem SMTP, portal e provedor viário real validados, convites/e-mail continuam desativados e a rota manual funciona. Financeiro, backup/restauração hospedados, recuperação de acesso e teste em celulares físicos continuam etapas operacionais próprias; esta entrega não afirma validá-los nem cria serviços pagos.

Resultados finais de execução estão em docs/VALIDATION.md. Instruções de banco, testes e manutenção estão no README.
