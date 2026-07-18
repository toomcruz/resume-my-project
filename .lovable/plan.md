## Objetivo

Adicionar ao Scanne um módulo que classifica documentos (Declaração de Óbito, Nota de Contratação, Desconhecido), extrai campos estruturados por tipo, funde tudo num único `ProcessoFunerario`, detecta divergências e oferece uma tela de conferência lado-a-lado. Sem remover nada do fluxo atual — o novo módulo vive ao lado do pipeline de vision existente e é opt-in por atendimento.

## Escopo e princípios

- Reaproveitar: `extractFromImages` (gateway IA), `attendance_images`, `attendances`, `document-templates`, `requireSupabaseAuth`, Zod, TanStack Query, shadcn/ui, tokens semânticos.
- Não tocar: `client.ts`, `client.server.ts`, `auth-*`, `types.ts`, `.env`, regras já validadas de triagem/sepultamento/exumação, geração de DOCX, agenda.
- Segurança: RLS + GRANTs em toda tabela nova; nenhum CPF/RG em log; buckets já privados; URLs assinadas.

## Arquivos a criar

**Domínio / serviços (`src/lib/funeral-docs/`)**
- `types.ts` — `ProcessoFunerario`, `Falecido`, `Responsavel`, `Contratante`, `DadosSepultamento`, `DadosVelorio`, `DadosContratacao`, `ItemContratado`, `Divergencia`, `DocumentoFonte`, `PadraoFuneral`, enums.
- `normalizers.ts` — nome, CPF, RG, telefone, data, hora, moeda, parentesco. Guarda `{ original, normalized, confidence }`.
- `document-classifier.ts` — classifica por título + keywords + campos. Retorna `{ tipo, confianca, motivo, alternativas }`. Baixa confiança → `DOCUMENTO_DESCONHECIDO`.
- `extractors/death-declaration.ts` — schema Zod + prompt específico para Declaração de Óbito (todos os grupos da §3).
- `extractors/funeral-contract.ts` — schema Zod + prompt para Nota de Contratação (§4).
- `padrao-funeral.ts` — classifica PADRÃO/LUXO/SUPER_LUXO/CREMAÇÃO/DOADOR/GRATUITO a partir dos itens (§5). Nunca por valor.
- `person-matcher.ts` — dedup de falecido por nome normalizado + nascimento + óbito + CPF + mãe + nº DO.
- `process-merger.ts` — funde documentos num único `ProcessoFunerario` respeitando prioridades (§6). Não sobrescreve; correção manual > OCR.
- `discrepancy-detector.ts` — compara campos entre docs, gera `Divergencia[]` com status PENDENTE.
- `required-fields.ts` — config central de obrigatórios por tipo de processo (sepultamento, exumação — este permite 2 falecidos).
- `feedback-store.ts` — registra correção manual (tipo doc, campo, original, extraído, correto, coordenadas, modelo, data).

**Server functions (`src/lib/funeral-docs/*.functions.ts`)**
- `classify-and-extract.functions.ts` — recebe `attendanceId`, baixa `attendance_images`, roda classifier + extractor apropriado por imagem, persiste em `funeral_documents` + `funeral_processes`, retorna processo consolidado. Middleware `requireSupabaseAuth`. Zod input. Timeout 20s por imagem, sequencial com `Promise.allSettled` limitado.
- `confirm-field.functions.ts` — grava correção manual (prevalece sobre OCR) e loga em `funeral_field_feedback`.
- `resolve-discrepancy.functions.ts` — resolve divergência (CONFIRMADO/DESCARTADO + valor final).

**UI (`src/routes/_authed.processo.$id.tsx` + componentes)**
- Rota nova, não interfere no atendimento atual — link opcional a partir do card do atendimento.
- `src/components/funeral-docs/DocumentViewer.tsx` — lado esquerdo: imagem/PDF, zoom, rotação, navegação, highlight de região (se disponível).
- `src/components/funeral-docs/FieldsPanel.tsx` — lado direito, seções: Falecido, Responsável, Contratante, Sepultamento, Velório, Contratação, Itens, Pendências, Divergências.
- `src/components/funeral-docs/FieldRow.tsx` — valor, origem, confiança, badge de estado (verde/amarelo/vermelho/cinza), botões localizar/editar/confirmar.
- `src/components/funeral-docs/DiscrepancyDialog.tsx` — resolve divergência manualmente.
- Framer Motion suave, tokens semânticos, mobile-first (viewer vira acordeão em <md).

## Banco de dados (migration única)

- `funeral_processes` — id, user_id, attendance_id (FK opcional), tipo_processo, status, dados_json, created_at, updated_at.
- `funeral_deceased` — id, process_id (FK cascade), papel ('principal' | 'exumado' | 'relacionado'), dados_json (nome, CPF, mãe, nascimento, óbito etc).
- `funeral_documents` — id, process_id, attendance_image_id (FK), tipo_documento, classificacao_confianca, dados_extraidos_json, created_at.
- `funeral_discrepancies` — id, process_id, campo, valor_a, valor_b, doc_a_id, doc_b_id, confianca, sugestao, valor_final, status ('PENDENTE'|'CONFIRMADO'|'DESCARTADO'), resolvido_por, resolvido_em.
- `funeral_field_feedback` — id, user_id, process_id, tipo_documento, campo, valor_extraido, valor_correto, coordenadas_json, modelo, created_at.
- `funeral_audit_log` — id, user_id, process_id, acao, payload_json (mascarado), created_at.

Cada tabela: `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated; GRANT ALL ... TO service_role;` + RLS `auth.uid() = user_id` (ou via join com process → user). Sem grant para `anon`.

## Testes (`__tests__/`)

Um por regra crítica da §14:
- classificação DO / Nota / desconhecido
- dedup de falecido (mesmo em 2 docs)
- exumação com 2 falecidos e papéis distintos
- declarante = responsável principal
- contratante ≠ declarante
- grau de parentesco do declarante
- extração nº contratação
- padrão do funeral por itens (não por valor)
- divergência de datas / nomes
- campo ausente / baixa confiança
- correção manual prevalece
- normalizadores (CPF, nome, data, moeda, parentesco)
- CPF/RG nunca aparecem em logs (spy no logger)

Dados sempre anonimizados/fictícios.

## Segurança

- RLS obrigatório em todas as tabelas novas.
- `funeral_audit_log` grava payload mascarado (CPF `***.***.***-XX`, RG parcial).
- Nenhum `console.log` de campo sensível; wrapper `logSafe()` em `funeral-docs/logger.ts`.
- URLs de imagem sempre via `createSignedUrl` (300s) reusando `getSignedUrl`.
- Buckets já privados — não alterar.

## Detalhes técnicos

- Extractors: um `createServerFn` por tipo, mas ambos delegam a `extractFromImages` com `response_format: json_object` e schema Zod específico. Prompt inclui lista de campos exatos.
- Merger é puro (sem I/O) → 100% testável.
- `ProcessoFunerario` guardado como JSON em `funeral_processes.dados_json` + colunas indexadas para busca (nome, cpf hash).
- Nenhuma nova dependência npm — usa `zod`, `@supabase/*`, `framer-motion`, `lucide-react` já instalados.

## Entrega

- Rodar `bun run lint`, `bunx vitest run`, build automático do harness.
- Listar arquivos alterados + migration criada + limitações do OCR (dependência do gateway, campos manuscritos, imagens de baixa resolução).
- Não publicar, não fazer deploy.

## Fora de escopo (confirmar depois)

- OCR de coordenadas por caractere (highlight preciso) — versão 1 destaca a imagem inteira do doc de origem; bounding boxes ficam para v2.
- Aprendizado automático — só coleta de feedback, sem retraining.
