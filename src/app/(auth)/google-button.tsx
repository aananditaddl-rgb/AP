"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function GoogleButton({ next }: { next: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={() => {
        void createClient().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
      }}
    >
      <span aria-hidden className="font-bold">G</span> Continue with Google
    </Button>
  );
}
