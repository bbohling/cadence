import { createRootRoute, createRoute } from "@tanstack/react-router";
import { RootLayout } from "./root-layout";
import { DashboardPage } from "./dashboard";
import { PixelsPage } from "./pixels";
import { RingsPage } from "./rings";
import { InfographicPage } from "./infographic";
import { PlashPage } from "./plash";

/**
 * Route tree definition.
 *
 * TanStack Router uses a tree structure where each route
 * declares its path and component. The root route wraps
 * everything with the shared layout (nav, sync banner, etc.).
 *
 * Routes:
 *   /             → Main dashboard (progress rings, yearly stats, KOMs)
 *   /pixels       → ASCII/terminal-style dashboard
 *   /rings        → Compact progress rings overlay
 *   /infographic  → Year-in-review infographic generator
 *   /plash        → Yearly highlights wallpaper for Plash (hidden, no nav)
 */

// Root layout wraps all routes
const rootRoute = createRootRoute({
  component: RootLayout,
});

// Main dashboard
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

// ASCII/terminal dashboard
const pixelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pixels",
  component: PixelsPage,
});

// Compact rings view
const ringsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rings",
  component: RingsPage,
});

// Year-in-review infographic
const infographicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/infographic",
  component: InfographicPage,
});

// Desktop wallpaper (Plash) — deliberately not linked from the nav
const plashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plash",
  component: PlashPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  pixelsRoute,
  ringsRoute,
  infographicRoute,
  plashRoute,
]);
