"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/friends", label: "Friends", icon: FriendsIcon },
  { href: "/insights", label: "Insights", icon: InsightsIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
];

export function BottomNav({ badges }: { badges?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/") ||
            (href === "/profile" && pathname.startsWith("/goals"));
          const badge = badges?.[href];
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition",
                  active ? "text-brand" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <Icon active={active} />
                {label}
                {badge ? (
                  <span className="absolute right-[22%] top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 text-brand-ink">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { active: boolean };
const iconProps = (active: boolean) => ({
  width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: active ? 2.4 : 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

function HomeIcon({ active }: IconProps) {
  return <svg {...iconProps(active)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>;
}
function CalendarIcon({ active }: IconProps) {
  return <svg {...iconProps(active)}><rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>;
}
function FriendsIcon({ active }: IconProps) {
  return <svg {...iconProps(active)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></svg>;
}
function InsightsIcon({ active }: IconProps) {
  return <svg {...iconProps(active)}><path d="M4 20V11M10 20V5M16 20v-7M22 20H2" /></svg>;
}
function ProfileIcon({ active }: IconProps) {
  return <svg {...iconProps(active)}><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></svg>;
}
