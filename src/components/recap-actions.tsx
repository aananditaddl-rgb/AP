"use client";

import { useState, useTransition } from "react";
import { shareRecap } from "@/app/actions/social";
import type { Recap } from "@/lib/recap";
import { Button, Notice } from "./ui";

export function RecapActions({ month, recap }: { month: string; recap: Recap }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "good" | "error"; text: string } | null>(null);

  async function shareImage() {
    setMsg(null);
    try {
      const res = await fetch(`/insights/recap/image?month=${month}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const file = new File([blob], `treatly-recap-${month}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${recap.title} recap` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg({ tone: "error", text: "Couldn't create the image. Please try again." });
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <Button className="w-full" disabled={pending} onClick={() => startTransition(async () => {
        const r = await shareRecap(month);
        setMsg(r.ok ? { tone: "good", text: "Shared with your friends’ activity feed." } : { tone: "error", text: r.error });
      })}>
        {pending ? "Sharing…" : "Share with friends"}
      </Button>
      <Button variant="secondary" className="w-full" onClick={shareImage}>Save or share as image</Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-center text-xs text-ink-3">Friends only see this card, not your daily entries.</p>
    </div>
  );
}
