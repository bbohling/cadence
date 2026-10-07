import { createRootRoute, createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { RootLayout } from "./root-layout";
import { DashboardPage } from "./dashboard";
import { PixelsPage } from "./pixels";
import { RingsPage } from "./rings";
import { InfographicPage } from "./infographic";
import { PlashPage } from "./plash";
import { EffortsPage, EFFORT_TABS, type EffortTab } from "./efforts";

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
 *   /map          → Personal heatmap of every outdoor ride
 *   /ride/$id     → Ride detail (map + stats)
 *   /efforts      → Climbs, routes and power curve (?tab=climbs|routes|power)
 *
 * /map and /ride load lazily so maplibre-gl stays out of the main bundle.
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

// Personal heatmap
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  component: lazyRouteComponent(() => import("./map"), "MapPage"),
});

// Ride detail
const rideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ride/$id",
  component: lazyRouteComponent(() => import("./ride"), "RidePage"),
});

// Climbs, routes, power curve
const effortsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/efforts",
  component: EffortsPage,
  validateSearch: (search: Record<string, unknown>): { tab: EffortTab; climb?: number } => ({
    tab: EFFORT_TABS.includes(search.tab as EffortTab) ? (search.tab as EffortTab) : "climbs",
    // Preselects a climb when arriving from a ride page
    climb: Number.isSafeInteger(Number(search.climb)) && Number(search.climb) > 0 ? Number(search.climb) : undefined,
  }),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  pixelsRoute,
  ringsRoute,
  infographicRoute,
  plashRoute,
  mapRoute,
  rideRoute,
  effortsRoute,
]);
