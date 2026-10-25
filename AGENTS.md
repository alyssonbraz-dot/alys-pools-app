# Diretrizes para o Codex — ALYS Pool Manager

Você é o engenheiro principal do projeto ALYS Pool Manager. O produto é um aplicativo de gestão operacional de manutenção de piscinas para pequenas empresas na Flórida, começando pela ALYS Pool Services LLC.

## Visão do produto

- Usuário principal: proprietário e técnicos, operando no celular à beira da piscina.
- Interface atual Fast Route: inglês (pedido mais recente do usuário); documentação pode permanecer em português.
- Escopo atual: Route → Checklist → Readings → Dosages → Photo → Complete & Next → Email → History. Não desenvolver dashboard financeiro, pagamentos, inventário, portal ou marketing nesta versão.
- Domínio: piscinas residenciais e comerciais, capacidades em galões, testes em ppm, moeda USD, timezone `America/New_York`.
- A empresa pode ter **clientes próprios** (mensalidade) e **rotas subcontratadas** (repasse por visita ou por contrato). Esses modelos **não devem ser somados indiscriminadamente como MRR**.
- Número de visitas por semana configurável (1, 2, 3 ou mais), com dias da semana, exceções e histórico de remarcações.
- Cliente pode ter mais de uma piscina/spa; visite uma instalação e registre medições por piscina.

## Segurança e privacidade (inegociável)

- **Nunca** migrar o protótipo para produção usando apenas localStorage como base de dados.
- Autenticação obrigatória, autorização server-side e políticas RLS para separar organizações, técnicos e clientes.
- Nunca expor chaves Supabase `service_role`, tokens, segredos ou dados pessoais no browser ou repositório.
- Uploads em buckets privados com URLs assinadas e checagem de permissões.
- Dados de demonstração fictícios; não inventar clientes reais ou copiar informações sensíveis de conversas anteriores.
- Confirmar explicitamente antes de envio de e-mail/SMS, cobrança, exclusão de dados ou qualquer ação externa real.
- Validar entrada no servidor (Zod ou equivalente), limitar uploads e evitar injeções/XSS.

## Padrões de implementação

- Propor arquitetura, migrations e fases antes de realizar mudanças disruptivas.
- Preferir TypeScript estrito, componentes acessíveis e responsivos, fluxo offline-first quando viável, especialmente para técnicos em campo.
- Paleta atual solicitada: azul-marinho claro, fundos azulados e cartões leves, layout mobile-first.
- Preservar funções úteis do protótipo e explicar limitações; não alegar que integrações inexistentes funcionam.
- Criar testes de validação de cálculos de receita, recorrência, permissões e registro de visitas.
- Não realizar deploy, enviar mensagens nem configurar serviços pagos sem confirmação explícita.
- Ao terminar cada etapa, informar o que mudou, como executar/testar e qualquer risco pendente.

## MVP de produção — entidades mínimas

- organizations(id, name, timezone, settings)
- profiles(id, organization_id, role, display_name)
- customers(id, organization_id, name, contact info, status)
- properties(id, organization_id, customer_id, address, geolocation_optional)
- pools(id, organization_id, property_id, water_type, gallons, type)
- contracts(id, organization_id, customer_id, source, billing_model, price, currency, status)
- recurring_schedules(id, organization_id, pool_id, days_of_week, frequency, assigned_technician)
- visits(id, organization_id, pool_id, scheduled_at, status, technician_id, notes)
- water_tests(id, organization_id, visit_id, free_chlorine_ppm, ph, alkalinity_ppm, salt_ppm)
- chemical_additions(id, organization_id, visit_id, product, amount, unit)
- visit_photos(id, organization_id, visit_id, storage_path, category)
- reports(id, organization_id, visit_id, sent_at, status)

Adapte os nomes e as relações conforme as necessidades reais, mas preserve isolamento entre organizações e auditoria de alterações.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
