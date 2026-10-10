import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-ink-2">No calorie counting. Just a quick daily check-in.</p>
      <AuthForm mode="signup" next={safeNext(sp.next)} />
    </>
  );
}
