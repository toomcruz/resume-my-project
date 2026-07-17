import { describe, it, expect } from "vitest";
import {
  validateCpf,
  validateDate,
  validatePhone,
  validateCep,
  validateEmail,
  validateTime,
  normalizeName,
  normalizeAdministrativeId,
} from "../validators";

describe("validateCpf", () => {
  it("aceita CPF válido com pontuação", () => {
    const r = validateCpf("529.982.247-25");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("52998224725");
    expect(r.display).toBe("529.982.247-25");
  });

  it("rejeita CPF com 11 dígitos repetidos", () => {
    expect(validateCpf("111.111.111-11").valid).toBe(false);
  });

  it("rejeita CPF com DV incorreto", () => {
    expect(validateCpf("123.456.789-00").valid).toBe(false);
  });

  it("rejeita CPF com menos de 11 dígitos", () => {
    expect(validateCpf("123").valid).toBe(false);
  });
});

describe("validateDate", () => {
  it("aceita DD/MM/YYYY", () => {
    const r = validateDate("15/03/2024");
    expect(r.valid).toBe(true);
    expect(r.isoDate).toBe("2024-03-15");
    expect(r.display).toBe("15/03/2024");
  });

  it("aceita YYYY-MM-DD", () => {
    const r = validateDate("2024-03-15");
    expect(r.valid).toBe(true);
    expect(r.isoDate).toBe("2024-03-15");
  });

  it("rejeita data impossível (30/02)", () => {
    expect(validateDate("30/02/2024").valid).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(validateDate("").valid).toBe(false);
  });
});

describe("validatePhone", () => {
  it("aceita celular com 11 dígitos", () => {
    const r = validatePhone("(11) 98765-4321");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("11987654321");
    expect(r.display).toBe("(11) 98765-4321");
  });

  it("aceita fixo com 10 dígitos", () => {
    expect(validatePhone("1133334444").valid).toBe(true);
  });

  it("rejeita 9 dígitos", () => {
    expect(validatePhone("113334444").valid).toBe(false);
  });
});

describe("validateCep", () => {
  it("aceita 8 dígitos", () => {
    const r = validateCep("01310-100");
    expect(r.valid).toBe(true);
    expect(r.display).toBe("01310-100");
  });
  it("rejeita 7 dígitos", () => {
    expect(validateCep("1310100").valid).toBe(false);
  });
});

describe("validateEmail", () => {
  it("aceita formato válido", () => {
    expect(validateEmail("teste@exemplo.com").valid).toBe(true);
  });
  it("rejeita sem @", () => {
    expect(validateEmail("teste.com").valid).toBe(false);
  });
});

describe("validateTime", () => {
  it("aceita HH:mm", () => {
    const r = validateTime("9:30");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("09:30");
  });
  it("rejeita hora inválida", () => {
    expect(validateTime("25:00").valid).toBe(false);
  });
});

describe("normalizeName", () => {
  it("preserva acentos", () => {
    expect(normalizeName("  João  Pedro   Vasco  ")).toBe("João Pedro Vasco");
  });
});

describe("normalizeAdministrativeId — preserva zeros à esquerda", () => {
  it("mantém '004582' como string", () => {
    const r = normalizeAdministrativeId("004582");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("004582");
  });
  it("rejeita letras quando não permitido", () => {
    expect(normalizeAdministrativeId("00A582").valid).toBe(false);
  });
  it("aceita alfanumérico quando permitido", () => {
    const r = normalizeAdministrativeId("A-45", { allowAlphanumeric: true });
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("A-45");
  });
});
