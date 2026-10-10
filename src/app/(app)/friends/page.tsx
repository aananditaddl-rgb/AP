import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Card, CardTitle, EmptyState, Notice, cx } from "@/components/ui";
import { FriendCard } from "@/components/friend-card";
import { Feed } from "@/components/feed";
import { InviteLink, PeopleSearch, RequestButtons } from "@/components/social-controls";
import { requireViewer } from "@/lib/data";
import { getFeed, getFriends, getRequests } from "@/lib/social";
import { siteUrl } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const sp = await searchParams;
  const tab = sp.tab === "activity" ? "activity" : sp.tab === "add" ? "add" : "friends";
  const viewer = await requireViewer();
  const [friends, requests, feed] = await Promise.all([
    getFriends(), getRequests(), tab === "activity" ? getFeed() : Promise.resolve({ items: [], fetchedAt: 0 }),
  ]);
  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");
  const loggedToday = friends.filter((f) => f.logged_today).length;
  const tabs = [
    { key: "friends", label: `Friends${friends.length ? ` (${friends.length})` : ""}` },
    { key: "activity", label: "Activity" },
    { key: "add", label: incoming.length ? `Add · ${incoming.length}` : "Add" },
  ];

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Friends</h1>
        <p className="text-sm text-ink-2">Accountability, not judgement. Cheer each other on.</p>
      </header>

      <nav aria-label="Friends sections" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 ring-1 ring-line">
        {tabs.map((t) => (
          <Link key={t.key} href={t.key === "friends" ? "/friends" : `/friends?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
            className={cx("flex h-10 items-center justify-center rounded-xl text-sm font-semibold", tab === t.key ? "bg-brand-soft text-brand-strong" : "text-ink-2")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {sp.added && <Notice tone="good">You’re now friends! 🎉</Notice>}

      {incoming.length > 0 && tab !== "add" && (
        <Link href="/friends?tab=add" className="flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
          <span aria-hidden>📨</span>
          <span className="flex-1">{incoming.length} friend request{incoming.length === 1 ? "" : "s"} waiting</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {tab === "friends" && (
        friends.length === 0 ? (
          <Card>
            <EmptyState emoji="🤝" title="Better together">
              <p>Add friends to see each other’s progress and keep each other going.</p>
              <Link href="/friends?tab=add" className="mt-4 inline-flex rounded-2xl bg-brand px-5 py-3 font-semibold text-brand-ink">Find or invite friends</Link>
            </EmptyState>
          </Card>
        ) : (
          <>
            <p className="text-sm text-ink-2">{loggedToday} of {friends.length} friend{friends.length === 1 ? " has" : "s have"} logged today.</p>
            <div className="space-y-3">{friends.map((f) => <FriendCard key={f.id} f={f} />)}</div>
          </>
        )
      )}

      {tab === "activity" && (
        feed.items.length === 0 ? (
          <Card><EmptyState emoji="📣" title="It’s quiet here">Updates from you and your friends will appear here.</EmptyState></Card>
        ) : <Feed items={feed.items} viewerId={viewer.id} now={feed.fetchedAt} />
      )}

      {tab === "add" && (
        <>
          {incoming.length > 0 && (
            <Card>
              <CardTitle>Friend requests</CardTitle>
              <ul className="divide-y divide-line">
                {incoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <Avatar emoji={r.other.avatar_emoji} color={r.other.avatar_color} size={40} />
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.other.display_name}</p><p className="truncate text-xs text-ink-2">@{r.other.username}</p></div>
                    <RequestButtons id={r.id} direction="incoming" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardTitle>Find friends</CardTitle>
            <PeopleSearch />
          </Card>
          <Card>
            <CardTitle>Invite with a link</CardTitle>
            <p className="-mt-1 mb-3 text-sm text-ink-2">Anyone who opens your link can add you straight away — even if your profile is private.</p>
            <InviteLink url={`${siteUrl()}/invite/${viewer.settings.invite_code}`} />
          </Card>
          {outgoing.length > 0 && (
            <Card>
              <CardTitle>Sent requests</CardTitle>
              <ul className="divide-y divide-line">
                {outgoing.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <Avatar emoji={r.other.avatar_emoji} color={r.other.avatar_color} size={40} />
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.other.display_name}</p><p className="truncate text-xs text-ink-2">@{r.other.username} · pending</p></div>
                    <RequestButtons id={r.id} direction="outgoing" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
