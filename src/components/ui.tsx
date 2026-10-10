import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { ProgressStatus } from "@/lib/engine/types";
import type { AvatarColor } from "@/lib/data";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section
      className={cx("rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const buttonStyles = {
  primary: cx(buttonBase, "bg-brand text-brand-ink hover:bg-brand-strong px-5 h-12"),
  secondary: cx(buttonBase, "bg-surface-2 text-ink hover:bg-line px-5 h-12"),
  ghost: cx(buttonBase, "text-ink-2 hover:bg-surface-2 px-3 h-10"),
  danger: cx(buttonBase, "bg-surface-2 text-[#c0392b] dark:text-[#ff8a7a] hover:bg-line px-5 h-12"),
  small: cx(buttonBase, "bg-surface-2 text-ink hover:bg-line px-3 h-9 text-sm rounded-xl"),
  smallPrimary: cx(buttonBase, "bg-brand text-brand-ink hover:bg-brand-strong px-3 h-9 text-sm rounded-xl"),
};

export function Button({
  variant = "primary",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonStyles[variant], className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link className={cx(buttonStyles[variant], className)} {...rest} />;
}

const AVATAR_BG: Record<AvatarColor, string> = {
  peach: "bg-[var(--avatar-peach)]",
  mint: "bg-[var(--avatar-mint)]",
  sky: "bg-[var(--avatar-sky)]",
  lilac: "bg-[var(--avatar-lilac)]",
  lemon: "bg-[var(--avatar-lemon)]",
  rose: "bg-[var(--avatar-rose)]",
};

export const AVATAR_COLORS = Object.keys(AVATAR_BG) as AvatarColor[];

export function Avatar({
  emoji, color, size = 44, className,
}: { emoji: string; color: AvatarColor | string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        AVATAR_BG[color as AvatarColor] ?? AVATAR_BG.peach,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {emoji}
    </span>
  );
}

export const STATUS_META: Record<ProgressStatus, { label: string; bar: string; pill: string }> = {
  within: { label: "On track", bar: "bg-good", pill: "bg-good-soft text-good" },
  reached: { label: "Allowance reached", bar: "bg-warn", pill: "bg-warn-soft text-warn" },
  over: { label: "Over allowance", bar: "bg-over", pill: "bg-over-soft text-over" },
};

export function StatusPill({ status, className }: { status: ProgressStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", m.pill, className)}>
      {m.label}
    </span>
  );
}

export function ProgressBar({
  used, allowance, status, label,
}: { used: number; allowance: number; status: ProgressStatus; label: string }) {
  const pct = allowance > 0 ? Math.min(100, (used / allowance) * 100) : used > 0 ? 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={allowance}
      aria-valuenow={used}
      aria-valuetext={`${used} of ${allowance} cheat meals used`}
      className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className={cx("h-full rounded-full transition-all", STATUS_META[status].bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: "good" | "brand" | "over" }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-3">
      <div
        className={cx(
          "text-2xl font-extrabold tabular-nums leading-none",
          tone === "good" && "text-good",
          tone === "brand" && "text-brand",
          tone === "over" && "text-over",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-xs font-medium leading-tight text-ink-2">{label}</div>
    </div>
  );
}

export function PageHeader({
  title, subtitle, action, back,
}: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <header className="flex items-start justify-between gap-3 pb-4 pt-2">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
            <span aria-hidden>←</span> Back
          </Link>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <div className="text-4xl" aria-hidden>{emoji}</div>
      <p className="mt-3 font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "good"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-2xl px-4 py-3 text-sm font-medium",
        tone === "error" && "bg-brand-soft text-brand-strong",
        tone === "info" && "bg-special-soft text-special",
        tone === "good" && "bg-good-soft text-good",
      )}
    >
      {children}
    </p>
  );
}

export const inputStyles =
  "w-full rounded-2xl border border-line bg-surface px-4 h-12 text-[16px] text-ink placeholder:text-ink-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-2">{hint}</p>}
    </div>
  );
}
