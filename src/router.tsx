import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: typeof window === "undefined" ? 0 : 2,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload em hover ("intent") disparava loaders/queries a cada passada
    // do mouse sobre um Link, gerando chamadas desnecessárias ao backend.
    // Desligado para reduzir consumo de Run Credits.
    defaultPreload: false,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
