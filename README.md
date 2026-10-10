# Treatly — social cheat-meal tracker

A mobile-first web app for tracking junk food and cheat meals in seconds, setting
personal goals, and staying accountable with friends.

**Daily flow:** open the app → *“Did you eat any junk food or have a cheat meal today?”* →
**NO** logs the day straight away · **YES** asks how many cheat meals and what kind.

Built with **Next.js 16 (App Router) · Tailwind CSS 4 · Supabase (Postgres, Auth, row-level security)**.
It can be installed to a phone's home screen (PWA) and works on every common screen size.

---

## What's included

| Area | Highlights |
| --- | --- |
| **Daily logging** | YES/NO on Home. YES opens a meal-count stepper (1–20), multi-select categories and an optional note. You can edit or delete an entry. The database allows only one log per user per day. |
| **Goals** | Daily, weekly (Mon–Sun), monthly (calendar month), a per-weekday plan, or a fixed total over a set period. Durations: ongoing, 7/14/30 days, 3/6 months or custom dates. A plain-language preview shows what you're signing up for. Goals can be edited, paused, resumed, ended or replaced. |
| **Special occasions** | Vacations, birthdays, weddings, festivals and holidays get a temporary allowance (per day or in total) for chosen dates. You can extend, shorten, end early or cancel one. Your usual goal comes back automatically afterwards. |
| **History stays intact** | Changing the allowance of a running goal creates a new version from today, so past days keep the rules they were tracked under. Pausing, ending and exceptions never rewrite old entries. |
| **Home dashboard** | Today's log, the current goal window (used / allowance / remaining / % / days left / status), the whole goal period, the month overview, quick insights and a nudge to fill a missed day. |
| **Calendar** | Month grid showing no-cheat, cheat (with count), not-logged and special-occasion days. Tap any past day to view, add, edit or delete its entry. |
| **Insights** | Monthly summary, goal performance (including exceptions), personal insights, category breakdown, weekday pattern, longest no-cheat run, 3-month trend, this month vs last, a 6-month chart against your allowance, and a comparison of goal periods. |
| **Monthly recap** | A Spotify-Wrapped-style card. Share it to your friends' feed or save/share it as a PNG. It shows highlights only, never your full log. |
| **Friends** | Search by username, invite links (work even for private profiles), accept/decline/cancel requests, remove friends. Friend cards show today's status, today's meals, monthly total and goal progress. |
| **Activity feed** | Check-ins, streak milestones, goals met, goal changes, occasions and shared recaps, plus 👏 cheers. |
| **Privacy** | Separate toggles for log status, daily counts, categories, monthly totals, goal progress and history, plus a private profile (hidden from search). The database enforces them. |
| **Notifications** | Daily reminder at your chosen time (only if you haven't logged), goal ending soon, monthly summary, mid-month check-in and friend requests. Delivered by web push, with every category optional. |
| **Account** | Email/password sign-up (optional Google), automatic timezone, account deletion. |

### Tracking rules (applied everywhere)

- **Cheat meals ≠ cheat days.** Three meals on Monday counts as 3 meals but 1 day with cheat meals.
  Categories describe a day's meals; they never change the meal count.
- **Unlogged days are “Not logged”.** They are never treated as days without junk food.
- **Allowances accrue per day.** A weekly allowance is spread over 7 days and a monthly one over the
  days in that month. A window's allowance is the rounded sum of its days, so a goal that starts
  mid-week or mid-month gets a fair, prorated share. An active special occasion replaces the goal's
  allowance on its dates.
- Going over an allowance changes the progress indicator to *Over allowance* (lilac, not red). Logging is never blocked.
- All dates are the user's **local calendar date**. The timezone follows their device.

The same allowance engine exists in TypeScript (`src/lib/engine`) and in SQL
(`public.day_allowance` / `public.goal_window`, used for friends' views). An integration test checks that both give the same answers.

---

## Run it locally

Requirements: Node 20+, Docker (for the local Supabase stack).

```bash
npm install
npx supabase start            # starts Postgres + Auth + API on ports 553xx and applies migrations
cp .env.example .env.local    # then fill in the values printed by `npx supabase status`
npm run dev                   # http://localhost:3000
```

For local development, `.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Publishable key from `npx supabase status`>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Deploy

1. **Create a Supabase project** at supabase.com.
2. **Apply the schema:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
   Alternatively, paste `supabase/migrations/*.sql` into the SQL editor.
3. In **Authentication → URL configuration**, set the Site URL to your app's URL and add
   `https://<your-app>/auth/callback` to the redirect URLs. Email confirmation can stay on;
   the app handles the confirmation link.
4. *(Optional)* Enable the Google provider and set `NEXT_PUBLIC_ENABLE_GOOGLE=true`.
5. **Deploy the Next.js app** (for example to Vercel) with the environment variables from `.env.example`.

### Reminders & push notifications (optional)

1. Generate keys with `npx web-push generate-vapid-keys` and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Also set `SUPABASE_SECRET_KEY` and a random `CRON_SECRET`.
2. Call `GET /api/cron/notify` with `Authorization: Bearer <CRON_SECRET>` every 15 minutes.
   Any scheduler works. With Supabase you can use `pg_cron` + `pg_net`:

   ```sql
   select cron.schedule('treatly-notify', '*/15 * * * *', $$
     select net.http_get('https://<your-app>/api/cron/notify',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
   $$);
   ```

   Every notification is recorded in `notification_log`, so nothing is ever sent twice.
   Add `?dry=1` to see what would be sent without sending it.
3. Users turn on push per device under **Profile → Notifications**. On iPhone, the app has to be added to the Home Screen first.

---

## Tests

```bash
npm test                 # engine + notification unit tests (Vitest)
npm run test:db          # integration tests against local Supabase: RLS, privacy, SQL ↔ TS engine parity
npm run build && npm start &
npm run test:e2e         # Playwright walk-through with three users (SCREENSHOTS=dir to save screenshots)
```

## Security model

- Every table has row-level security. Users can read and write **only their own** logs, goals, exceptions, settings and push subscriptions.
- Friends never query each other's tables. Cross-user reads go through `SECURITY DEFINER` functions
  (`friend_snapshot`, `friends_overview`, `friend_history`, `get_feed`). These check for an accepted friendship
  and return `null` for anything the friend doesn't share.
- Friend requests and accepting them happen only through functions, so nobody can forge an accepted friendship.
- Column privileges stop users from changing ids, owners or invite codes. Helpers that could reveal another user's data
  (`day_allowance`, `goal_window`, …) are not callable from the client.
- The service-role key is used only by the reminder job.

## Project structure

```
src/
  app/
    (auth)/          login, signup, auth actions
    (app)/           home, calendar, friends, insights, profile, goals (bottom-nav screens)
    actions/         server actions (logs, goals, social, profile, push)
    api/cron/notify  reminder job
    invite/[code]    invite landing page
  components/        UI building blocks (log flow, charts, goal forms, friend cards…)
  lib/
    engine/          pure tracking logic: dates, goals/allowances, stats, monthly report
    data.ts          data access for the signed-in user
    social.ts        friend / feed queries
supabase/migrations  schema, RLS policies and RPCs
tests/               DB integration tests and Playwright e2e
```

## Possible next steps

- User-defined food categories (the `food_categories` table already supports per-user rows).
- Friendly opt-in challenges between friends.
- Native app wrappers if app-store distribution is needed.
