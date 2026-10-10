"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "./actions";
import { Button, Field, Notice, inputStyles } from "@/components/ui";
import { GoogleButton } from "./google-button";

export function AuthForm({ mode, next, error }: { mode: "login" | "signup"; next: string; error?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>((prev, form) => {
    // Entries are stored against the user's local calendar date.
    form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    return (mode === "login" ? signIn : signUp)(prev, form);
  }, undefined);
  const v = state?.values ?? {};
  const google = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "true";

  if (state?.info) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-5xl" aria-hidden>📬</div>
        <Notice tone="good">{state.info}</Notice>
        <p className="text-sm text-ink-2">Open the link on this device to finish signing up.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {(state?.error || error) && <Notice tone="error">{state?.error ?? error}</Notice>}

      {mode === "signup" && (
        <>
          <Field label="Your name" htmlFor="display_name">
            <input id="display_name" name="display_name" required maxLength={40} autoComplete="given-name"
              defaultValue={v.display_name} className={inputStyles} placeholder="Sam" />
          </Field>
          <Field label="Username" htmlFor="username" hint="Friends find you with this. Lowercase letters, numbers and _.">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">@</span>
              <input id="username" name="username" required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue={v.username}
                className={`${inputStyles} pl-9 lowercase`} placeholder="sam_eats" />
            </div>
          </Field>
        </>
      )}

      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={v.email}
          className={inputStyles} placeholder="you@example.com" />
      </Field>
      <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
        <input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : 1}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} className={inputStyles} />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
      </Button>

      {google && <GoogleButton next={next} />}

      <p className="pt-2 text-center text-sm text-ink-2">
        {mode === "login" ? (
          <>New here? <Link className="font-semibold text-brand" href={`/signup${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="font-semibold text-brand" href={`/login${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link></>
        )}
      </p>
    </form>
  );
}
