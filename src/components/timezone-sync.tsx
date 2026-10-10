"use client";

import { useEffect } from "react";
import { updateTimezone } from "@/app/actions/profile";

/** Keeps the saved timezone in step with the device so "today" is always local. */
export function TimezoneSync({ saved }: { saved: string }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === saved) return;
    try {
      if (sessionStorage.getItem("tz-synced") === tz) return;
      sessionStorage.setItem("tz-synced", tz);
    } catch {}
    void updateTimezone(tz);
  }, [saved]);
  return null;
}
