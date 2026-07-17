import { describe, it, expect } from "vitest";
import {
  validateCPF,
  validateDateBR,
  validateTime,
  validateCEP,
  validatePhoneBR,
  validateEmail,
  sanitizeName,
  preserveLeadingZeros,
} from "../validators";

describe("validateCPF", () => {
  it("aceita CPF válido formatado", () => {
    const r = validateCPF("529.982.247-25");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("529.982.247-25");
  });
  it("aceita CPF válido sem pontuação e normaliza", () => {
    const r = validateCPF("52998224725");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("529.982.247-25");
  });
  it("rejeita dígitos verificadores errados", () => {
    expect(validateCPF("529.982.247-99").ok).toBe(false);
  });
  it("rejeita CPF com todos dígitos iguais", () => {
    expect(validateCPF("111.111.111-11").ok).toBe(false);
    expect(validateCPF("00000000000").ok).toBe(false);
  });
  it("rejeita comprimento incorreto", () => {
    expect(validateCPF("12345").ok).toBe(false);
    expect(validateCPF("").ok).toBe(false);
  });
});

describe("validateDateBR", () => {
  it("aceita DD/MM/AAAA e devolve ISO", () => {
    expect(validateDateBR("15/07/2026")).toEqual({ ok: true, normalized: "2026-07-15" });
  });
  it("aceita separadores - e .", () => {
    expect(validateDateBR("15-07-2026").ok).toBe(true);
    expect(validateDateBR("15.07.2026").ok).toBe(true);
  });
  it("rejeita data impossível (31/02)", () => {
    expect(validateDateBR("31/02/2026").ok).toBe(false);
  });
  it("rejeita mês inválido", () => {
    expect(validateDateBR("10/13/2026").ok).toBe(false);
  });
  it("rejeita formato incorreto", () => {
    expect(validateDateBR("2026-07-15").ok).toBe(false);
  });
  it("aceita bissexto real", () => {
    expect(validateDateBR("29/02/2024").ok).toBe(true);
    expect(validateDateBR("29/02/2023").ok).toBe(false);
  });
});

describe("validateTime", () => {
  it("aceita HH:mm", () => {
    expect(validateTime("08:30")).toEqual({ ok: true, normalized: "08:30" });
  });
  it("normaliza hora de um dígito", () => {
    expect(validateTime("8:05")).toEqual({ ok: true, normalized: "08:05" });
  });
  it("rejeita fora de faixa", () => {
    expect(validateTime("24:00").ok).toBe(false);
    expect(validateTime("10:60").ok).toBe(false);
  });
  it("rejeita formato inválido", () => {
    expect(validateTime("0830").ok).toBe(false);
  });
});

describe("validateCEP", () => {
  it("aceita 8 dígitos e formata", () => {
    expect(validateCEP("01310100")).toEqual({ ok: true, normalized: "01310-100" });
  });
  it("aceita já formatado", () => {
    expect(validateCEP("01310-100").ok).toBe(true);
  });
  it("rejeita menos de 8", () => {
    expect(validateCEP("1234").ok).toBe(false);
  });
});

describe("validatePhoneBR", () => {
  it("aceita celular 11 dígitos", () => {
    expect(validatePhoneBR("11987654321").normalized).toBe("(11) 98765-4321");
  });
  it("aceita fixo 10 dígitos", () => {
    expect(validatePhoneBR("1133334444").normalized).toBe("(11) 3333-4444");
  });
  it("rejeita DDD inválido", () => {
    expect(validatePhoneBR("0987654321").ok).toBe(false);
  });
  it("rejeita comprimento inválido", () => {
    expect(validatePhoneBR("12345").ok).toBe(false);
  });
});

describe("validateEmail", () => {
  it("aceita e normaliza para minúsculas", () => {
    expect(validateEmail("Foo@Bar.com").normalized).toBe("foo@bar.com");
  });
  it("rejeita sem @", () => {
    expect(validateEmail("foo.bar.com").ok).toBe(false);
  });
});

describe("sanitizeName", () => {
  it("colapsa espaços internos e preserva acentos", () => {
    expect(sanitizeName("  João   da   Silva  ").normalized).toBe("João da Silva");
  });
  it("não força uppercase", () => {
    const r = sanitizeName("Maria de Souza");
    expect(r.normalized).toBe("Maria de Souza");
  });
  it("rejeita vazio", () => {
    expect(sanitizeName("   ").ok).toBe(false);
  });
});

describe("preserveLeadingZeros", () => {
  it("preserva zeros à esquerda como string", () => {
    const r = preserveLeadingZeros("00042");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("00042");
  });
  it("rejeita vazio", () => {
    expect(preserveLeadingZeros("").ok).toBe(false);
  });
});
