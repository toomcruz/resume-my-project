import { describe, it, expect } from "vitest";
import { getErrorMessage } from "@/lib/error-message";

describe("getErrorMessage", () => {
  const FALLBACK = "algo deu errado";

  describe("happy paths", () => {
    it("returns the message of a real Error instance", () => {
      expect(getErrorMessage(new Error("boom"), FALLBACK)).toBe("boom");
    });

    it("returns the message of a subclass of Error", () => {
      class DomainError extends Error {}
      expect(getErrorMessage(new DomainError("custom"), FALLBACK)).toBe("custom");
    });
  });

  describe("edge cases", () => {
    it("returns fallback for Error with empty message", () => {
      expect(getErrorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
    });

    it.each([
      ["string", "just a string"],
      ["number", 42],
      ["object literal", { message: "not an Error" }],
      ["null", null],
      ["undefined", undefined],
      ["boolean", true],
    ])("returns fallback for non-Error input (%s)", (_label, value) => {
      expect(getErrorMessage(value, FALLBACK)).toBe(FALLBACK);
    });

    it("does not confuse an object with a message field for an Error", () => {
      expect(getErrorMessage({ message: "fake" }, FALLBACK)).toBe(FALLBACK);
    });
  });
});
