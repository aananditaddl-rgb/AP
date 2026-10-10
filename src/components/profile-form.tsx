"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/profile";
import type { Profile } from "@/lib/data";
import { AVATAR_COLORS, Avatar, Button, Field, Notice, cx, inputStyles } from "./ui";

const EMOJIS = ["🍩", "🍕", "🍔", "🌮", "🍦", "🧁", "🍪", "🥑", "🍓", "🥨", "🐻", "🦊", "🐼", "🐸", "🌻", "⭐"];

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [emoji, setEmoji] = useState(profile.avatar_emoji);
  const [color, setColor] = useState<string>(profile.avatar_color);
  const [isPrivate, setPrivate] = useState(profile.is_private);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-5">
      <div className="flex justify-center"><Avatar emoji={emoji} color={color} size={96} /></div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Avatar</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button key={e} type="button" aria-label={`Use ${e}`} aria-pressed={emoji === e} onClick={() => setEmoji(e)}
              className={cx("flex aspect-square items-center justify-center rounded-xl text-xl", emoji === e ? "bg-brand-soft ring-2 ring-brand" : "bg-surface-2")}>{e}</button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`${c} background`} aria-pressed={color === c} onClick={() => setColor(c)}
              className={cx("h-9 w-9 rounded-full ring-offset-2 ring-offset-bg", color === c && "ring-2 ring-ink")}
              style={{ background: `var(--avatar-${c})` }} />
          ))}
        </div>
      </fieldset>
      <Field label="Name" htmlFor="pf-name">
        <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={inputStyles} />
      </Field>
      <Field label="Username" htmlFor="pf-username" hint="3–20 lowercase letters, numbers or _.">
        <input id="pf-username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={20}
          autoCapitalize="none" autoCorrect="off" className={inputStyles} />
      </Field>
      <label className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--brand)]" />
        <span>
          <span className="block text-sm font-semibold">Private profile</span>
          <span className="block text-xs text-ink-2">Hide me from username search. People can still add you with your invite link.</span>
        </span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        setError(null);
        const r = await updateProfile({ displayName: name, username, avatarEmoji: emoji, avatarColor: color, isPrivate });
        if (!r.ok) setError(r.error);
        else router.push("/profile?saved=1");
      })}>{pending ? "Saving…" : "Save profile"}</Button>
    </div>
  );
}
