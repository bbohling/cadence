import { useNavigate, useSearch } from "@tanstack/react-router";
import { ClimbsPanel } from "@/components/efforts/climbs-panel";
import { RoutesPanel } from "@/components/efforts/routes-panel";
import { PowerCurvePanel } from "@/components/efforts/power-curve";
import { cn } from "@/lib/utils";

/**
 * Efforts — how you ride the same hills and loops over the years, and the
 * power you can hold. All three views come from track data (full-resolution
 * recordings), not Strava summaries.
 */

export const EFFORT_TABS = ["climbs", "routes", "power"] as const;
export type EffortTab = (typeof EFFORT_TABS)[number];

const LABELS: Record<EffortTab, string> = {
  climbs: "Climbs",
  routes: "Routes",
  power: "Power",
};

export function EffortsPage() {
  const { tab, climb } = useSearch({ from: "/efforts" });
  const navigate = useNavigate({ from: "/efforts" });

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex gap-1 p-1 rounded-lg bg-slate-900/60 border border-slate-800 self-start">
        {EFFORT_TABS.map((t) => (
          <button
            key={t}
            onClick={() => navigate({ search: { tab: t }, replace: true })}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === t ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "climbs" && <ClimbsPanel initialClimbId={climb} />}
      {tab === "routes" && <RoutesPanel />}
      {tab === "power" && <PowerCurvePanel />}
    </div>
  );
}
