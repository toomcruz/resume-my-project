const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "chunkloaderror",
  "loading chunk",
  "module script failed",
] as const;

const RELOAD_STORAGE_KEY = "autofill-helper:last-navigation-reload";
export const NAVIGATION_RELOAD_COOLDOWN_MS = 15_000;

export function navigationErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

export function isDynamicImportLoadError(error: unknown): boolean {
  const message = navigationErrorMessage(error).toLocaleLowerCase("en-US");
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function canReloadNavigation(
  lastReloadValue: string | null,
  now = Date.now(),
  cooldownMs = NAVIGATION_RELOAD_COOLDOWN_MS,
): boolean {
  if (!lastReloadValue) return true;
  const lastReload = Number.parseInt(lastReloadValue, 10);
  if (!Number.isFinite(lastReload)) return true;
  return now - lastReload >= cooldownMs;
}

function markNavigationReload(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const lastReload = window.sessionStorage.getItem(RELOAD_STORAGE_KEY);
    if (!canReloadNavigation(lastReload)) return false;
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

export function reloadForDynamicImportError(error: unknown): boolean {
  if (typeof window === "undefined" || !isDynamicImportLoadError(error)) return false;
  if (!markNavigationReload()) return false;
  window.location.reload();
  return true;
}

export function registerVitePreloadRecovery(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handlePreloadError = (event: Event) => {
    if (!markNavigationReload()) return;

    event.preventDefault();
    window.location.reload();
  };

  window.addEventListener("vite:preloadError", handlePreloadError);
  return () => window.removeEventListener("vite:preloadError", handlePreloadError);
}
