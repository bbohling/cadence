import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routes/-route-tree";
import "./index.css";

/**
 * Application entry point.
 *
 * Sets up:
 * 1. TanStack Query — server-state caching for API calls
 * 2. TanStack Router — type-safe file-based routing
 * 3. React 19 — with StrictMode for development checks
 */

// ── Query Client ───────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Cache API responses for 5 minutes.
       * Report data doesn't change often, so this reduces
       * unnecessary network requests.
       */
      staleTime: 5 * 60 * 1000,
      /** Show cached data while refetching in the background */
      refetchOnWindowFocus: false,
    },
  },
});

// ── Router ─────────────────────────────────────────────

const router = createRouter({
  routeTree,
  context: { queryClient },
  /**
   * Scroll to top on navigation.
   * This prevents the page from staying scrolled down
   * when switching between dashboard views.
   */
  defaultPreload: "intent",
});

// Type-safe router declaration (enables useRouter() typing)
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// ── Render ─────────────────────────────────────────────

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
