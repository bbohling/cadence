import { YearProgressRings } from "@/components/dashboard/year-progress-rings";
import { RecentRides } from "@/components/dashboard/recent-rides";
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
 *   │  Recent Rides (full width)                   │
 *   ├──────────────────────────────────────────────┤
 *   │  Yearly Stats (full width)                   │
 *   ├───────────────────────┬──────────────────────┤
 *   │  Current KOMs         │  KOM Historic Ranks  │
 *   ├───────────────────────┴──────────────────────┤
 *   │  KOM Achievements (full width table)         │
 *   ├───────────────────────┬──────────────────────┤
 *   │  Gear Usage           │  Activity Types      │
 *   └───────────────────────┴──────────────────────┘
 *
 * On mobile, everything stacks vertically.
 */
export function DashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <YearProgressRings />

      <RecentRides />

      <YearlyStatsChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <KomCurrentRanks />
        <KomPlaceCounts />
      </div>

      <KomTimeline />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <GearUsageCard />
        <ActivityTypeChart />
      </div>
    </div>
  );
}
