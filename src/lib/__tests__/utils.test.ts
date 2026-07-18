import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (className merger)", () => {
  describe("happy paths", () => {
    it("joins simple class strings", () => {
      expect(cn("a", "b", "c")).toBe("a b c");
    });

    it("resolves tailwind conflicts keeping the last value", () => {
      expect(cn("p-2", "p-4")).toBe("p-4");
    });

    it("supports conditional objects", () => {
      expect(cn("base", { active: true, disabled: false })).toBe("base active");
    });

    it("supports arrays of classes", () => {
      expect(cn(["a", "b"], ["c"])).toBe("a b c");
    });
  });

  describe("edge cases", () => {
    it.each([
      [undefined],
      [null],
      [false],
      [""],
      [0],
    ])("ignores falsy value %p", (value) => {
      expect(cn("keep", value as never)).toBe("keep");
    });

    it("returns empty string with no args", () => {
      expect(cn()).toBe("");
    });

    it("deduplicates by tailwind semantics, not literal identity", () => {
      // clsx would repeat, twMerge removes semantic duplicates
      expect(cn("text-sm", "text-sm")).toBe("text-sm");
    });

    it("preserves non-conflicting utility classes", () => {
      const result = cn("mt-2", "text-red-500", "mt-4");
      expect(result).toContain("text-red-500");
      expect(result).toContain("mt-4");
      expect(result).not.toContain("mt-2");
    });
  });
});
