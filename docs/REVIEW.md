# Revisão do protótipo

Arquivos examinados: index.html, app.js (completo), styles.css, README.md, AGENTS.md e sw.js. O protótipo permanece intacto na raiz; o Next não o serve em public/. Não há migração automática de localStorage.

## Problemas observados no código

- **Bloqueador de produção:** localStorage contém toda a carteira e serviços; não existem autenticação, autorização, isolamento, backups ou auditoria. Qualquer pessoa com acesso ao navegador consegue ler/alterar os dados. Não usar clientes reais.
- **PWA quebrada:** index.html, manifest e sw.js referenciam assets/logo.svg, mas a pasta assets não existe. cache.addAll rejeita quando um recurso retorna 404, impedindo a instalação do cache. Confirmado por inspeção dos arquivos; instalação em browser não foi executada.
- **Risco de cache após evolução:** sw.js guarda respostas GET da mesma origem sem separar páginas autenticadas. Não reutilizar esse worker no novo app. Se testou o protótipo em localhost:3000 antes, remova esse service worker em DevTools antes de usar o Next no mesmo host/porta.
- **Calendário:** today(), iso() e apresentação usam o fuso local do dispositivo; isso diverge de America/New_York. A nova apresentação fixa o fuso da empresa; a agenda operacional ainda será implementada.
- **Importação frágil:** valida apenas versão, arrays e limites externos; não valida tipos, relações, IDs únicos ou campos internos. Um backup malformado pode provocar falha no render/ensureWeek e substituir a base atual. Não reutilizamos importação nesta etapa.
- **Recorrência:** ensureWeek cria visitas ao navegar e preserva antigas; inativação e mudanças de dias não cancelam visitas futuras existentes. Isso está parcialmente documentado, mas precisa de regras explícitas de exceção/remarcação no servidor.
- **Modelo limitado:** cliente e piscina são um único registro; não há múltiplos endereços/piscinas por cliente, técnicos ou contratos com repasse fixo.
- **Validação:** limites HTML não substituem validação no servidor. Leituras e dinheiro podem ser alterados diretamente no armazenamento. A fundação usa Zod e constraints PostgreSQL.
- **Acessibilidade:** modal foca o primeiro campo, mas não prende o foco nem devolve o foco ao botão; vários labels não estão associados aos inputs. O novo cadastro usa labels vinculados por encapsulamento e details nativo para edição.

## O que preservar

Identidade navy/verde-água, cartões, pt-BR, USD, galões/ppm, carteira e cadastro, separação do MRR próprio das estimativas de subcontratos. O protótipo escapa os principais textos via esc(); a revisão não demonstrou um exploit XSS, e a ausência de validação de JSON não é por si prova de XSS.

## Evolução após a revisão inicial

O Fast Route agora implementa rotas/técnicos, checklists, leituras e dosagens por piscina, JPEGs privados, histórico imutável, correções auditáveis, outbox de relatório e PWA com IndexedDB/sincronização. A interface atual é em inglês por decisão mais recente do usuário; o histórico químico de30dias aparece no atendimento. O protótipo continua separado, sem migração automática de seus dados locais.

A revisão acima descreve problemas do protótipo original, não uma alegação de que as mesmas ausências permanecem no novo app. Consulte [arquitetura atual](ARCHITECTURE.md) e [validação atual](VALIDATION.md) para implementação e limites testados. E-mail externo depende de configuração segura do provedor; hardware físico e produção não foram validados.
