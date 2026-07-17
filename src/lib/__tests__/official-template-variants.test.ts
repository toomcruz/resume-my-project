// Regressões dos modelos oficiais reconstruídos para impressão.
import { describe, expect, it } from "vitest";
import {
  applyOfficialTemplateAliases,
  getOfficialInstallVariants,
  isTemplateApplicable,
  type OfficialTemplateCatalogItem,
} from "../official-templates";

function catalogItem(
  id: string,
  arquivo: string,
  contextos: string[],
): OfficialTemplateCatalogItem {
  return {
    id,
    nome: id,
    processo: id,
    arquivo,
    formato: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    origem: "oficial",
    ativo: true,
    placeholders: ["nomeFal"],
    placeholderAliases: { nomeFalecido: "nomeFal" },
    contextos,
    tamanhoBytes: 1,
    sha256: "test",
    paginas: 1,
  };
}

function officialPath(storageId: string): string {
  return `user-id/official/${storageId}.docx`;
}

describe("official template print variants", () => {
  it("installs separate burial and exhumation variants for quadra geral and jazigo", () => {
    const burial = getOfficialInstallVariants(
      catalogItem("ordem-sepultamento", "sepultamento/ordem-sepultamento.docx", [
        "quadra_geral",
        "jazigo",
      ]),
    );
    const exhumation = getOfficialInstallVariants(
      catalogItem("ordem-exumacao", "exumacao/ordem-exumacao.docx", ["quadra_geral", "jazigo"]),
    );

    expect(burial.map((item) => item.storageId)).toEqual([
      "ordem-sepultamento",
      "ordem-sepultamento-jazigo",
    ]);
    expect(exhumation.map((item) => item.storageId)).toEqual([
      "ordem-exumacao",
      "ordem-exumacao-jazigo",
    ]);
  });

  it("shows only the location-specific burial and exhumation template", () => {
    expect(
      isTemplateApplicable(
        {
          process: "sepultamento",
          storage_path: officialPath("ordem-sepultamento"),
        },
        { process: "sepultamento", subprocess: "quadra_geral" },
      ),
    ).toBe(true);
    expect(
      isTemplateApplicable(
        {
          process: "sepultamento",
          storage_path: officialPath("ordem-sepultamento-jazigo"),
        },
        { process: "sepultamento", subprocess: "quadra_geral" },
      ),
    ).toBe(false);
    expect(
      isTemplateApplicable(
        {
          process: "exumacao",
          storage_path: officialPath("ordem-exumacao-jazigo"),
        },
        { process: "exumacao", subprocess: "jazigo" },
      ),
    ).toBe(true);
  });

  it("uses acquisition for first rental and a separate document for renewal", () => {
    const variants = getOfficialInstallVariants(
      catalogItem("aquisicao-renovacao-ossuario", "ossuario/aquisicao-renovacao-ossuario.docx", [
        "aluguel",
        "aquisicao",
        "renovacao",
      ]),
    );

    expect(variants.map((item) => item.storageId)).toEqual([
      "aquisicao-renovacao-ossuario",
      "aquisicao-renovacao-ossuario-renovacao",
    ]);
    expect(
      isTemplateApplicable(
        {
          process: "ossario",
          storage_path: officialPath("aquisicao-renovacao-ossuario"),
        },
        { process: "ossario", subprocess: "aluguel" },
      ),
    ).toBe(true);
    expect(
      isTemplateApplicable(
        {
          process: "ossario",
          storage_path: officialPath("aquisicao-renovacao-ossuario-renovacao"),
        },
        { process: "ossario", subprocess: "renovacao" },
      ),
    ).toBe(true);
    expect(
      isTemplateApplicable(
        {
          process: "ossario",
          storage_path: officialPath("aquisicao-renovacao-ossuario"),
        },
        { process: "ossario", subprocess: "renovacao" },
      ),
    ).toBe(false);
  });

  it("maps plate, book and page fields into both ossuary variants", () => {
    const output = applyOfficialTemplateAliases(
      {
        placa_identificacao: "100936",
        livro: "58",
        folha: "166",
      },
      officialPath("aquisicao-renovacao-ossuario-renovacao"),
    );

    expect(output).toMatchObject({
      placa: "100936",
      livro: "58",
      folha: "166",
    });
  });
});
