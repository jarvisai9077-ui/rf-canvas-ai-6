// One QueryClient for the whole app; the provider in app/_layout.tsx uses
// this instance. Import it for cache calls outside components, for example
// queryClient.invalidateQueries or setQueryData in websocket or push
// handlers; inside components useQueryClient() returns this same instance.
import { QueryClient } from "@tanstack/react-query";

// Offline-first app: fail fast, show cached data, and never refetch-spin on focus.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false, networkMode: "offlineFirst" },
    mutations: { retry: 0, networkMode: "offlineFirst" },
  },
});
