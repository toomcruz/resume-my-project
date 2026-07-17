# Triagem acelerada por botões — Ordem de Sepultamento

Reduzir a digitação da triagem transformando os campos-chave em botões, salvando as escolhas em `subprocess_details` (mesma estrutura já existente) e reaproveitando esses dados na geração do DOCX.

## Escopo (só o processo Sepultamento)

Nenhuma outra jornada (Exumação, Ossário, Translado, Atualização Cadastral) é tocada.

## 1. UI — `src/routes/_authed.atendimento.novo.tsx`

Nova seção "Triagem rápida" (só quando `processKey === "sepultamento"`), substituindo os inputs livres correspondentes, na ordem:

1. **Local do sepultamento** — dois botões grandes: `QUADRA GERAL` / `JAZIGO`. Grava em `subprocess` (já existente). Ao selecionar, também grava em `extras`:
   - `QUADRA GERAL` → `concessao="NAO"`, `quadra_geral_gaveta="SIM"`
   - `JAZIGO` → `concessao="SIM"`, `quadra_geral_gaveta="NAO"`
2. **Data do sepultamento** — botões `HOJE`, `AMANHÃ`, `+2 DIAS`, `OUTRA DATA` (Popover + shadcn Calendar). Preenche `data_agendada` em ISO e exibe abaixo em `DD/MM/AAAA`.
3. **Horário do sepultamento** — botões `10:00 … 17:00`, seleção única, grava `hora_sepultamento`.
4. **Sala do velório** — botões `A`,`B`,`C`,`D`,`E`,`F`,`SEM VELÓRIO`. Grava `sala_velorio` com a letra; `SEM VELÓRIO` grava string vazia + flag `sem_velorio="SIM"`.
5. **Placa de identificação** — Input editável + botão `LER DO PRINT` (abre file input aceitando 1 imagem). Chama nova server fn `readPlacaFromImage` que reusa `extractFromImages` (`fields:["placa_identificacao"]`, contexto "Placa de identificação"). Mostra "Placa encontrada: XXXXX" + `CONFIRMAR`/`CORRIGIR`. Só grava em `placa_identificacao` após confirmar; se falhar, mantém edição manual. Não obrigatória.

Botão destacado usa `variant="default"` quando selecionado, `variant="outline"` caso contrário.

### Validação de "Confirmar triagem"

Antes de avançar para upload:
- `subprocess` presente,
- `data_agendada` presente,
- `hora_sepultamento` presente,
- `sala_velorio` OU `sem_velorio="SIM"` presente.

Placa não bloqueia. Mensagens via `toast.error`.

## 2. Persistência

Tudo já vive em `subprocess`/`subprocess_details` (colunas existentes em `attendances`). Nenhuma migration nova. Ao voltar ao atendimento (`_authed.atendimento.$id.tsx`), os valores continuam disponíveis via `att.subprocess_details`.

## 3. Integração com DOCX

Em `src/lib/attendances.functions.ts` (generateDocument), ao montar o `data` do placeholder para `ordem-sepultamento`, priorizar valores de `subprocess_details` sobre `extracted_data` para as chaves-alvo:

- `sala_velorio`, `data_sepultamento` ← `data_agendada`, `horario_sepultamento` ← `hora_sepultamento`, `placa_identificacao` (só se confirmada).
- Novos placeholders só se já existirem no modelo: `concessao`, `quadra_geral_gaveta`. Se o modelo não declara o placeholder, é ignorado silenciosamente (`nullGetter` já retorna `""`).

Placeholders já existentes (ver `template-payload.ts` para `ordem-sepultamento`): `nomeFal, sala, dataSep, horaSep, placa`, etc. — mapear os novos `concessao` / `quadra_geral_gaveta` **apenas se o template oficial declarar**; senão fica no-op.

## 4. Fonte/formatação DOCX

Sem mudança de estilo automático — o `fillDocx` atual não reduz fonte. Apenas garantir `paragraphLoop: true` (já ativo) e `linebreaks: true` (já ativo) permitem quebra em nomes longos.

## 5. Testes (`vitest`)

Novo arquivo `src/lib/__tests__/triagem-sepultamento.test.ts` cobrindo helpers puros:

- `applyLocalSepultamento("quadra_geral")` → `{ concessao:"NAO", quadra_geral_gaveta:"SIM" }`
- `applyLocalSepultamento("jazigo")` → `{ concessao:"SIM", quadra_geral_gaveta:"NAO" }`
- `computeQuickDate("hoje"|"amanha"|"+2")` retornam datas corretas
- validação de triagem falha sem sala e sem `sem_velorio`
- placa não confirmada não aparece no payload

## 6. Arquivos alterados

- `src/lib/triagem-sepultamento.ts` (novo) — helpers puros: `LOCAL_SEPULTAMENTO_MAP`, `computeQuickDate`, `HORARIOS`, `SALAS`, `validateTriagem`.
- `src/lib/__tests__/triagem-sepultamento.test.ts` (novo).
- `src/lib/vision/read-placa.functions.ts` (novo) — server fn `readPlacaFromImage(base64)` chamando `extractFromImages`.
- `src/routes/_authed.atendimento.novo.tsx` — renderiza `<TriagemSepultamento/>` quando processo é sepultamento; oculta os campos livres equivalentes já existentes.
- `src/lib/attendances.functions.ts` — merge `subprocess_details` no payload do modelo, sem sobrescrever campos já preenchidos manualmente na revisão.

## 7. Restrições respeitadas

- Sem alteração em autenticação, RLS, edge functions, ou outros modelos.
- Sem nova tabela.
- Sem publicação.
- Ao final: `bun test`, `bun run typecheck`, `bun run build` (o harness roda automaticamente).
