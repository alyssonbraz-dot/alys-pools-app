# Entrega e operação

Data desta preparação: **27/10/2026**, referência da operação `America/New_York`. Publicação gratuita e domínio estão no [README](../README.md). Desenvolvimento está no [guia local](LOCAL-DEVELOPMENT.md).

## Acessos da equipe

O proprietário é provisionado pelo script do README. Não há cadastro público, tela de gestão de usuários ou atribuição de papel por metadata do navegador nesta versão. Técnicos adicionais são provisionados administrativamente:

1. No painel Supabase correto, em Authentication → Users, use **Add user / Create user** com e-mail da pessoa e senha temporária forte. Use criação administrativa confirmada, sem convite automático; transmita o acesso por canal seguro.
2. Anote o UUID retornado para esse usuário. No SQL Editor administrativo, consulte a organização pelo UUID do proprietário:

```sql
select id, organization_id, role, display_name
from public.profiles
where id = 'UUID_DO_OWNER';
```

3. Confira o projeto e insira o perfil com os UUIDs corretos. Os textos abaixo são placeholders a substituir; não são valores executáveis:

```sql
insert into public.profiles (id, organization_id, role, display_name)
values ('UUID_DO_TECNICO', 'UUID_DA_ORGANIZACAO', 'technician', 'Nome do técnico');
```

Não use `upsert` para mover pessoas entre organizações, não crie organização para cada técnico e não conceda `owner` por conveniência. O SQL Editor é um canal privilegiado; não entregue chave administrativa à equipe. O procedimento atual de recuperação/troca de senha também é administrativo; a interface não oferece autosserviço de recuperação.

4. No app como proprietário, atribua o técnico nas agendas de Settings/Route. O cadastro do cliente sozinho não remaneja stops existentes.
5. Teste a conta em navegador privado: somente Stops/History/Settings, sem gestão de clientes nem acesso a stops de outra pessoa.

Ao desligar alguém, bloqueie a conta/revogue sessões pelo Auth e revise atribuições. Mudanças de permissão não apagam dados já baixados num dispositivo offline; exija aparelho protegido e encerramento seguro da sessão. Não exclua perfis/histórico para bloquear um acesso.

## Rotina diária

- Antes da saída: abrir Stops online, conferir data da Flórida, atribuições, requisitos de foto/checklist e rota carregada.
- Durante a rota: novas medições sempre digitadas/selecionadas; valores antigos são referência. Access Denied não dispensa medições/foto obrigatórias: não invente valores, use skip autorizado para uma visita sem acesso.
- Após atendimento: Complete & Next salva localmente; Synced confirma banco. Failed mantém o conteúdo para retry. Erro de relatório não exige repetir a visita.
- Antes de sair da conta ou limpar dispositivo: sincronizar todas as pendências. Logout limpa dados locais após aviso.
- Final do dia: conferir stops restantes, History, fotos e fila de e-mail. Se um relatório não chegou, verificar status no Resend e endereço/opt-in antes de reenviar.

A função agendada Netlify é uma recuperação a cada 15 minutos, um job por chamada. As tentativas imediatas normalmente ocorrem após cada conclusão. Ela depende de site, banco e provedor disponíveis, configuração válida e cotas; confirme os logs no deploy publicado. Não há garantia de execução pontual ou entrega na caixa de entrada.

## Falhas e recuperação

| Situação | Ação |
| --- | --- |
| Login recusado | Conferir projeto/chaves, usuário Auth e perfil na mesma organização; usar canal administrativo para senha |
| Nenhum stop para técnico | Conferir data local, cliente ativo, agenda/técnico atribuído e geração da rota pelo gestor |
| Pending Sync / Failed | Manter aparelho/dados, reabrir app com internet e conta original; tentar Retry sync |
| Rejeição de requisitos | Corrigir o rascunho quando a interface permitir; não substituir UUID após resposta incerta |
| Conflito de conclusão | Conferir History antes de repetir; não criar outra visita para resolver conflito |
| Relatório Pending | Conferir envio habilitado, domínio Verified, variáveis no runtime e logs da função agendada |
| Relatório Failed | Verificar erro/configuração/cotas; gestor pode usar Retry report delivery do mesmo job |
| Resend aceitou, mas não há e-mail | Conferir destinatário, Spam e painel do provedor; Sent não significa entregue |
| Certificado pendente | Conferir zona DNS autoritativa, CNAME/A conflitantes, domínio no Netlify e eventuais CAA restritivos |
| Plano atingiu cota | Pausar/reduzir operação e revisar consumo; não habilitar cobrança automática |

Se o envio tiver resultado incerto, a fila preserva o payload e chave. Após 22 horas desde a primeira tentativa, novas tentativas incertas são bloqueadas para evitar ultrapassar a janela de deduplicação do provedor. Reconcilie com o Resend antes de decidir qualquer nova entrega. Webhooks de entrega/bounce não estão implementados.

## Backup e retenção

O plano gratuito não deve ser tratado como backup gerenciado. Planeje exportação periódica do PostgreSQL por ferramenta oficial, armazenada em local privado e teste a restauração em projeto separado. Backup do banco **não inclui** imagens do bucket: exporte e proteja também os objetos do Storage e seus vínculos, sem tornar o bucket público.

Acompanhe Storage/tráfego, tamanho do banco, créditos/execuções Netlify e limites de envio Resend. A aplicação limita reservas de upload: 12 por stop, 120 novas por hora por organização e 2.000 acumuladas por organização; tentativas também podem consumir orçamento. Esse último limite pode interromper novos uploads mesmo havendo cota no provedor. A liberação exige análise administrativa; não altere contadores só para contornar proteção. Histórico/fotos vinculados não são apagados automaticamente.

Há simulação de limpeza de fotos órfãs, somente para stops fechados há mais de 14 dias e sem vínculo com visita:

```bash
node --env-file=.env.production.local scripts/cleanup-photos.mjs --organization=UUID_DA_ORGANIZACAO
```

Não use `--apply` sem conferir escopo, backup e autorização de exclusão. Não rode scripts de teste para “limpar” produção.

## Atualizar uma instalação

1. Sincronize trabalho pendente dos dispositivos e faça backup antes de mudança de banco.
2. Revise as alterações e aplique somente migrations pendentes com `supabase db push` no projeto correto, sem reset.
3. Publique o código correspondente pelo Git/Netlify. Para a versão Fast Technician, a migration014 precisa preceder o app.
4. Teste login, stop, foto/histórico e relatório controlado. Confira a agenda e cotas.
5. Em falha de código, restaure um deploy compatível pelo Netlify; não tente desfazer migrations apagando dados. Investigue e faça correção incremental.

Não troque domínio com pendências locais: armazenamento do navegador é separado por origem. Atualização de PWA deve preservar a fila; nunca recomende limpar cache/dados para corrigir problema antes de resgatar o trabalho não sincronizado.

## Condições para encerrar o aceite

O checklist do README é a validação no ambiente real. Código compilado, SQL/RLS testados e simulação de provedor não demonstram câmera física, DNS/HTTPS, recebimento real, capacidade com 10–20 stops/dia ou interação de 15–30 segundos. Essas medições e verificações ficam explícitas para o piloto.

O repositório não contém credenciais reais, não executa seeds remotos automaticamente e não ativa plano pago. Nenhum deploy, mudança DNS ou envio externo foi realizado nesta preparação.
