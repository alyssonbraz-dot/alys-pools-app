# Prompt inicial para usar no Codex

Quero que você assuma o desenvolvimento do **ALYS Pool Manager**, aplicativo de operação da minha empresa ALYS Pool Services LLC (Flórida, EUA).

**Primeiro passo:** abra e examine todos os arquivos deste repositório: `index.html`, `app.js`, `styles.css`, `README.md` e `AGENTS.md`. Já temos uma demonstração que roda localmente; preserve a identidade visual e os fluxos de uso enquanto desenvolve uma versão profissional.

**Objetivo:** um sistema web responsivo que parece um app nativo no celular, com login seguro, clientes, endereços, piscinas, visitas recorrentes por semana, rotas por técnico, leituras químicas, produtos aplicados, fotos da visita, histórico, relatório para o cliente e financeiro. A moeda é USD, volume em galões, testes em ppm, idioma padrão pt-BR e timezone America/New_York.

**Modelo de negócio muito importante:** há clientes próprios (cobrança mensal) e piscinas de contratos subcontratados (repasse por visita ou por contrato). O financeiro deve separar o MRR da carteira própria de estimativas/receitas de subcontratos. Não confundir faturamento bruto com lucro líquido.

**Tecnologia proposta:** Next.js + TypeScript + Tailwind CSS, Supabase PostgreSQL + Auth + Storage, policies RLS por organização, testes. Você pode sugerir alternativa técnica se houver motivo concreto. O objetivo é depois publicar o produto sem reescrever tudo de novo.

**Sua missão nesta primeira tarefa:**
1. Verificar os arquivos do protótipo e relatar problemas de funcionamento e segurança.
2. Propor uma arquitetura de produção, com esquema inicial do banco e regras RLS.
3. Implementar a fundação do novo projeto e migrar a interface principal para componentes reutilizáveis.
4. Criar autenticação, páginas protegidas e CRUD seguro para clientes/piscinas, com migrations e dados fictícios apenas no ambiente de desenvolvimento.
5. Manter um `README.md` com instruções reais de configuração local, `.env.example` sem credenciais e comandos de teste.
6. Rodar lint, typecheck e testes que puder executar; dizer o que não foi possível testar.

**Restrições:** não publique, não faça compras, não ative integrações pagas e não envie dados reais de clientes. Não afirme que algo funciona sem testar. Implemente de forma incremental e documente as decisões. Se faltar alguma credencial, use placeholders e continue com o que é possível executar localmente.

Comece lendo o projeto, apresente um plano curto em etapas e então execute a primeira etapa funcional.
