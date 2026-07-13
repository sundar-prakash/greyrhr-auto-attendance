require("dotenv").config();
const { chromium } = require("playwright");

// --- CONFIGURATION (from .env) ---
const URL = process.env.GREYTHR_URL;
const LOGIN_ID = process.env.LOGIN_ID;
const PASSWORD = process.env.PASSWORD;
const LEAVE_DATES = (process.env.LEAVE_DATES || "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);
const OFFICE_START_HOUR = Number(process.env.OFFICE_START_HOUR ?? 9);
const OFFICE_START_MINUTE = Number(process.env.OFFICE_START_MINUTE ?? 30);
const OFFICE_END_HOUR = Number(process.env.OFFICE_END_HOUR ?? 18);
const OFFICE_END_MINUTE = Number(process.env.OFFICE_END_MINUTE ?? 30);
const BUFFER_MAX_MINUTES = Number(process.env.BUFFER_MAX_MINUTES ?? 10);
// ---------------------

/**
 * Sleep for a random duration between 0 and BUFFER_MAX_MINUTES.
 * Makes sign-in/sign-out times look natural and non-robotic.
 * Returns the number of minutes it waited.
 */
function randomDelay() {
  const delayMs = Math.floor(Math.random() * BUFFER_MAX_MINUTES * 60 * 1000);
  const delayMins = (delayMs / 60000).toFixed(1);
  console.log(`[JITTER] Waiting ${delayMins} minutes before acting...`);
  return new Promise((resolve) => setTimeout(() => resolve(delayMins), delayMs));
}

function getMinutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * before_office: before 9:30 AM  → ensure signed in
 * work_hours:    9:30 AM–6:30 PM → ensure signed in
 * after_office:  after 6:30 PM   → ensure signed out
 */
function detectPeriod(now = new Date()) {
  const mins = getMinutesSinceMidnight(now);
  const start = OFFICE_START_HOUR * 60 + OFFICE_START_MINUTE;
  const end = OFFICE_END_HOUR * 60 + OFFICE_END_MINUTE;

  if (mins < start) return "before_office";
  if (mins >= end) return "after_office";
  return "work_hours";
}

// GreytHR attendance button (web component with slots)
function attendanceButtons(page) {
  // Prefer role + accessible name; fall back to text matching for custom buttons
  const signInBtn = page
    .getByRole("button", { name: /sign in/i })
    .or(page.locator('button:has-text("Sign In")'));
  const signOutBtn = page
    .getByRole("button", { name: /sign out/i })
    .or(page.locator('button:has-text("Sign Out")'));
  return { signInBtn, signOutBtn };
}

/** Wait until either Sign In or Sign Out is visible (dashboard widgets load late). */
async function waitForAttendanceButton(page, timeoutMs = 30000) {
  const { signInBtn, signOutBtn } = attendanceButtons(page);
  const either = signInBtn.or(signOutBtn).first();
  try {
    await either.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    // Caller will log the warning if still not found
  }
  return { signInBtn, signOutBtn };
}

async function ensureSignedIn(page) {
  const { signInBtn, signOutBtn } = await waitForAttendanceButton(page);

  if (
    await signInBtn
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await signInBtn.first().click();
    console.log(
      `[SUCCESS] Signed In successfully at ${new Date().toLocaleTimeString()}`,
    );
  } else if (
    await signOutBtn
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    console.log(
      '[SKIPPED] Already signed in. "Sign Out" is visible; no action needed.',
    );
  } else {
    console.log(
      "[WARNING] Neither Sign In nor Sign Out buttons were detected.",
    );
  }
}

async function ensureSignedOut(page) {
  const { signInBtn, signOutBtn } = await waitForAttendanceButton(page);

  if (
    await signOutBtn
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await signOutBtn.first().click();
    console.log(
      `[SUCCESS] Signed Out successfully at ${new Date().toLocaleTimeString()}`,
    );
  } else if (
    await signInBtn
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    console.log(
      '[SKIPPED] Already signed out. "Sign In" is visible; no action needed.',
    );
  } else {
    console.log(
      "[WARNING] Neither Sign In nor Sign Out buttons were detected.",
    );
  }
}

async function run() {
  if (!URL || !LOGIN_ID || !PASSWORD) {
    console.error(
      "[ERROR] Missing GREYTHR_URL, LOGIN_ID, or PASSWORD in .env",
    );
    process.exit(1);
  }

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  const dateString = today.toISOString().split("T")[0];
  const period = detectPeriod(today);

  // 1. Weekend Check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log(`Skipping execution: It is a weekend (Day ${dayOfWeek}).`);
    process.exit(0);
  }

  // 2. Leave Calendar Check
  if (LEAVE_DATES.includes(dateString)) {
    console.log(`Skipping execution: ${dateString} is marked as a leave date.`);
    process.exit(0);
  }

  console.log(
    `Detected period: ${period} (local time ${today.toLocaleTimeString()}).`,
  );

  // 3. Launch browser (headless by default; set HEADLESS=false to debug)
  const headless = process.env.HEADLESS !== "false";
  console.log(`Launching browser (headless=${headless})...`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigation & Login
    await page.goto(URL);
    await page.getByRole("textbox", { name: "Login ID" }).fill(LOGIN_ID);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Login" }).click();

    // Wait for dashboard; GreytHR widgets keep loading after networkidle
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // 4. Apply random jitter ONLY on edge runs (sign-in / sign-out).
    //    Hourly work_hours checks run instantly — they're just a safety net.
    if (period === "before_office" || period === "after_office") {
      const waited = await randomDelay();
      console.log(`[JITTER] Resumed after ${waited} min delay.`);
    } else {
      console.log("[CHECK] Work-hours safety check — no delay.");
    }

    // 5. Re-detect period after potential delay, then act
    const actualPeriod = detectPeriod(new Date());
    console.log(
      `Period: ${actualPeriod} (local time ${new Date().toLocaleTimeString()}).`,
    );

    if (actualPeriod === "after_office") {
      await ensureSignedOut(page);
    } else {
      await ensureSignedIn(page);
    }
  } catch (error) {
    console.error("[ERROR] Automation failed during runtime:", error);
  } finally {
    await browser.close();
    console.log("Browser closed. Process completed.");
  }
}

run();
