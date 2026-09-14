import { cn } from "@/lib/utils";

/**
 * ProgressRing — circular progress indicator that scales with its container.
 *
 * Plain SVG rather than a Recharts pie: size comes from CSS, so the ring
 * never overflows a smaller box on narrow screens.
 *
 * USAGE:
 *   <ProgressRing percent={72} className="w-24 h-24">72%</ProgressRing>
 */
export function ProgressRing({
  percent,
  className,
  strokeWidth = 10,
  color = "#22c55e",
  trackColor = "#1e293b",
  children,
}: {
  /** 0–100; values above 100 render a full ring */
  percent: number;
  className?: string;
  /** Stroke width in viewBox units (the ring is 100 units across) */
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Rendered centered inside the ring */
  children?: React.ReactNode;
}) {
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(percent, 100));

  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={clamped > 0 && clamped < 100 ? "round" : "butt"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  );
}
