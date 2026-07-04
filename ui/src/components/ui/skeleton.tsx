import { cn } from "@/lib/utils";

/**
 * Skeleton — loading placeholder with shimmer animation.
 *
 * Use this in place of content that's still loading to give
 * users a sense of the layout before data arrives.
 *
 * USAGE:
 *   <Skeleton className="h-8 w-32" />     — single bar
 *   <Skeleton className="h-40 w-full" />   — full-width block
 */
export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg skeleton",
        className
      )}
    />
  );
}
