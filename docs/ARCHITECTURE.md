# Fast Route — arquitetura implementada

## Escopo atual

A especificação Fast Route substitui o painel amplo: interface em inglês e navegação Route, Clients, History, Settings. A fundação Next.js App Router/TypeScript/Tailwind/Supabase é reutilizada. Tabelas financeiras existentes permanecem sem exposição no fluxo; não há financeiro novo, pagamentos, inventário, portal ou integração paga ativada.

## Fronteiras de confiança

- Server Components/Server Actions/Route Handlers validam identidade com Supabase getUser. Layout e cada endpoint/action têm verificação própria. owner/admin administram cadastros; technician acessa somente stops atribuídos. customer não recebe acesso ao app interno.
- Cliente usa só chave publicável; uploads e worker usam service_role exclusivamente no servidor, após autorização de sessão para upload. Papel/organização são provisionados administrativamente; user_metadata e IDs do browser não concedem acesso.
- Mutations HTTP exigem mesma origem; JSON/form-data têm limites de tamanho antes do parse. Zod + constraints/RPC validam campos. Respostas privadas no-store. Snapshot de conclusão deriva nomes/configuração do banco, não nomes enviados pelo cliente.
- Fotos são JPEG decodificadas/reprocessadas com sharp, até2MB/1600px. Bucket privado sem INSERT/UPDATE/DELETE de sessão; somente backend autorizado faz upload. Leitura/signed URL conferem stop e RLS. Sem URLs públicas ou token permanente.

## Relações e migrations

001: organizations, profiles(auth.users), customers, properties, pools, contracts, audit_log.

002: extensão de cliente (email_reports_enabled), propriedade (name/gate_notes), piscina (checklist/required_readings/photo_required), mais:

| Entidade | Invariantes |
| --- | --- |
| recurring_schedules | propriedade + técnico no tenant, dias0–6, início/fim, um agendamento ativo por propriedade/técnico |
| route_stops | único por propriedade/técnico/data; posição manual; pending/in_progress/completed/skipped |
| visits | UUID do dispositivo e route_stop_id únicos; snapshot imutável por propriedade, várias piscinas; completed_at do serviço e received_at do servidor |
| visit_checklist_items | apenas tarefas selecionadas do template por piscina; sem herdar visita anterior |
| chemical_readings | uma linha por piscina/visita; FC/ph/TA/CYA/CH/sal/CC opcionais salvo configuração obrigatória |
| chemical_dosages | produto, quantidade decimal positiva e unidade explícita, sem recomendação automática |
| visit_photos | até3 paths do stop, únicos e com objetos reais privados; após conclusão não substituíveis |
| email_delivery_logs | único por visita; destinatário opt-in no fechamento; pending/sent/failed, attempts, lease e chave/payload estáveis |

003: claims de outbox exclusivamente service_role, congelamento de payload e settlement com token da lease; retry de gestor reusa o mesmo job. Resend24h de deduplicação → corte conservador22h. Sent só com ack ID. Renovação da lease imediatamente antes do envio; timeout curto de rede.

004: visit_corrections append-only, nota de gestor com autor/data e audit_log. Nenhuma correção altera o original ou dispara novo e-mail.

005: contexto químico de30dias por piscina já no stop. RPC retorna apenas leituras/dosagens de propriedades autorizadas, incluindo visitas de outro técnico; sem notas, fotos ou contato. Consulta paginada, janela no fuso America/New_York e cache junto da rota.

## RLS e atomicidade

Todas as entidades têm organização e FKs compostas para impedir relações cruzadas. Profiles permitem próprio perfil; gestores leem técnicos da mesma organização. Predicados definer com search_path fixo evitam recursão de RLS e usam auth.uid(), nunca identidade fornecida pelo usuário.

Técnico lê stop atribuído e propriedade/piscinas/cliente associados, histórico de suas visitas e status de relatório. Não escreve carteira, papéis, empresa ou contratos. Gestor acessa seu tenant. Sessões não têm DML direto em stops, visitas, medições, fotos de histórico ou outbox; mudanças usam RPC restritas. Histórico tem triggers contra UPDATE/DELETE além das permissões. Audit é append-only para aplicação.

`generate_route` considera dias e validade, clientes/piscinas ativos; conflito único e lock por empresa/data evitam geração duplicada. Alterar agendamento não apaga stops já gerados: skip registra a exceção operacional. Não há otimização automática.

`complete_visit` faz lock do stop, checa atribuição, chave idempotente, cada piscina ativa da propriedade, tarefas configuradas, leituras/quantidades/obrigatórios, objetos de foto e horário do dispositivo. Só então insere snapshot e linhas normalizadas, marca completed e cria outbox na mesma transação. Repetir mesmo UUID+stop retorna a visita original. UUID em outro stop ou novo UUID no mesmo stop é conflito. Falha não deixa visita parcial. Recebimento pelo servidor é auditado separadamente do horário do trabalho offline.

## Cliente de campo e offline

FieldApp/VisitEditor/PoolForm/HistoryApp usam Route API e IndexedDB nativo. Cada chave local inclui user+org; API confere sessão e headers de identidade ao sincronizar. Páginas autenticadas passam identidade verificada; não fazem fallback para conta antiga. Shell offline intencional abre somente o último escopo guardado num dispositivo protegido.

Conclusão é primeiro uma escrita local atômica por stop, com UUID estável, então navega para próximo stop do mesmo técnico. Uploads determinísticos guardam confirmação de cada foto para retomar. Blobs e draft só saem após confirmação do servidor, junto à atualização do cache do stop. Queue/network-uncertain não pode ser editado; rejeição422 anterior ao commit pode ser corrigida com o mesmo UUID. Sincronização reconfirma conta e pausa se sessão expirar/mudar. Locks/epoch de dispositivo impedem respostas antigas de repopular dados após logout.

Service worker cacheia somente shell público estático e assets. APIs, authenticated HTML, RSC e fotos nunca entram em CacheStorage. Reabrir offline carrega shell e usa rota mais recente local, inclusive após virar o dia. OS pode suspender o app; sincronização de app fechado não é prometida.

## Relatórios e privacidade

Snapshots só contêm nomes públicos, tarefas realmente executadas, números registrados, produtos/quantidades e nota pública deliberada. Gate/access notes não entram. Report HTML/texto escapa strings e anexa JPEGs reais com CID. E-mail vai somente ao contato cadastrado/opt-in; worker reconfirma esse opt-in/endereço antes de enviar.

Outbox não depende do processo web permanecer vivo. after() tenta envio imediato, e um scheduler confiável deve acionar o worker periodicamente. Nenhum scheduler externo foi criado. Sem credenciais ou habilitação, status segue pending e não há provider call. Provedor aceitou não significa caixa postal entregou; bounce/webhooks ficam fora desta entrega.

## Limites explícitos

RLS não protege contra service_role/proprietário do banco; mantenha acesso administrativo seguro. IndexedDB é armazenamento local sensível, não cofre nem backup. Listas limitam cadastros a1000/consulta e histórico a200 visitas recentes; paginação é evolução necessária para carteiras maiores. Atalhos customizados de dose são por sessão de edição, não um receituário; persistência de preferências pode evoluir sem alterar registros. Correções atuais são notas auditáveis, não substituição de medições/novos relatórios. Recuperação de senha, MFA e backups/restauração precisam configuração de produção. Hardware iPhone/Android e entrega real de e-mail ainda exigem testes próprios antes de uso operacional.
