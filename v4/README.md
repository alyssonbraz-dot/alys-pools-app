# ALYS V4 · Atendimento em campo

A entrada da V4 é `/v4`. O calendário, a rota e a ficha de visita usam um projeto Supabase independente, `alys-v4`. O banco começa pelas migrações em `v4/supabase/migrations`. Essas migrações destinam-se exclusivamente a um projeto novo.

## Abrir a demonstração local

Use Node 24, Docker, Supabase CLI 2.121.0 e as dependências do lockfile. Na raiz do repositório, execute:

```bash
npm ci
./v4/start-local.sh
```

No ambiente de desenvolvimento preparado, as dependências já estão instaladas. O script inicia o banco na porta 55322, a API na 55321 e o Next.js na 3004. A variável `PORT` permite escolher outra porta para o Next. Acesse `/v4` nessa aplicação. A entrada também aparece na tela de login e no menu **More** da versão anterior.

O seed cria uma conta fictícia de proprietário, três paradas e registros históricos por piscina. Consulte `email` e `password` no arquivo privado `/tmp/alys-v4-fixture.json` do ambiente. O script reutiliza a conta quando repetido. A aplicação usa a URL e a chave publicável da V4. A chave administrativa local fica restrita ao provisionamento.

## Percorrer uma rota

1. Escolha o dia no calendário. O painel mostra o técnico, as paradas concluídas e o próximo endereço. **Route** permite reordenar paradas e salvar a ordem padrão. O proprietário também pode cadastrar uma parada na própria rota.
2. Toque em **Start visit**. Preencha pH e cloro livre para cada piscina ou spa. O histórico aparece em **Recent activity**. Cada nova medição começa em branco. Há campos para alcalinidade, dosagens, checklist, foto e observações.
3. **Finish & Next** confirma a gravação local e abre a próxima parada. Enquanto a rota estiver aberta, as visitas também podem ser feitas sem conexão. Rascunhos e fotos ficam no IndexedDB, associados à empresa, ao usuário e à parada.
4. Com a conexão restabelecida, a fila envia a visita e a foto. O servidor usa o identificador da visita para reconhecer reenvios e grava um único relatório. **Reports** reúne os registros concluídos. A entrega de e-mails é uma etapa futura.
5. **Map** carrega a cartografia sob demanda e **Directions** abre o destino no Apple Maps. A linha entre pinos acompanha a sequência de paradas. Os fundos de rua e satélite dependem de acesso ao OpenStreetMap e à Esri.

Para reabrir a aplicação depois de fechar ou recarregar a página, conecte-se à rede e entre com a mesma conta. O navegador recupera os dados locais pendentes. A instalação na tela inicial do iPhone usa o manifesto próprio da V4. Câmera, armazenamento e suspensão do Safari precisam de aceite em um iPhone físico, em origem HTTPS.

## Verificar

Com o servidor local em execução, na raiz do repositório:

```bash
npm run lint
npm run typecheck
npm test
docker exec -i supabase_db_alys-v4 psql -q -v ON_ERROR_STOP=1 -U postgres < v4/tests/field-service.sql
node v4/test-api.mjs
node v4/test-field.mjs
```

Os testes de navegador usam o Chromium do sistema com perfil de iPhone 13. O teste de campo cria duas paradas de teste em uma data vazia, desliga a conexão, registra medições e foto, reabre o rascunho e mede a passagem para a próxima parada. Depois confirma os dados e a foto no servidor. Para salvar capturas, defina `V4_SCREENSHOTS` como um diretório de saída. Se mudar a porta do Next, defina `TEST_BASE_URL` com a origem local correspondente.
