"use client";

import { useState, useTransition } from "react";
import { deleteAccount, updateReminderTime, updateSetting, type BoolSetting } from "@/app/actions/profile";
import { removePushSubscription, savePushSubscription } from "@/app/actions/push";
import { Button, Notice, cx, inputStyles } from "./ui";

export function SettingToggle({ setting, value, label, hint }: { setting: BoolSetting; value: boolean; label: string; hint?: string }) {
  const [on, setOn] = useState(value);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const id = `setting-${setting}`;
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1">
        <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
        {hint && <p className="text-xs text-ink-2">{hint}</p>}
        {error && <p className="text-xs text-brand-strong">Couldn’t save — try again.</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={on} disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          setError(false);
          start(async () => {
            const r = await updateSetting(setting, next);
            if (!r.ok) { setOn(!next); setError(true); }
          });
        }}
        className={cx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition", on ? "bg-good" : "bg-line")}>
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function ReminderTime({ value }: { value: string }) {
  const [time, setTime] = useState(value.slice(0, 5));
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3 py-3">
      <label htmlFor="reminder-time" className="flex-1 text-sm font-semibold">Reminder time</label>
      <input id="reminder-time" type="time" value={time} disabled={pending} className={cx(inputStyles, "h-10 w-32 px-3")}
        onChange={(e) => {
          const t = e.target.value;
          setTime(t);
          setSaved(false);
          if (t) start(async () => { const r = await updateReminderTime(t); setSaved(r.ok); });
        }} />
      {saved && <span className="text-xs font-semibold text-good">Saved</span>}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushSetup({ vapidKey }: { vapidKey: string | undefined }) {
  const [state, setState] = useState<"idle" | "on" | "off" | "denied" | "unsupported" | "error">("idle");
  const [pending, start] = useTransition();

  if (!vapidKey) {
    return <p className="py-3 text-xs text-ink-2">Push notifications aren’t set up on this server yet. Your preferences are saved and the Home screen always shows whether today is logged.</p>;
  }

  async function enable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setState("denied");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) });
    const json = sub.toJSON();
    const r = await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
    setState(r.ok ? "on" : "error");
  }

  async function disable() {
    const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <div className="space-y-2 py-3">
      <div className="flex gap-2">
        <Button variant="smallPrimary" disabled={pending} onClick={() => start(async () => { try { await enable(); } catch { setState("error"); } })}>
          Turn on for this device
        </Button>
        <Button variant="small" disabled={pending} onClick={() => start(async () => { try { await disable(); } catch { setState("error"); } })}>Turn off</Button>
      </div>
      {state === "on" && <Notice tone="good">Push notifications are on for this device.</Notice>}
      {state === "off" && <Notice>Push notifications are off for this device.</Notice>}
      {state === "denied" && <Notice tone="error">Notifications are blocked in your browser settings.</Notice>}
      {state === "unsupported" && <Notice tone="error">This browser doesn’t support push notifications. On iPhone, add Treatly to your Home Screen first.</Notice>}
      {state === "error" && <Notice tone="error">Something went wrong. Please try again.</Notice>}
    </div>
  );
}

export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <Button variant="danger" className="w-full" onClick={() => setOpen(true)}>Delete account</Button>;
  return (
    <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
      <p className="text-sm">This permanently deletes your account, food logs, goals and friendships. Type <strong>{username}</strong> to confirm.</p>
      <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Type your username to confirm" className={inputStyles} autoCapitalize="none" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="danger" className="flex-1" disabled={pending || value.trim().toLowerCase() !== username}
          onClick={() => start(async () => { const r = await deleteAccount(value); if (r && !r.ok) setError(r.error); })}>
          Delete forever
        </Button>
      </div>
    </div>
  );
}
