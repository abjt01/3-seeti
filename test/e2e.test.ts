// Real Chrome, real model: YAMNet runs in the page and listens to the recorded kitchen, so these
// tests check the whole chain from audio to "Gas band karo". Needs `npm run build` and Chrome.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { startServer } from "./helpers/server.ts";

const CHROME =
  process.env.CHROME_PATH ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
if (!CHROME && process.env.CI) throw new Error("Chrome not found; set CHROME_PATH");

const RESULTS = path.resolve("test-results");
const WIDTHS = [320, 390, 768, 1280];
const THEMES = ["light", "dark"] as const;

let browser: Browser;
let server: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  if (!CHROME) return;
  server = await startServer();
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      ...(process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ],
  });
});
after(async () => {
  await browser?.close();
  await server?.stop();
});

// Runs in the page: anything wider than the viewport or spilling out of its box.
function layoutProblems() {
  const vw = document.documentElement.clientWidth;
  const out: string[] = [];
  const desc = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || "").replace(/\s+/g, ".")} "${((el as HTMLElement).innerText || "").trim().slice(0, 30)}"`;
  if (document.documentElement.scrollWidth > vw) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px > ${vw}px)`);
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.opacity === "0" && cs.position === "absolute") continue;
    if (el.closest("[aria-hidden=true], svg")) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) out.push(`off screen: ${desc(el)}`);
    if (!["INPUT", "SELECT"].includes(el.tagName) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.push(`content wider than its box: ${desc(el)}`);
  }
  return [...new Set(out)];
}

const QUIET = /status of 4\d\d|TensorFlow Lite|XNNPACK|inference_feedback|Graph successfully|Feedback manager/;

async function open(width: number, theme: (typeof THEMES)[number] = "light", errors: string[] = []): Promise<Page> {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push((e as Error).message));
  page.on("console", (m) => {
    if (m.type() === "error" && !QUIET.test(m.text())) errors.push(m.text());
  });
  await page.setViewport({ width, height: 860, isMobile: width < 600, hasTouch: width < 600 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
  await page.goto(server.base, { waitUntil: "networkidle0" });
  // every test starts from a fresh kitchen: no dish or language left over from the last one
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector("main[data-ready]");
  return page;
}

async function click(page: Page, text: string, tag = "button") {
  const [el] = await page.$$(`xpath/.//${tag}[contains(normalize-space(), "${text}")]`);
  assert.ok(el, `no ${tag} "${text}"`);
  await (el as unknown as { click: () => Promise<void> }).click();
}

const phase = (page: Page) => page.$eval("main", (m) => m.getAttribute("data-phase"));
const count = (page: Page) => page.$eval("[data-testid=count] .n", (e) => Number(e.textContent));
const log = (page: Page) => page.$$eval(".log li span", (els) => els.map((e) => e.textContent || ""));

async function runFastDemo(page: Page) {
  await click(page, "Tez chalao");
  await page.waitForFunction(() => document.querySelector("main")?.getAttribute("data-phase") !== "plan", { timeout: 60_000 });
}

describe("layout", { skip: !CHROME && "Chrome not found" }, () => {
  const states: [string, (p: Page) => Promise<void>][] = [
    [
      "planning, settings open",
      async (p) => {
        await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
      },
    ],
    [
      "planning a dish the table doesn't know, in English",
      async (p) => {
        await click(p, "English");
        await p.type("form.ask input", "rajma that I forgot to soak overnight, about half a kilo");
        await click(p, "Ask");
        await p.waitForSelector(".note.warn");
      },
    ],
    [
      "listening",
      async (p) => {
        for (let i = 0; i < 3; i++) await p.click('button[aria-label="One more whistle"]');
        await runFastDemo(p);
        await p.waitForFunction(() => document.querySelectorAll(".log li").length >= 2, { timeout: 60_000 });
      },
    ],
    [
      "gas off alarm",
      async (p) => {
        await runFastDemo(p);
        await p.waitForSelector("[data-phase=done]", { timeout: 60_000 });
      },
    ],
    [
      "simmer timer",
      async (p) => {
        await click(p, "Rajma");
        await runFastDemo(p);
        await p.waitForFunction(() => document.querySelectorAll(".log li").length >= 4, { timeout: 60_000 });
        for (let i = 0; i < 3; i++) await click(p, "+1");
        await p.waitForSelector("[data-phase=done]");
        await click(p, "Gas band kar di");
        await p.waitForSelector("[data-testid=timer]");
      },
    ],
  ];

  for (const [name, setup] of states) {
    test(name, async () => {
      const failures: string[] = [];
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          const errors: string[] = [];
          const page = await open(width, theme, errors);
          try {
            await setup(page);
            await new Promise((r) => setTimeout(r, 150));
            const problems = [...(await page.evaluate(layoutProblems)), ...errors.map((e) => `browser error: ${e}`)];
            if (problems.length) {
              fs.mkdirSync(RESULTS, { recursive: true });
              await page.screenshot({ path: path.join(RESULTS, `${name.replace(/\W+/g, "-")}-${width}-${theme}.png`), fullPage: true });
              failures.push(`${width}px ${theme}:\n    ${problems.slice(0, 6).join("\n    ")}`);
            }
          } catch (err) {
            fs.mkdirSync(RESULTS, { recursive: true });
            await page.screenshot({ path: path.join(RESULTS, `${name.replace(/\W+/g, "-")}-${width}-${theme}-error.png`), fullPage: true });
            failures.push(`${width}px ${theme}: ${(err as Error).message}`);
          }
          await page.evaluate(() => localStorage.clear());
          await page.close();
        }
      }
      assert.equal(failures.length, 0, failures.join("\n"));
    });
  }
});

describe("flows", { skip: !CHROME && "Chrome not found" }, () => {
  const errors: string[] = [];

  test("the recorded kitchen: three whistles counted, the kettle ignored, gas off", async () => {
    const page = await open(390, "light", errors);
    assert.equal(await page.$eval(".dish", (e) => e.textContent), "Toor dal");
    await runFastDemo(page);
    await page.waitForSelector("[data-phase=done]", { timeout: 60_000 });
    assert.equal(await count(page), 3);
    const lines = await log(page);
    assert.deepEqual(lines.filter((l) => l.startsWith("Seeti")), ["Seeti 3", "Seeti 2", "Seeti 1"]);
    assert.ok(lines.some((l) => /kettle/.test(l)), "the kettle was noticed");
    assert.match(await page.$eval(".alarm", (e) => (e as HTMLElement).innerText), /Gas band karo!/);
    await click(page, "Gas band kar di");
    await page.waitForSelector("[data-phase=finished]");
    await click(page, "Kuch aur banao");
    await page.waitForSelector("[data-phase=plan]");
    await page.close();
  });

  test("rajma: fixing a missed whistle and a wrong one, then the simmer timer", async () => {
    const page = await open(390, "light", errors);
    await click(page, "Rajma");
    assert.equal(await page.$eval(".steppers output", (e) => e.textContent), "6");
    await runFastDemo(page);
    // the recording only has three whistles, so it keeps listening
    await page.waitForFunction(() => [...document.querySelectorAll(".log li span")].filter((s) => s.textContent?.startsWith("Seeti")).length === 3, { timeout: 60_000 });
    assert.equal(await phase(page), "listening");
    await click(page, "−1");
    assert.equal(await count(page), 2);
    for (let i = 0; i < 4; i++) await click(page, "+1");
    await page.waitForSelector("[data-phase=done]");
    assert.equal(await count(page), 6);
    await click(page, "Gas band kar di");
    await page.waitForSelector("[data-testid=timer]");
    assert.match(await page.$eval("[data-testid=timer]", (e) => e.textContent || ""), /^(10:00|09:5\d)$/);
    await page.close();
  });

  test("the cook's own numbers and language stick around", async () => {
    const page = await open(390, "light", errors);
    await click(page, "Chole");
    await page.click('button[aria-label="One more whistle"]');
    await page.click('button[aria-label="Five minutes more"]');
    assert.match(await page.$eval(".source", (e) => e.textContent || ""), /aapne rakha/);
    await click(page, "English");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector(".dish")?.textContent === "Chole" && document.body.innerText.includes("What's in the cooker?"));
    assert.equal(await page.$eval(".steppers output", (e) => e.textContent), "6");
    assert.match(await page.$eval(".source", (e) => e.textContent || ""), /you set it/);
    await page.evaluate(() => localStorage.clear());
    await page.close();
  });

  test("a dish the table knows by another name, and one it doesn't", async () => {
    const page = await open(390, "light", errors);
    await page.type("form.ask input", "chawal");
    await click(page, "Poocho");
    await page.waitForFunction(() => document.querySelector(".dish")?.textContent === "Rice");
    await page.type("form.ask input", "kathal ki sabzi");
    await click(page, "Poocho");
    await page.waitForSelector(".note.warn");
    assert.match(await page.$eval(".note.warn", (e) => e.textContent || ""), /yourself/);
    assert.equal(await page.$eval(".dish", (e) => e.textContent), "Rice", "the plan doesn't change when there's no answer");
    await page.close();
  });

  test("the microphone: listens to a real input, and explains when it's blocked", async () => {
    const page = await open(390, "light", errors);
    await click(page, "Sunna shuru karo");
    await page.waitForSelector("[data-phase=listening]", { timeout: 30_000 });
    // Chrome's fake microphone plays a beep; the meter moves and nothing is counted
    await page.waitForFunction(() => Number(document.querySelector("[role=meter]")?.getAttribute("aria-valuenow")) >= 0, { timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 3000));
    assert.equal(await count(page), 0);
    await click(page, "Band karo");
    await page.waitForSelector("[data-phase=plan]");
    await page.close();

    const blocked = await open(390, "light", errors);
    await browser.defaultBrowserContext().overridePermissions(server.base, []);
    await blocked.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    });
    await click(blocked, "Sunna shuru karo");
    await blocked.waitForSelector(".error");
    assert.match(await blocked.$eval(".error", (e) => e.textContent || ""), /Mic shuru nahi hua/);
    await blocked.close();
  });

  test("works with no internet after the first visit", async () => {
    const page = await open(390, "light", errors);
    await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), { timeout: 20_000 });
    // first run online, so the model, its runtime and the recording are kept on the phone
    await runFastDemo(page);
    await page.waitForSelector("[data-phase=done]", { timeout: 60_000 });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 20_000 });
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("main[data-ready]", { timeout: 20_000 });
    await runFastDemo(page);
    await page.waitForSelector("[data-phase=done]", { timeout: 60_000 });
    assert.equal(await count(page), 3);
    await page.setOfflineMode(false);
    await page.close();
  });

  test("no browser errors along the way", () => {
    assert.deepEqual(errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e)), []);
  });
});
