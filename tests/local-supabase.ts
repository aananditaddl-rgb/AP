// Connection details for the local Supabase stack, read from `supabase status`
// so no keys live in the repo. Override with SUPABASE_TEST_URL / _ANON / _SECRET.
import { execSync } from "node:child_process";

function fromStatus(): Record<string, string> {
  try {
    const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(
      out.split("\n").map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]),
    );
  } catch {
    return {};
  }
}

const status = process.env.SUPABASE_TEST_SECRET ? {} : fromStatus();

export const LOCAL_SUPABASE = {
  url: process.env.SUPABASE_TEST_URL ?? status.API_URL ?? "http://127.0.0.1:55321",
  anonKey: process.env.SUPABASE_TEST_ANON ?? status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? "",
  secretKey: process.env.SUPABASE_TEST_SECRET ?? status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? "",
};

if (!LOCAL_SUPABASE.secretKey) {
  throw new Error("Local Supabase isn't running. Start it with `npx supabase start`.");
}
