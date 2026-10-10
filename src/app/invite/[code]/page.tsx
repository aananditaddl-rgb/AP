import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, ButtonLink } from "@/components/ui";
import { AcceptInviteButton } from "@/components/social-controls";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "You're invited" };

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { p_code: code });
  const inviter = (data ?? [])[0] as { id: string; display_name: string; username: string; avatar_emoji: string; avatar_color: string } | undefined;
  const { data: claims } = await supabase.auth.getClaims();
  const signedIn = Boolean(claims?.claims?.sub);
  const next = `/invite/${code}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      {!inviter ? (
        <>
          <div className="text-5xl" aria-hidden>🔗</div>
          <h1 className="mt-4 text-2xl font-extrabold">This invite link has expired</h1>
          <p className="mt-2 text-ink-2">Ask your friend to share a fresh link.</p>
          <ButtonLink href="/" variant="secondary" className="mt-6">Go to Treatly</ButtonLink>
        </>
      ) : (
        <>
          <Avatar emoji={inviter.avatar_emoji} color={inviter.avatar_color} size={88} />
          <h1 className="mt-5 text-2xl font-extrabold">{inviter.display_name} invited you to Treatly</h1>
          <p className="mt-2 text-ink-2">Track cheat meals in seconds and keep each other on track. You choose what friends can see.</p>
          <div className="mt-8 w-full space-y-3">
            {inviter.id === claims?.claims?.sub ? (
              <p className="rounded-2xl bg-surface-2 p-4 text-sm">This is your own invite link — share it with friends!</p>
            ) : signedIn ? (
              <AcceptInviteButton code={code} name={inviter.display_name} />
            ) : (
              <>
                <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} className="w-full">Create an account</ButtonLink>
                <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="secondary" className="w-full">I already have an account</ButtonLink>
              </>
            )}
            <Link href={signedIn ? "/home" : "/"} className="block pt-2 text-sm font-semibold text-ink-2">Not now</Link>
          </div>
        </>
      )}
    </main>
  );
}
