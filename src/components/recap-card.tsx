import type { Recap } from "@/lib/recap";
import { recapChangeLine, recapGoalLine } from "@/lib/recap";

export function RecapCard({ recap, name }: { recap: Recap; name: string }) {
  const change = recapChangeLine(recap.change, recap.inProgress);
  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ff6f4f] via-[#ff8a5c] to-[#ffb36b] p-6 text-white shadow-xl">
      <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" />
      <div aria-hidden className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-white/10" />
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-90">Food habit recap</p>
        <p className="mt-1 text-2xl font-extrabold">{recap.title}{recap.inProgress ? " (so far)" : ""}</p>
        <p className="text-sm opacity-90">{name}</p>

        <div className="mt-6 flex items-end gap-3">
          <span className="text-7xl font-extrabold leading-none tabular-nums">{recap.meals}</span>
          <span className="pb-2 text-lg font-bold leading-tight">cheat meal{recap.meals === 1 ? "" : "s"}<br />
            <span className="text-sm font-semibold opacity-90">on {recap.cheatDays} day{recap.cheatDays === 1 ? "" : "s"}</span></span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Tile label="Goal" value={recapGoalLine(recap.goal)} />
          <Tile label="Top treat" value={recap.topCategory ? `${recap.topCategory.emoji} ${recap.topCategory.label}` : "—"} />
          <Tile label="Days logged" value={`${recap.loggedDays} of ${recap.elapsedDays} (${recap.loggingRate}%)`} />
          <Tile label="Longest clean run" value={`${recap.longestCleanRun} day${recap.longestCleanRun === 1 ? "" : "s"}`} />
        </div>
        {change && <p className="mt-4 rounded-2xl bg-white/20 px-4 py-2.5 text-center text-sm font-bold">{change}</p>}
        <p className="mt-5 text-center text-xs font-semibold opacity-80">Tracked with Treatly</p>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/20 p-3 backdrop-blur-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-85">{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-snug">{value}</p>
    </div>
  );
}
