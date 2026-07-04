import { Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, MonitorDot, Image } from "lucide-react";
import { useEnsureFresh } from "@/hooks/use-ensure-fresh";
import { cn } from "@/lib/utils";

/**
 * Root layout — wraps all pages with navigation and sync status.
 *
 * Shows:
 * - Top navigation bar with route links
 * - Sync banner when data is being updated from Strava
 * - The active page via <Outlet />
 */

const USER_ID = "brandon";

export function RootLayout() {
  const { isSyncing } = useEnsureFresh(USER_ID);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Rings page has its own minimal layout
  if (currentPath === "/rings") {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* ── Sync Banner ──────────────────────────────── */}
      {isSyncing && (
        <div className="bg-strava/90 text-white text-center py-2 px-4 text-sm font-medium animate-pulse-soft">
          <Activity className="inline-block w-4 h-4 mr-2 animate-spin" />
          Updating from Strava…
        </div>
      )}

      {/* ── Navigation ───────────────────────────────── */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 text-white font-semibold">
              <Activity className="w-5 h-5 text-brand-400" />
              <span className="text-lg">Cadence</span>
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-1">
              <NavLink to="/" icon={<BarChart3 className="w-4 h-4" />} label="Dashboard" active={currentPath === "/"} />
              <NavLink to="/pixels" icon={<MonitorDot className="w-4 h-4" />} label="Pixels" active={currentPath === "/pixels"} />
              {/* <NavLink to="/rings" icon={<Circle className="w-4 h-4" />} label="Rings" active={currentPath === "/rings"} /> */}
              <NavLink to="/infographic" icon={<Image className="w-4 h-4" />} label="Infographic" active={currentPath === "/infographic"} />
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page Content ─────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Navigation link with active state */
function NavLink({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
