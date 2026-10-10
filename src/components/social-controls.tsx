"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInvite, regenerateInviteCode, removeFriendship, respondToRequest, searchPeople, sendFriendRequest,
  toggleCheer, type SearchResult,
} from "@/app/actions/social";
import { Avatar, Button, Notice, inputStyles } from "./ui";

export function RequestButtons({ id, direction }: { id: string; direction: "incoming" | "outgoing" }) {
  const [pending, start] = useTransition();
  if (direction === "outgoing") {
    return <Button variant="small" disabled={pending} onClick={() => start(async () => { await removeFriendship(id); })}>Cancel</Button>;
  }
  return (
    <div className="flex gap-2">
      <Button variant="small" disabled={pending} onClick={() => start(async () => { await respondToRequest(id, false); })}>Decline</Button>
      <Button variant="smallPrimary" disabled={pending} onClick={() => start(async () => { await respondToRequest(id, true); })}>Accept</Button>
    </div>
  );
}

const RELATION_LABEL = { friend: "Friends", outgoing: "Requested", incoming: "Accept", none: "Add" } as const;

export function PeopleSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [pending, start] = useTransition();

  const term = q.trim();
  const searchable = term.replace(/^@/, "").length >= 2;
  useEffect(() => {
    if (!searchable) return;
    const t = setTimeout(() => start(async () => setResults(await searchPeople(term))), 250);
    return () => clearTimeout(t);
  }, [term, searchable]);
  const shown = searchable ? results : null;

  return (
    <div>
      <label htmlFor="people-search" className="sr-only">Search by username</label>
      <input id="people-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by @username or name"
        autoCapitalize="none" autoCorrect="off" className={inputStyles} />
      {shown && (
        <ul className="mt-2 divide-y divide-line" aria-live="polite">
          {shown.length === 0 && !pending && <li className="py-3 text-sm text-ink-2">No one found. Private profiles only appear through invite links.</li>}
          {shown.map((r) => <SearchRow key={r.id} r={r} />)}
        </ul>
      )}
    </div>
  );
}

function SearchRow({ r }: { r: SearchResult }) {
  const [relation, setRelation] = useState(r.relation);
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar emoji={r.avatar_emoji} color={r.avatar_color} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{r.display_name}</p>
        <p className="truncate text-xs text-ink-2">@{r.username}</p>
      </div>
      <Button variant={relation === "none" || relation === "incoming" ? "smallPrimary" : "small"}
        disabled={pending || relation === "friend" || relation === "outgoing"}
        onClick={() => start(async () => {
          const res = await sendFriendRequest(r.id);
          if (res.ok) setRelation((res.status as SearchResult["relation"]) ?? "outgoing");
        })}>
        {RELATION_LABEL[relation]}
      </Button>
    </li>
  );
}

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  async function share() {
    const data = { title: "Join me on Treatly", text: "Let’s keep each other on track with our cheat meals!", url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch { /* fall back to copy */ }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={url} aria-label="Your invite link" className={`${inputStyles} h-10 text-sm`} onFocus={(e) => e.target.select()} />
        <Button variant="smallPrimary" className="h-10 shrink-0" onClick={share}>{copied ? "Copied!" : "Share"}</Button>
      </div>
      <button type="button" disabled={pending} className="text-xs font-semibold text-ink-2 hover:text-ink"
        onClick={() => start(async () => { await regenerateInviteCode(); })}>
        Reset link (old links stop working)
      </button>
    </div>
  );
}

export function AcceptInviteButton({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const r = await acceptInvite(code);
        if (r.ok) router.push("/friends?added=1");
        else setError(r.error);
      })}>
        {pending ? "Adding…" : `Add ${name} as a friend`}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function CheerButton({ id, cheers, cheered, own }: { id: string; cheers: number; cheered: boolean; own: boolean }) {
  const [state, setState] = useState({ cheers, cheered });
  const [pending, start] = useTransition();
  if (own) {
    return state.cheers > 0 ? <span className="text-xs font-semibold text-ink-2">👏 {state.cheers}</span> : null;
  }
  return (
    <button type="button" aria-pressed={state.cheered} disabled={pending}
      onClick={() => {
        const next = !state.cheered;
        setState({ cheered: next, cheers: state.cheers + (next ? 1 : -1) });
        start(async () => { await toggleCheer(id, next); });
      }}
      className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold transition ${state.cheered ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>
      👏 {state.cheered ? "Cheered" : "Cheer"}{state.cheers > 0 ? ` · ${state.cheers}` : ""}
    </button>
  );
}

export function RemoveFriendButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm) return <Button variant="danger" className="w-full" onClick={() => setConfirm(true)}>Remove friend</Button>;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3">
      <p className="flex-1 text-sm">Remove {name}? You’ll stop seeing each other’s progress.</p>
      <Button variant="small" onClick={() => setConfirm(false)}>Keep</Button>
      <Button variant="smallPrimary" disabled={pending} onClick={() => start(async () => {
        await removeFriendship(id);
        router.push("/friends");
      })}>Remove</Button>
    </div>
  );
}
