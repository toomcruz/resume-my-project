# Correções de layout dos modelos oficiais

Esta atualização corrige e valida os modelos DOCX oficiais diretamente pelo GitHub.

## Regras aplicadas

- todas as páginas em A4;
- uma página por documento;
- margens seguras para impressão;
- fontes mínimas legíveis;
- linhas de tabela sem altura fixa, evitando corte de textos longos;
- Condolências em uma única folha e sem campo Sala;
- Identificação da Sala de Velório centralizada e ampliada;
- Memorando de Translado convertido de Carta para A4;
- Ordens identificadas por Jazigo ou Quadra Geral;
- Ossuário com Aquisição ou Renovação marcada e inscrição GSCEMI;
- Termos com Sepultamento ou Exumação marcados corretamente;
- validação automática por renderização em PDF antes de gravar os DOCX.

A implementação está em `scripts/fix_all_official_docx_layouts.py` e a execução automática em `.github/workflows/fix-all-official-docx-layouts.yml`.
