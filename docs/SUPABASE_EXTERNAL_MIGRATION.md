# Migração do schema para o Supabase externo

Projeto de destino: `geprepccebxpdbhokuyl`

Este fluxo aplica somente a estrutura definida em:

`supabase/migration_supabase_externo.sql`

Não migra usuários, dados ou arquivos do Storage.

## Segurança

- O workflow é manual.
- Exige digitar exatamente o Project Ref `geprepccebxpdbhokuyl`.
- Usa o ambiente GitHub `supabase-external`.
- A conexão com o banco fica no secret `SUPABASE_EXTERNAL_DB_URL`.
- Nenhuma chave deve ser gravada no repositório.

## Configuração necessária no GitHub

1. Abra **Settings → Environments**.
2. Crie o ambiente `supabase-external`.
3. Abra **Environment secrets**.
4. Crie o secret `SUPABASE_EXTERNAL_DB_URL` com a connection string PostgreSQL do projeto externo.
5. Recomenda-se configurar aprovação obrigatória no ambiente antes da execução.

## Execução

1. Abra **Actions**.
2. Selecione **Aplicar schema no Supabase externo**.
3. Clique em **Run workflow**.
4. Digite `geprepccebxpdbhokuyl` no campo de confirmação.
5. Execute o workflow.

O job falha imediatamente caso o SQL gere erro. Ao final, ele verifica se as 14 tabelas e os 3 buckets privados esperados foram criados.

## Não fazer nesta fase

- Não alterar `.env`.
- Não desconectar o Lovable Cloud atual.
- Não migrar usuários, dados ou arquivos ainda.
- Não usar a `service_role` no frontend.
