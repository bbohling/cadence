import { Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, MonitorDot, Image } from "lucide-react";
import { useEnsureFresh } from "@/hooks/use-ensure-fresh";
import { cn } from "@/lib/utils";

/**
 * Root layout — wraps all pages with navigation and sync status.
 *
 * Shows:
 * - Top navigation bar (logo; route links on sm+)
 * - Bottom tab bar on mobile, within thumb reach
 * - Sync banner when data is being updated from Strava
 * - The active page via <Outlet />
 *
 * Bare pages (/rings, /plash) are ambient displays with their own
 * full-screen layout and no navigation.
 */

const USER_ID = "brandon";

/** Pages rendered without nav chrome — not linked from anywhere */
const BARE_PATHS = new Set(["/rings", "/plash"]);

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/pixels", label: "Pixels", icon: MonitorDot },
  { to: "/infographic", label: "Infographic", icon: Image },
] as const;

export function RootLayout() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  if (BARE_PATHS.has(currentPath)) {
    return <Outlet />;
  }

  return <AppShell currentPath={currentPath} />;
}

function AppShell({ currentPath }: { currentPath: string }) {
  const { isSyncing } = useEnsureFresh(USER_ID);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ── Navigation ───────────────────────────────── */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        {/* Sync banner lives inside the sticky header so it stays visible while scrolling */}
        {isSyncing && (
          <div className="bg-strava/90 text-white text-center py-1.5 px-4 text-xs sm:text-sm font-medium animate-pulse-soft">
            <Activity className="inline-block w-4 h-4 mr-2 animate-spin" />
            Updating from Strava…
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14">
            <Link to="/" className="flex items-center gap-2 text-white font-semibold">
              <Activity className="w-5 h-5 text-brand-400" />
              <span className="text-lg">Cadence</span>
            </Link>

            {/* Nav links — desktop; mobile uses the bottom tab bar */}
            <div className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    currentPath === to
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page Content ─────────────────────────────── */}
      {/* Bottom padding on mobile clears the fixed tab bar */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <Outlet />
      </main>

      {/* ── Mobile Tab Bar ───────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = currentPath === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-14 text-[11px] font-medium transition-colors",
                  active ? "text-brand-400" : "text-slate-500 active:text-slate-300"
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
