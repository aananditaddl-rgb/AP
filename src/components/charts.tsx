import type { ReactNode } from "react";
import { cx } from "./ui";

// Small, dependency-free charts. Single series → one color, no legend (the card
// title names it). Every bar has a hover/focus tooltip and an accessible table.

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Tooltip / table text, e.g. "Oct 2026: 5 cheat meals" */
  detail: string;
  /** Optional reference value drawn as a tick (e.g. the allowance). */
  marker?: number | null;
  /** Emphasise this bar (e.g. the current month); others are drawn lighter. */
  emphasis?: boolean;
  /** Short text under the bar label (e.g. a status word). */
  note?: ReactNode;
}

export function ColumnChart({ data, caption, height = 140, valueLabel }: {
  data: BarDatum[]; caption: string; height?: number; valueLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.marker ?? 0)));
  const anyEmphasis = data.some((d) => d.emphasis);
  return (
    <figure>
      <div className="relative" style={{ height }}>
        {/* recessive baseline */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d) => (
            <div key={d.key} tabIndex={0} aria-label={d.detail}
              className="group relative flex h-full flex-1 items-end justify-center outline-none">
              <div
                className={cx("w-full max-w-9 rounded-t-[4px] bg-chart transition-opacity",
                  anyEmphasis && !d.emphasis && "opacity-45", "group-hover:opacity-100 group-focus:opacity-100")}
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
              {d.marker != null && (
                <div className="pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-ink/70"
                  style={{ bottom: `${(d.marker / max) * 100}%` }} />
              )}
              {d.emphasis && d.value > 0 && (
                <span className="pointer-events-none absolute text-xs font-bold tabular-nums text-ink"
                  style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}>{d.value}</span>
              )}
              <span role="tooltip"
                className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-bg shadow-lg group-hover:block group-focus:block">
                {d.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {data.map((d) => (
          <div key={d.key} className="flex-1 text-center text-[11px] font-semibold text-ink-2">
            {d.label}
            {d.note && <div className="text-[10px] font-medium">{d.note}</div>}
          </div>
        ))}
      </div>
      <DataTable caption={caption} valueLabel={valueLabel} rows={data.map((d) => [d.label, d.detail])} />
    </figure>
  );
}

export function BarList({ data, caption, valueLabel }: { data: BarDatum[]; caption: string; valueLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <ul className="space-y-2.5">
        {data.map((d) => (
          <li key={d.key} className="group relative" tabIndex={0} aria-label={d.detail}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{d.label}</span>
              <span className="font-semibold tabular-nums text-ink-2">{d.value}</span>
            </div>
            <div className="h-2.5 rounded-full bg-chart-track">
              <div className="h-full rounded-full bg-chart" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} valueLabel={valueLabel} rows={data.map((d) => [d.label, d.detail])} />
    </figure>
  );
}

function DataTable({ caption, valueLabel, rows }: { caption: string; valueLabel: string; rows: string[][] }) {
  return (
    <details className="mt-3 text-xs text-ink-2">
      <summary className="cursor-pointer select-none font-semibold">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th className="py-1 font-semibold">Period</th><th className="py-1 font-semibold">{valueLabel}</th></tr></thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-t border-line"><td className="py-1">{a}</td><td className="py-1">{b}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
