import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { type Frame, WhistleCounter, countAll } from "../../lib/counter.ts";

// Real YAMNet output for real recordings (see test/fixtures/README.md), one row per quarter second.
function frames(name: string): Frame[] {
  const rows: number[][] = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../fixtures/frames", `${name}.json`), "utf8"));
  return rows.map(([t, steam, tone, db]) => ({ t, steam, tone, db }));
}

const whistles = (name: string, s?: "low" | "normal" | "high") => countAll(frames(name), s).events.filter((e) => e.type === "whistle");

describe("counting whistles in real recordings", () => {
  it("counts the three whistles in the demo kitchen, at the right moments", () => {
    const w = whistles("session");
    assert.equal(w.length, 3);
    // the bursts start at 62 s, 118 s and 176 s in the recording
    const starts = w.map((e) => (e.type === "whistle" ? e.start : 0));
    assert.ok(Math.abs(starts[0] - 62) < 1.5, `first at ${starts[0]}`);
    assert.ok(Math.abs(starts[1] - 118) < 1.5, `second at ${starts[1]}`);
    assert.ok(Math.abs(starts[2] - 176) < 1.5, `third at ${starts[2]}`);
    // and each is said within ten seconds of starting
    for (const e of w) if (e.type === "whistle") assert.ok(e.t - e.start <= 10, `said ${e.t - e.start}s late`);
  });

  it("hears the kettle in the demo kitchen and doesn't count it", () => {
    const k = countAll(frames("session")).events.filter((e) => e.type === "kettle");
    assert.equal(k.length, 1);
    assert.ok(k[0].t > 139 && k[0].t < 152);
  });

  it("counts the same three whistles on normal and high sensitivity; low may miss the faintest", () => {
    assert.equal(whistles("session", "high").length, 3);
    assert.equal(whistles("session", "normal").length, 3);
    const low = whistles("session", "low").length;
    assert.ok(low === 2 || low === 3, `${low}`);
  });

  for (const name of ["neg-talk1", "neg-tv1", "neg-mixer", "neg-sizzle1", "neg-sizzle2", "neg-stove", "neg-kitchen1", "neg-kitchen2"]) {
    it(`counts nothing in ${name.replace("neg-", "")}`, () => {
      assert.equal(whistles(name, "high").length, 0);
    });
  }

  it("never counts a whistling kettle, even one that steams", () => {
    for (const name of ["neg-kettle1", "neg-kettle2"]) assert.equal(whistles(name).length, 0, name);
    assert.ok(countAll(frames("neg-kettle2")).events.some((e) => e.type === "kettle"));
  });

  it("says so when a cooker hisses non-stop instead of whistling", () => {
    // a Western cooker with a pressure valve: one long hiss, not separate whistles
    const { count, events } = countAll(frames("kospak"));
    assert.equal(count, 1);
    assert.ok(events.some((e) => e.type === "steady"));
  });

  it("hears the whistles in an Indian cooker recording", () => {
    // a montage of whistle bursts a few seconds apart; close bursts merge, so it's at least one and at most the number of bursts
    const n = whistles("jibanshil-whistle").length;
    assert.ok(n >= 1 && n <= 6, `${n}`);
  });
});

describe("the counter's rules", () => {
  const steam = (t: number, s = 0.6): Frame => ({ t, steam: s, tone: 0, db: -25 });
  const quiet = (t: number): Frame => ({ t, steam: 0, tone: 0, db: -45 });
  const kettle = (t: number): Frame => ({ t, steam: 0, tone: 0.7, db: -25 });

  function feed(c: WhistleCounter, list: Frame[]) {
    return list.flatMap((f) => c.push(f));
  }

  it("needs half a second of steam, so a single spike doesn't count", () => {
    const c = new WhistleCounter();
    assert.deepEqual(feed(c, [quiet(0), steam(0.25), quiet(0.5), quiet(10)]), []);
    feed(c, [steam(20), steam(20.25)]);
    assert.equal(c.count, 0, "not until the burst is over");
    assert.deepEqual(feed(c, [quiet(26)]), [{ type: "whistle", n: 1, t: 26, start: 20 }]);
  });

  it("counts a long whistle without waiting for it to end", () => {
    const c = new WhistleCounter();
    const ev = feed(c, Array.from({ length: 40 }, (_, i) => steam(i * 0.25)));
    assert.deepEqual(ev[0], { type: "whistle", n: 1, t: 8, start: 0 });
  });

  it("waits for a kettle's tone: steam first, whistle after, still a kettle", () => {
    const c = new WhistleCounter();
    feed(c, [steam(0), steam(0.25), steam(0.5), steam(3), quiet(5), kettle(6), kettle(6.25), quiet(30)]);
    assert.equal(c.count, 0);
  });

  it("treats steam within a few seconds of a whistle as the same whistle", () => {
    const c = new WhistleCounter();
    feed(c, [steam(0), steam(0.25), steam(0.5), quiet(6), steam(10), steam(10.25), quiet(20)]);
    assert.equal(c.count, 1);
    feed(c, [steam(40), steam(40.25), quiet(50)]);
    assert.equal(c.count, 2);
  });

  it("ignores very quiet steam, like a cooker in another room", () => {
    const c = new WhistleCounter("high");
    feed(c, [0, 0.25, 0.5, 0.75].map((t) => ({ t, steam: 0.8, tone: 0, db: -60 })));
    assert.equal(c.count, 0);
  });

  it("doesn't count the steam a kettle makes around its whistle", () => {
    const c = new WhistleCounter();
    feed(c, [kettle(10), kettle(10.25), quiet(12), steam(20), steam(20.25), steam(20.5)]);
    assert.equal(c.count, 0);
    feed(c, [quiet(40), steam(60), steam(60.25), quiet(70)]);
    assert.equal(c.count, 1);
  });

  it("names a kettle once, not every second", () => {
    const c = new WhistleCounter();
    const ev = feed(c, Array.from({ length: 40 }, (_, i) => kettle(i * 0.25)));
    assert.equal(ev.filter((e) => e.type === "kettle").length, 1);
    assert.equal(c.count, 0);
  });

  it("lets the cook correct it", () => {
    const c = new WhistleCounter();
    c.add();
    c.add();
    c.undo();
    assert.equal(c.count, 1);
    c.undo();
    c.undo();
    assert.equal(c.count, 0);
  });

  it("gets stricter or looser with sensitivity", () => {
    const soft = [steam(0, 0.25), steam(0.25, 0.25), steam(0.5, 0.25), quiet(10)];
    assert.equal(countAll(soft, "normal").count, 0);
    assert.equal(countAll(soft, "high").count, 1);
  });
});
