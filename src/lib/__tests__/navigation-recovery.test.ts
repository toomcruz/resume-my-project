import { describe, expect, it } from "vitest";
import {
  NAVIGATION_RELOAD_COOLDOWN_MS,
  canReloadNavigation,
  isDynamicImportLoadError,
  navigationErrorMessage,
} from "@/lib/navigation-recovery";

describe("navigation recovery", () => {
  it("recognizes Vite dynamic import failures", () => {
    expect(
      isDynamicImportLoadError(
        new TypeError("Failed to fetch dynamically imported module: /assets/agenda.js"),
      ),
    ).toBe(true);
    expect(isDynamicImportLoadError(new Error("Loading chunk 42 failed"))).toBe(true);
    expect(isDynamicImportLoadError(new Error("Importing a module script failed"))).toBe(true);
  });

  it("does not treat ordinary API errors as stale assets", () => {
    expect(isDynamicImportLoadError(new Error("new row violates row-level security policy"))).toBe(
      false,
    );
  });

  it("normalizes unknown error values", () => {
    expect(navigationErrorMessage("network failed")).toBe("network failed");
    expect(navigationErrorMessage({ message: "route failed" })).toBe("route failed");
  });

  it("allows only one automatic reload during the cooldown", () => {
    const now = 100_000;
    expect(canReloadNavigation(null, now)).toBe(true);
    expect(canReloadNavigation(String(now - 1_000), now)).toBe(false);
    expect(canReloadNavigation(String(now - NAVIGATION_RELOAD_COOLDOWN_MS), now)).toBe(true);
    expect(canReloadNavigation("invalid", now)).toBe(true);
  });
});
