import { YearProgressRings } from "@/components/dashboard/year-progress-rings";
import { YearlyStatsChart } from "@/components/dashboard/yearly-stats";
import { KomTimeline } from "@/components/dashboard/kom-timeline";
import { KomPlaceCounts } from "@/components/dashboard/kom-place-counts";
import { KomCurrentRanks } from "@/components/dashboard/kom-current-ranks";
import { GearUsageCard } from "@/components/dashboard/gear-usage";
import { ActivityTypeChart } from "@/components/dashboard/activity-type-breakdown";

/**
 * Main Dashboard page.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  Year Progress Rings (full width)            │
 *   ├──────────────────────────────────────────────┤
 *   │  Yearly Stats (full width)                   │
 *   ├───────────────────────┬──────────────────────┤
 *   │  Gear Usage           │  Activity Types      │
 *   ├───────────────────────┼──────────────────────┤
 *   │  Current KOMs         │  KOM Historic Ranks  │
 *   ├───────────────────────┴──────────────────────┤
 *   │  KOM Achievements (full width table)         │
 *   └──────────────────────────────────────────────┘
 *
 * On mobile, everything stacks vertically.
 */
export function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Progress rings — always full width */}
      <YearProgressRings />

      {/* Yearly stats — full width */}
      <YearlyStatsChart />


      {/* KOM section — rankings side by side, then table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KomCurrentRanks />
        <KomPlaceCounts />
      </div>

      <KomTimeline />

            {/* Gear & activity types */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GearUsageCard />
        <ActivityTypeChart />
      </div>

    </div>
  );
}
