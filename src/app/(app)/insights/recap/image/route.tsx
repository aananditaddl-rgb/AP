import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getAllLogs, getCategories, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { startOfMonth } from "@/lib/engine/dates";
import { buildRecap, recapChangeLine, recapGoalLine } from "@/lib/recap";

// PNG version of the recap card for sharing outside the app.
export async function GET(request: NextRequest) {
  const viewer = await requireViewer();
  const m = request.nextUrl.searchParams.get("month");
  let month = startOfMonth(m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : viewer.today);
  if (month > startOfMonth(viewer.today)) month = startOfMonth(viewer.today);
  const [logs, goals, exceptions, categories] = await Promise.all([getAllLogs(), getGoals(), getExceptions(), getCategories()]);
  const r = buildRecap(month, logs, goals, exceptions, viewer.today, categories);
  const change = recapChangeLine(r.change, r.inProgress);

  const tile = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", width: 440, padding: 24, borderRadius: 28, background: "rgba(255,255,255,0.2)" }}>
      <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 80, color: "white",
        backgroundImage: "linear-gradient(135deg, #ff6f4f 0%, #ff8a5c 55%, #ffb36b 100%)" }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", opacity: 0.9 }}>Food habit recap</div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, marginTop: 8 }}>{`${r.title}${r.inProgress ? " (so far)" : ""}`}</div>
        <div style={{ display: "flex", fontSize: 32, opacity: 0.9 }}>{viewer.profile.display_name}</div>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 70 }}>
          <div style={{ display: "flex", fontSize: 220, fontWeight: 800, lineHeight: 1 }}>{String(r.meals)}</div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 48, fontWeight: 700 }}>{`cheat meal${r.meals === 1 ? "" : "s"}`}</div>
            <div style={{ fontSize: 34, opacity: 0.9 }}>{`on ${r.cheatDays} day${r.cheatDays === 1 ? "" : "s"}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 60 }}>
          {tile("Goal", recapGoalLine(r.goal))}
          {tile("Top treat", r.topCategory?.label ?? "—")}
          {tile("Days logged", `${r.loggedDays} of ${r.elapsedDays} (${r.loggingRate}%)`)}
          {tile("Longest clean run", `${r.longestCleanRun} day${r.longestCleanRun === 1 ? "" : "s"}`)}
        </div>
        {change && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 40, padding: 24, borderRadius: 28, background: "rgba(255,255,255,0.2)", fontSize: 36, fontWeight: 700 }}>{change}</div>
        )}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "auto", fontSize: 28, fontWeight: 700, opacity: 0.85 }}>Tracked with Treatly</div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "private, no-store" } },
  );
}
