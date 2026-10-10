"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { safeNext } from "@/lib/safe-next";

export type AuthState = { error?: string; info?: string; values?: Record<string, string> } | undefined;

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!email || !password) return { error: "Enter your email and password.", values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /confirm/i.test(error.message)
      ? "Please confirm your email first — check your inbox for the link."
      : "That email and password don't match. Try again?";
    return { error: msg, values: { email } };
  }
  redirect(next);
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const displayName = String(form.get("display_name") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const timezone = String(form.get("timezone") ?? "UTC");
  const next = safeNext(form.get("next"));
  const values = { display_name: displayName, username, email };

  if (displayName.length < 1 || displayName.length > 40) return { error: "Add your name (up to 40 characters).", values };
  if (!USERNAME_RE.test(username)) {
    return { error: "Usernames are 3–20 characters: lowercase letters, numbers or _.", values };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", values };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", values };

  const supabase = await createClient();
  const { data: available } = await supabase.rpc("username_available", { p_username: username });
  if (!available) return { error: `@${username} is taken. Try another username.`, values };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: displayName, timezone },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    const msg = /registered|exists/i.test(error.message)
      ? "An account with this email already exists. Try logging in."
      : error.message;
    return { error: msg, values };
  }
  if (!data.session) {
    return { info: `Almost there! We sent a confirmation link to ${email}.`, values };
  }
  redirect(next === "/home" ? "/home?welcome=1" : next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
