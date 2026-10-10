import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Please log in.",
  profile: "We couldn't load your profile. Please log in again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-ink-2">Log in to check in for today.</p>
      <AuthForm mode="login" next={safeNext(sp.next)} error={ERRORS[String(sp.error ?? "")]} />
    </>
  );
}
