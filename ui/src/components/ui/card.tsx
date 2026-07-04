import { cn } from "@/lib/utils";

/**
 * Card component — the primary container for dashboard content.
 *
 * Uses a glass-morphism style with a subtle border and blur effect.
 * Supports a title, optional subtitle, and child content.
 */

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm",
        "shadow-lg shadow-black/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn("px-5 pt-5 pb-2", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3 className={cn("text-sm font-semibold text-slate-300 uppercase tracking-wider", className)}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}
