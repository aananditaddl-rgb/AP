"use client";

export function Stepper({
  value, onChange, min = 0, max = 99, label, size = "md",
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; size?: "md" | "sm" }) {
  const btn = size === "sm"
    ? "h-9 w-9 rounded-lg text-lg"
    : "h-12 w-12 rounded-xl text-2xl";
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 p-1.5" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btn} bg-surface font-bold shadow-sm disabled:opacity-40`}>−</button>
      <output aria-live="polite" className={`${size === "sm" ? "text-lg" : "text-3xl"} font-extrabold tabular-nums`}>{value}</output>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${btn} bg-surface font-bold shadow-sm disabled:opacity-40`}>+</button>
    </div>
  );
}
