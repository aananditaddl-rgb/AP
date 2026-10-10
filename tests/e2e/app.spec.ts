// End-to-end walkthrough against a running app + local Supabase.
//   npx supabase start && npm run build && npm start
//   npx playwright test            (SCREENSHOTS=dir to save screenshots)
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LOCAL_SUPABASE } from "../local-supabase";

const run = Date.now().toString(36).slice(-5);
const shotsDir = process.env.SCREENSHOTS;
const admin = createClient(LOCAL_SUPABASE.url, LOCAL_SUPABASE.secretKey, { auth: { persistSession: false } });

async function shot(page: Page, name: string) {
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true });
}

async function signUp(browser: Browser, name: string, username: string, path = "/signup") {
  const ctx = await browser.newContext({ timezoneId: "Asia/Kolkata" });
  const page = await ctx.newPage();
  await page.goto(path);
  await page.fill("#display_name", name);
  await page.fill("#username", username);
  await page.fill("#email", `${username}@example.com`);
  await page.fill("#password", "password123");
  await page.getByRole("button", { name: "Create account" }).click();
  return page;
}

function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

test("full journey: log, goals, calendar, insights, friends", async ({ browser }) => {
  // --- Maya signs up and logs NO ---
  const maya = await signUp(browser, "Maya Patel", `maya_${run}`);
  await maya.waitForURL(/\/home/);
  await shot(maya, "01-home-new");
  await maya.getByRole("button", { name: /NO/ }).click();
  await expect(maya.getByText("Logged! You’re staying on track.")).toBeVisible();

  // Switch to YES with 2 meals via edit
  await maya.getByRole("button", { name: "Edit entry" }).click();
  await maya.getByRole("button", { name: /YES/ }).click();
  await maya.getByRole("button", { name: "One more meal" }).click();
  await maya.getByRole("button", { name: /Pizza/ }).click();
  await maya.getByRole("button", { name: /Sweets & desserts/ }).click();
  await maya.getByPlaceholder("e.g. Pizza and ice cream").fill("Pizza and ice cream");
  await shot(maya, "02-home-yes-form");
  await maya.getByRole("button", { name: "Save 2 cheat meals" }).click();
  await expect(maya.getByText("2 cheat meals today")).toBeVisible();

  // Seed some history so insights have something to say (direct DB insert as Maya's data).
  const { data: u } = await admin.from("profiles").select("id").eq("username", `maya_${run}`).single();
  const mayaId = u!.id as string;
  const seed = [];
  for (let i = 1; i <= 75; i++) {
    const d = localDate(-i);
    if (i % 9 === 4) continue; // a few unlogged days
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    const weekend = dow === 0 || dow === 6;
    seed.push(weekend || i % 11 === 0
      ? { user_id: mayaId, log_date: d, had_cheat: true, meal_count: weekend ? 2 : 1, categories: weekend ? ["pizza", "sweets_desserts"] : ["fast_food"] }
      : { user_id: mayaId, log_date: d, had_cheat: false, meal_count: 0, categories: [] });
  }
  // leave yesterday unlogged so we can add it from the calendar
  await admin.from("food_logs").insert(seed.filter((r) => r.log_date !== localDate(-1)));

  // --- Goal: weekly 3, 3 months ---
  await maya.goto("/goals/new");
  await maya.getByText("Weekly allowance").click();
  await maya.getByRole("button", { name: "Increase allowance" }).click();
  await maya.getByRole("button", { name: "3 months" }).click();
  await shot(maya, "03-goal-new");
  await maya.getByRole("button", { name: "Start this goal" }).click();
  await maya.waitForURL(/\/goals\?saved=1/);
  await expect(maya.getByText("Up to 3 cheat meals a week").first()).toBeVisible();

  // --- Vacation exception ---
  await maya.goto("/goals/occasion");
  await maya.getByLabel("Name (optional)").fill("Goa trip");
  await shot(maya, "04-occasion");
  await maya.getByRole("button", { name: "Save special occasion" }).click();
  await maya.waitForURL(/\/goals\?saved=1/);
  await expect(maya.getByText("Goa trip")).toBeVisible();
  await shot(maya, "05-goals");

  // --- Calendar: add the missed day ---
  await maya.goto(`/calendar?date=${localDate(-1)}`);
  await maya.getByRole("button", { name: /NO/ }).click();
  await expect(maya.getByText("No cheat meals yesterday")).toBeVisible();
  await shot(maya, "06-calendar");

  // --- Home dashboard after all that ---
  await maya.goto("/home");
  await expect(maya.getByText("This week")).toBeVisible();
  await shot(maya, "07-home-goal");

  // --- Insights + recap ---
  await maya.goto("/insights");
  await expect(maya.getByText("Monthly summary")).toBeVisible();
  await shot(maya, "08-insights");
  const prevMonth = localDate(-31).slice(0, 7);
  await maya.goto(`/insights?month=${prevMonth}`);
  await shot(maya, "09-insights-prev");
  await maya.goto(`/insights/recap?month=${prevMonth}`);
  await shot(maya, "10-recap");
  await maya.getByRole("button", { name: "Share with friends" }).click();
  await expect(maya.getByText("Shared with your friends’ activity feed.")).toBeVisible();
  const img = await maya.request.get(`/insights/recap/image?month=${prevMonth}`);
  expect(img.headers()["content-type"]).toContain("image/png");

  // --- Alex signs up, finds Maya, sends request ---
  const alex = await signUp(browser, "Alex Kim", `alex_${run}`);
  await alex.waitForURL(/\/home/);
  await alex.getByRole("button", { name: /NO/ }).click();
  await alex.goto("/friends?tab=add");
  await alex.getByPlaceholder("Search by @username or name").fill(`maya_${run}`);
  await alex.getByRole("button", { name: "Add" }).click();
  await expect(alex.getByRole("button", { name: "Requested" })).toBeVisible();

  // Maya accepts
  await maya.goto("/friends");
  await expect(maya.getByText("1 friend request waiting")).toBeVisible();
  await maya.goto("/friends?tab=add");
  await shot(maya, "11-friend-request");
  await maya.getByRole("button", { name: "Accept" }).click();
  await expect(maya.getByText("Friend requests")).toHaveCount(0);

  // Alex sees Maya's card and her goal progress
  await alex.goto("/friends");
  await expect(alex.getByText("Maya Patel")).toBeVisible();
  await expect(alex.getByText(/This week: \d+ of \d+ used/)).toBeVisible();
  await shot(alex, "12-friends");

  // Feed + cheer
  await alex.goto("/friends?tab=activity");
  await expect(alex.getByText(/Maya Patel shared their .* recap/)).toBeVisible();
  await alex.getByRole("button", { name: /Cheer/ }).first().click();
  await expect(alex.getByRole("button", { name: /Cheered/ }).first()).toBeVisible();
  await shot(alex, "13-feed");

  // Privacy: Maya hides goal progress → Alex sees it as private
  await maya.goto("/profile");
  await maya.getByRole("switch", { name: "Goal progress" }).click();
  await expect(maya.getByRole("switch", { name: "Goal progress" })).toHaveAttribute("aria-checked", "false");
  await maya.waitForTimeout(500);
  await shot(maya, "14-profile");
  await alex.goto("/friends");
  await expect(alex.getByText("Goal progress is private.")).toBeVisible();

  // Friend detail: history is private by default
  await alex.goto(`/friends/maya_${run}`);
  await expect(alex.getByText(/keeps their daily history private/)).toBeVisible();

  // --- Jordan joins via Maya's invite link ---
  const { data: s } = await admin.from("user_settings").select("invite_code").eq("user_id", mayaId).single();
  const jordanCtx = await browser.newContext({ timezoneId: "Europe/London" });
  const jordan = await jordanCtx.newPage();
  await jordan.goto(`/invite/${s!.invite_code}`);
  await expect(jordan.getByText("Maya Patel invited you to Treatly")).toBeVisible();
  await shot(jordan, "15-invite");
  await jordan.getByRole("link", { name: "Create an account" }).click();
  await jordan.fill("#display_name", "Jordan");
  await jordan.fill("#username", `jordan_${run}`);
  await jordan.fill("#email", `jordan_${run}@example.com`);
  await jordan.fill("#password", "password123");
  await jordan.getByRole("button", { name: "Create account" }).click();
  await jordan.waitForURL(/\/invite\//);
  await jordan.getByRole("button", { name: /Add Maya Patel as a friend/ }).click();
  await jordan.waitForURL(/\/friends\?added=1/);
  await expect(jordan.getByRole("link", { name: /Maya Patel/ })).toBeVisible();

  // Signed-out users are kept out of the app
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/insights");
  await expect(anon).toHaveURL(/\/login\?next=%2Finsights/);
});
