# ALYS Fast Route — demonstração local

Esta é a demonstração **do fluxo atual**, em inglês, azul-marinho claro, com dados fictícios. Não precisa instalar Node, Docker ou Supabase.

Cloro livre possui atalhos de **1, 3 e 5 ppm**; pH tem **7.0, 7.2, 7.4, 7.6, 7.8 e 8.0**. Também é possível digitar valores diferentes. São leituras da água; produtos aplicados continuam registrados separadamente com quantidade e unidade.

## Como abrir

1. Baixe o repositório pelo GitHub: **Code → Download ZIP**.
2. Extraia o ZIP.
3. Entre na pasta `demo` e abra **index.html** com Chrome ou Edge.

O `demo/index.html` já inclui todo o CSS e JavaScript. Você pode copiá-lo sozinho; não precisa manter os outros arquivos ao lado. Não abra o `index.html` da raiz, que é a demonstração anterior.

## Roteiro de teste

- **Route:** quatro propriedades fictícias. Troque a data, reordene com ↑/↓ e teste Skip/Restore.
- **Start service:** histórico químico dos últimos 30 dias aparece por piscina. A visita mais recente fica visível; as demais podem ser expandidas. Leituras atuais começam vazias.
- **Checklist:** marque/desmarque tarefas ou use Mark all done.
- **Readings:** registre FC e pH; os demais campos podem ser expandidos. A conclusão valida obrigatórios e valores.
- **Dosages:** selecione produtos realmente usados e informe quantidade/unidade. Atalhos não são recomendações de tratamento.
- **Photo:** escolha uma imagem de teste ou use a câmera quando o navegador permitir. Até três fotos, comprimidas e salvas localmente.
- **Complete & Next:** salva a visita na demonstração e abre o próximo stop. Checklist e leituras da próxima visita não são copiados.
- **History:** consulte os dados registrados e abra o relatório com Preview customer report. A prévia não contém notas de acesso.
- **Clients:** cadastre/edite clientes e configure dias, piscinas/spas, checklist, FC/pH obrigatórios e exigência de foto.
- **Settings:** exporte o backup fictício ou restaure os exemplos. Reset afeta somente esta demonstração, após confirmação.

Recarregue a página para verificar os rascunhos, fotos e visitas persistidos. Os exemplos ficam em um banco IndexedDB separado do aplicativo de produção. Se o browser bloquear esse armazenamento, a tela mostra **Temporary mode — not saved**. Limpar dados do navegador ou mudar a localização/origem do HTML pode perder o acesso aos registros locais.

## Limitações

Sem autenticação, permissões, servidor, envio de e-mail, upload/sincronização ou instalação PWA. A operação permanece local mesmo com conexão à internet. Não use informações reais de clientes. O app completo Next/Supabase continua na raiz do repositório e tem instruções próprias no README principal.

Se a política do navegador impedir a abertura direta, opcionalmente sirva a pasta com Python:

```bash
python -m http.server 8000 --directory demo
```

No Windows com Python Launcher, use `py -m http.server 8000 --directory demo`. Abra a porta 8000 no seu navegador local. Essa alternativa é opcional, não necessária nos navegadores testados.

## Desenvolvimento

Fontes: `template.html`, `styles.css` e `app.js`. Depois de editar, regenere o arquivo independente:

```bash
node scripts/build-demo.mjs
```

Teste de navegador separado do Supabase (requer dependências de desenvolvimento do repositório):

```bash
npx playwright test --config=playwright.demo.config.ts
```

## Validação realizada

Testes automatizados em Chromium com viewport mobile verificam ausência de dependências externas, persistência de foto/rascunho após recarregar, conclusão/avanço sem copiar leituras, histórico e relatório fiel, cadastro/configuração de piscinas e escape de texto digitado. Neste ambiente gerenciado, a política do browser bloqueou `file://`; os testes foram executados por HTTP estático local. A abertura direta por duplo clique não foi validada aqui, e a alternativa Python acima está documentada. A câmera física do celular e impressão/PDF manual não foram testadas.
