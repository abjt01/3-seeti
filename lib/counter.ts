// Turns a stream of audio-model scores into "that was a whistle".
//
// YAMNet (the open audio model) scores a second of sound every quarter second. An Indian cooker's
// whistle comes out as Steam and Hiss, not as "Whistle": that label goes to tonal sounds like a kettle.
// So a whistle here is a short burst of steam, and a burst of tone is a kettle that must not count.
// No model in this file: it's plain logic, tested against real model output in test/fixtures.

export type Frame = {
  /** seconds since listening started */
  t: number;
  /** max of YAMNet's Steam and Hiss scores, 0..1 */
  steam: number;
  /** max of YAMNet's Whistle and Steam whistle scores, 0..1 */
  tone: number;
  /** loudness of the window in dBFS */
  db: number;
};

export type Sensitivity = "low" | "normal" | "high";

export type CounterEvent =
  | { type: "whistle"; n: number; t: number; start: number }
  | { type: "kettle"; t: number }
  | { type: "steady"; t: number };

export const THRESHOLDS: Record<Sensitivity, number> = { low: 0.4, normal: 0.3, high: 0.22 };

const MIN_FRAMES = 2; // half a second of steam before it can be a whistle
const END = 5; // seconds without steam that end a whistle; also how long to wait for a kettle's tone
const LONG = 8; // a burst this long, with no tone, is a whistle without waiting for it to end
const MERGE = 10; // steam this soon after a whistle ends is the same whistle sputtering
const STEADY = 25; // a "whistle" this long is a cooker that hisses non-stop
const QUIET_DB = -50; // too quiet to be a cooker on the same counter
const KETTLE_FRAMES = 4;
const KETTLE_SHADOW = 15; // a kettle hisses before and after it whistles; steam this close to its tone is the kettle
const KETTLE_EVERY = 30;

type Run = { start: number; last: number; frames: number; counted: boolean; merged: boolean; kettle: boolean; steadySaid: boolean };

export class WhistleCounter {
  count = 0;
  private threshold: number;
  private run: Run | null = null;
  private lastEnd = -Infinity;
  private tones: number[] = [];
  private lastKettle = -Infinity;
  private lastTone = -Infinity;

  constructor(sensitivity: Sensitivity = "normal") {
    this.threshold = THRESHOLDS[sensitivity];
  }

  setSensitivity(s: Sensitivity) {
    this.threshold = THRESHOLDS[s];
  }

  /** Feed one frame; get back anything worth saying out loud. */
  push(f: Frame): CounterEvent[] {
    const out: CounterEvent[] = [];
    const loud = f.db >= QUIET_DB;
    const steamy = loud && f.steam >= this.threshold && f.steam > f.tone;
    const tonal = loud && f.tone >= 0.4 && f.tone > f.steam;

    if (tonal) {
      this.lastTone = f.t;
      // a tone during a burst we haven't counted yet makes the whole burst a kettle
      if (this.run && !this.run.counted) this.run.kettle = true;
    }

    // the burst is over: count it now that no kettle tone followed
    if (this.run && f.t - this.run.last > END) {
      const r = this.run;
      if (!r.counted && !r.kettle && r.frames >= MIN_FRAMES) this.countRun(r, f.t, out);
      if (r.counted && !r.merged) this.lastEnd = r.last;
      if (r.counted && r.merged) this.lastEnd = Math.max(this.lastEnd, r.last);
      this.run = null;
    }

    if (steamy) {
      if (!this.run) {
        const merged = f.t - this.lastEnd <= MERGE;
        this.run = { start: f.t, last: f.t, frames: 0, counted: merged, merged, kettle: false, steadySaid: false };
      }
      const r = this.run;
      r.last = f.t;
      r.frames++;
      if (f.t - this.lastTone <= KETTLE_SHADOW) r.kettle = true;
      if (!r.counted && !r.kettle && r.frames >= MIN_FRAMES && f.t - r.start >= LONG) this.countRun(r, f.t, out);
      if (r.counted && !r.merged && !r.steadySaid && f.t - r.start >= STEADY) {
        r.steadySaid = true;
        out.push({ type: "steady", t: f.t });
      }
    }

    if (tonal && (!this.run || this.run.kettle)) {
      this.tones.push(f.t);
      this.tones = this.tones.filter((t) => f.t - t <= 3);
      if (this.tones.length >= KETTLE_FRAMES && f.t - this.lastKettle >= KETTLE_EVERY) {
        this.lastKettle = f.t;
        out.push({ type: "kettle", t: f.t });
      }
    }
    return out;
  }

  /** Call when listening stops, so a burst still waiting for its quiet seconds gets counted. */
  flush(t: number): CounterEvent[] {
    return this.push({ t: t + END + 0.01, steam: 0, tone: 0, db: -90 });
  }

  private countRun(r: Run, t: number, out: CounterEvent[]) {
    r.counted = true;
    this.count++;
    out.push({ type: "whistle", n: this.count, t, start: r.start });
  }

  /** Undo a count the cook says was wrong ("that was the kettle"). */
  undo() {
    if (this.count > 0) this.count--;
  }

  /** Add a whistle the counter missed. */
  add() {
    this.count++;
  }
}

/** Runs a whole recording's frames through a fresh counter. */
export function countAll(frames: Frame[], sensitivity: Sensitivity = "normal") {
  const c = new WhistleCounter(sensitivity);
  const events: CounterEvent[] = [];
  for (const f of frames) events.push(...c.push(f));
  if (frames.length) events.push(...c.flush(frames[frames.length - 1].t));
  return { count: c.count, events };
}
