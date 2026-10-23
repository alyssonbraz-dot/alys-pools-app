# ALYS Pool Manager — protótipo 1.0

Protótipo funcional e responsivo do aplicativo interno da **ALYS Pool Services LLC**. Interface em português, valores em USD, medição de piscinas em galões/ppm, com dados **100% fictícios**.

## Começar agora (sem instalar dependências)

1. Extraia o arquivo ZIP.
2. Abra `index.html` no Chrome/Edge para testar o aplicativo.
3. Opcional: para servir por HTTP e instalar como PWA, dentro da pasta execute `python -m http.server 8000` e abra `http://localhost:8000`. No Windows, se o Python estiver instalado, também pode usar `py -m http.server 8000`.
4. Em **Configurações**, exporte um arquivo de backup JSON para guardar os dados de demonstração.

O app funciona **sem conexão com internet** depois que os arquivos estão disponíveis. Quando servido por HTTP ou HTTPS, instala um service worker para armazenamento em cache do front-end. Dados digitados ficam apenas no `localStorage` desse navegador.

## Módulos disponíveis

- **Visão geral:** receita mensal dos clientes próprios, piscinas ativas, agenda de hoje, produtividade semanal.
- **Rotas e agenda:** navegação semanal, recorrência pelos dias cadastrados, registro de visita.
- **Clientes:** cadastro, edição, situação ativo/inativo, tipos residencial/comercial, origem própria/subcontrato, frequência, capacidade, valor de mensalidade ou repasse por visita.
- **Manutenção:** pH, cloro livre, alcalinidade, sal, químicos utilizados e observações.
- **Histórico:** visitas pendentes e concluídas e impressão de relatório básico da visita (ou salvar como PDF pelo navegador).
- **Financeiro:** soma do MRR próprio e projeção de repasses de subcontratos, **em métricas separadas**.
- **Configurações:** exportar/importar dados JSON, restaurar exemplos.

## Limitações deliberadas desta demonstração

**Não utilizar com dados pessoais reais de clientes.** Ainda não há autenticação, banco de dados, backups automáticos, segregação por usuário, criptografia de dados no servidor ou autorização por papéis. `localStorage` não é armazenamento seguro para dados de clientes e pode ser apagado. Não há envio de e-mail, faturamento real, fotos, GPS, cálculo de rota, pagamentos ou integração com QuickBooks.

Os valores, nomes e endereços cadastrados inicialmente são **exemplos inventados**, não os clientes reais da ALYS.

Ao mudar os dias recorrentes de um cliente, visitas já criadas são preservadas; a nova programação será aplicada nas semanas novas. Os cálculos são **projeções brutas**, sem químicos, deslocamento, impostos ou inadimplência.

## Evolução recomendada com Codex

Abra esta pasta no Codex e envie o conteúdo de `CODEX_PROMPT.md`. O arquivo `AGENTS.md` descreve regras permanentes para o agente de programação.

**Stack sugerida para produção:** Next.js (TypeScript, App Router), Tailwind CSS, Supabase (Postgres/Auth/Storage com RLS), Vercel para hospedagem, testes com Vitest e Playwright. Fotos privadas em Supabase Storage; notificações via serviço de e-mail somente depois da segurança e de consentimento do cliente.

### Próximas fases

1. **Fase 1: fundação segura** — projeto Next.js, autenticação e usuários da empresa, migrations e RLS, dados de exemplo apenas para testes.
2. **Fase 2: operações** — clientes, piscinas, múltiplos técnicos, agenda recorrente, checklists e relatórios com fotos.
3. **Fase 3: cliente e receitas** — portal cliente, relatórios automáticos, faturas, recebimentos e métricas por contrato, após aprovação de provedores e permissões.
4. **Fase 4: escala** — roteirização otimizada, múltiplas empresas (SaaS), inglês/português, planos de assinatura.

## Dados e marca

Empresa: ALYS Pool Services LLC · Site: alyspools.com · Telefone: (954) 930-9259 · E-mail: alyspools@gmail.com.

Este projeto é um ponto de partida técnico para personalização no Codex, **não** um serviço publicado ou pronto para produção.
