import { useQuery } from "@tanstack/react-query";
import { fetchGearUsage } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDuration, cn } from "@/lib/utils";
import { Bike, Star } from "lucide-react";

/**
 * Gear Usage — table showing distance, rides, and elevation per bike/shoe.
 *
 * Primary gear is highlighted with a star icon.
 */

const USER_ID = "brandon";

export function GearUsageCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["gear-usage", USER_ID],
    queryFn: () => fetchGearUsage(USER_ID),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Gear</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (error || !data?.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Gear</CardTitle></CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm">No gear data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bike className="w-4 h-4 text-brand-400" />
          Gear
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((gear) => (
            <div
              key={gear.id}
              className={cn(
                "flex items-start justify-between gap-3 p-3 rounded-lg",
                "border border-slate-800/50",
                gear.isPrimary ? "bg-slate-800/30" : "bg-transparent"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm truncate">{gear.name}</span>
                  {gear.isPrimary && <Star className="w-3 h-3 shrink-0 text-gold fill-gold" />}
                </div>
                {(gear.brandName || gear.modelName) && (
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {[gear.brandName, gear.modelName].filter(Boolean).join(" ")}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-white tabular-nums">
                  {formatNumber(gear.totalDistance, 0)} mi
                </div>
                <div className="text-xs text-slate-500">
                  {gear.totalRides} rides · {formatDuration(gear.totalMovingTime)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
