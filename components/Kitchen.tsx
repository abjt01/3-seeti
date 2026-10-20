"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type CounterEvent, type Frame, type Sensitivity, WhistleCounter } from "@/lib/counter";
import { DISHES, type Plan, QUICK, lookup } from "@/lib/dishes";
import type { Listening } from "@/lib/listener";
import { type Lang, kettleLine, simmerDoneLine, simmerLine, startLine, steadyLine, whistleLine } from "@/lib/words";

type Phase = "plan" | "listening" | "done" | "simmer" | "finished";
type LogItem = { id: number; text: string; at: string; kind: "whistle" | "note" | "fix" };

const DEMO = "/demo/kitchen-session.mp3";
const noop = () => () => {};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function clock() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function speak(text: string, lang: Lang, on: boolean) {
  if (!on || typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const voice = lang === "hi" ? voices.find((v) => v.lang === "hi-IN") || voices.find((v) => v.lang === "en-IN") : voices.find((v) => v.lang === "en-IN") || voices.find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  u.lang = voice?.lang || (lang === "hi" ? "hi-IN" : "en-IN");
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

// A kitchen timer's beep, made in the browser so it works offline.
function beep(times = 3) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 1320;
      o.type = "square";
      const at = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.3);
    }
    setTimeout(() => ctx.close(), times * 350 + 400);
  } catch {}
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

const T = {
  en: {
    what: "What's in the cooker?",
    type: "Or type it: rajma not soaked, half kilo mutton…",
    ask: "Ask",
    asking: "Asking…",
    whistles: "Whistles",
    simmer: "Then on low",
    min: "min",
    none: "none",
    start: "Start listening",
    demo: "No cooker right now? Try a recorded kitchen",
    demoFast: "Run it fast, without sound",
    of: "of",
    hearing: "Steam I can hear",
    listening: "Listening. Put the phone near the cooker and go.",
    missed: "+1 it missed one",
    wrong: "−1 that wasn't one",
    stop: "Stop",
    gasOff: "Turn off the gas!",
    doneBtn: "Gas is off",
    lowFor: "Keep it on low",
    finished: "All done.",
    again: "Cook something else",
    settings: "Settings",
    sensitivity: "Sensitivity",
    voice: "Say it out loud",
    usual: "usual",
    model: "asked the model",
    you: "you set it",
    privacy: "Listening happens on this phone. No sound is recorded or sent anywhere.",
    micError: "The microphone didn't start. Allow it in the browser's site settings and try again.",
    modelError: "The listening model didn't load. Check the connection once; after that it works offline.",
    loading: "Loading the ears…",
    sens: { low: "Low", normal: "Normal", high: "High" } as Record<Sensitivity, string>,
  },
  hi: {
    what: "Cooker mein kya hai?",
    type: "Ya likho: rajma bina bhigoye, aadha kilo mutton…",
    ask: "Poocho",
    asking: "Pooch raha hoon…",
    whistles: "Seeti",
    simmer: "Phir dheemi aanch",
    min: "min",
    none: "nahi",
    start: "Sunna shuru karo",
    demo: "Abhi cooker nahi hai? Recorded kitchen pe aazmao",
    demoFast: "Tez chalao, bina awaaz",
    of: "mein se",
    hearing: "Steam ki awaaz",
    listening: "Sun raha hoon. Phone cooker ke paas rakho aur jao.",
    missed: "+1 ek chhoot gayi",
    wrong: "−1 woh seeti nahi thi",
    stop: "Band karo",
    gasOff: "Gas band karo!",
    doneBtn: "Gas band kar di",
    lowFor: "Dheemi aanch pe rakho",
    finished: "Ho gaya.",
    again: "Kuch aur banao",
    settings: "Settings",
    sensitivity: "Kitna dhyaan se sune",
    voice: "Bol ke batao",
    usual: "aam taur pe",
    model: "model se poocha",
    you: "aapne rakha",
    privacy: "Sunna isi phone pe hota hai. Koi awaaz record ya kahin bheji nahi jaati.",
    micError: "Mic shuru nahi hua. Browser ki site settings mein mic allow karo aur dobara try karo.",
    modelError: "Sunne wala model load nahi hua. Ek baar internet check karo; uske baad bina internet chalta hai.",
    loading: "Kaan taiyaar ho rahe hain…",
    sens: { low: "Kam", normal: "Theek", high: "Zyada" } as Record<Sensitivity, string>,
  },
};

export default function Kitchen() {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [lang, setLang] = useState<Lang>("hi");
  const [plan, setPlan] = useState<Plan>(() => lookup("Toor dal")!);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("normal");
  const [voice, setVoice] = useState(true);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState("");
  const [phase, setPhase] = useState<Phase>("plan");
  const [count, setCount] = useState(0);
  const [level, setLevel] = useState(0);
  const [log, setLog] = useState<LogItem[]>([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<"mic" | "demo" | "fast">("mic");
  const [left, setLeft] = useState(0);

  const counter = useRef(new WhistleCounter("normal"));
  const listening = useRef<Listening | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const alarm = useRef<ReturnType<typeof setInterval> | null>(null);
  const settings = useRef({ lang, voice, plan });
  const logId = useRef(0);
  const simmered = useRef(false);

  const t = T[lang];

  // restore the cook's last choices once the page is running in the browser
  useEffect(() => {
    if (!ready) return;
    const saved = read("ts-settings", { lang: "hi" as Lang, sensitivity: "normal" as Sensitivity, voice: true });
    const savedPlan = read<Plan | null>("ts-plan", null);
    queueMicrotask(() => {
      setLang(saved.lang);
      setSensitivity(saved.sensitivity);
      setVoice(saved.voice);
      if (savedPlan?.dish && savedPlan.whistles >= 1 && savedPlan.whistles <= 12) setPlan(savedPlan);
    });
  }, [ready]);

  useEffect(() => {
    settings.current = { lang, voice, plan };
    if (ready) {
      write("ts-settings", { lang, sensitivity, voice });
      write("ts-plan", plan);
    }
    counter.current.setSensitivity(sensitivity);
  }, [lang, voice, plan, sensitivity, ready]);

  // leaving the page stops the mic and any alarm
  useEffect(() => {
    const l = listening;
    const a = alarm;
    return () => {
      l.current?.stop();
      if (a.current) clearInterval(a.current);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  // the simmer countdown
  useEffect(() => {
    if (phase !== "simmer") return;
    const timer = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          const { lang, voice } = settings.current;
          speak(simmerDoneLine(lang), lang, voice);
          beep();
          if (alarm.current) clearInterval(alarm.current);
          alarm.current = setInterval(() => beep(), 4000);
          setPhase("done");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function addLog(text: string, kind: LogItem["kind"]) {
    setLog((l) => [{ id: ++logId.current, text, at: clock(), kind }, ...l].slice(0, 30));
  }

  function startAlarm() {
    stopAlarm();
    beep();
    alarm.current = setInterval(() => beep(), 4000);
  }
  function stopAlarm() {
    if (alarm.current) clearInterval(alarm.current);
    alarm.current = null;
  }

  function stopListening() {
    listening.current?.stop();
    listening.current = null;
    wake.current?.release().catch(() => {});
    wake.current = null;
  }

  function stopEverything() {
    stopListening();
    stopAlarm();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  function onEvents(events: CounterEvent[]) {
    const { lang, voice, plan } = settings.current;
    for (const e of events) {
      if (e.type === "whistle") {
        setCount(e.n);
        addLog(lang === "hi" ? `Seeti ${e.n}` : `Whistle ${e.n}`, "whistle");
        speak(whistleLine(e.n, plan.whistles, lang), lang, voice);
        if (e.n >= plan.whistles) {
          stopListening();
          setPhase("done");
          startAlarm();
        }
      } else if (e.type === "kettle") {
        addLog(kettleLine(lang), "note");
        speak(kettleLine(lang), lang, voice);
      } else if (e.type === "steady") {
        addLog(steadyLine(lang), "note");
        speak(steadyLine(lang), lang, voice);
      }
    }
  }

  function onFrame(f: Frame) {
    setLevel(f.steam);
    onEvents(counter.current.push(f));
  }

  async function start(how: "mic" | "demo" | "fast") {
    setError("");
    setStarting(true);
    setMode(how);
    counter.current = new WhistleCounter(sensitivity);
    simmered.current = false;
    setCount(0);
    setLog([]);
    try {
      const { listenToMic, listenToRecording } = await import("@/lib/listener");
      listening.current = how === "mic" ? await listenToMic(onFrame) : await listenToRecording(DEMO, onFrame, { speed: how === "fast" ? 16 : 1 });
      try {
        wake.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {}
      setPhase("listening");
      speak(startLine(plan.whistles, plan.dish, lang), lang, voice);
    } catch (err) {
      const name = (err as Error)?.name || "";
      setError(/NotAllowed|NotFound|NotReadable|Security/.test(name) ? t.micError : t.modelError);
    } finally {
      setStarting(false);
    }
  }

  function gasOff() {
    stopAlarm();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    // the whistles are done; some dishes then need a while on a low flame
    if (plan.simmer > 0 && !simmered.current) {
      simmered.current = true;
      setLeft(plan.simmer * 60);
      setPhase("simmer");
      speak(simmerLine(plan.simmer, lang), lang, voice);
      return;
    }
    setPhase("finished");
  }

  function fix(delta: 1 | -1) {
    if (delta === 1) counter.current.add();
    else counter.current.undo();
    const n = counter.current.count;
    setCount(n);
    addLog(delta === 1 ? `+1 → ${n}` : `−1 → ${n}`, "fix");
    if (n >= plan.whistles) {
      stopListening();
      setPhase("done");
      speak(whistleLine(n, plan.whistles, lang), lang, voice);
      startAlarm();
    }
  }

  async function ask(text: string) {
    const known = lookup(text);
    setAskNote("");
    if (known) {
      setPlan(known);
      setInput("");
      return;
    }
    setAsking(true);
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dish: text }) });
      const data = await res.json();
      if (data.plan) {
        setPlan(data.plan);
        setInput("");
      } else setAskNote(data.why || data.error || "Set the number of whistles yourself.");
    } catch {
      setAskNote(lang === "hi" ? "Internet nahi hai. Seeti khud set karo." : "No connection. Set the whistles yourself.");
    } finally {
      setAsking(false);
    }
  }

  const sourceLabel = plan.source === "table" ? t.usual : plan.source === "model" ? t.model : t.you;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <main className="wrap" data-ready={ready ? "" : undefined} data-phase={phase}>
      <div className="langs" role="group" aria-label="Language">
        {(["hi", "en"] as const).map((l) => (
          <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
            {l === "hi" ? "हिंदी" : "English"}
          </button>
        ))}
      </div>

      {phase === "plan" && (
        <>
          <section className="card">
            <h2>{t.what}</h2>
            <div className="chips">
              {QUICK.map((d) => (
                <button key={d} type="button" className={plan.dish === d ? "chip on" : "chip"} onClick={() => setPlan(lookup(d)!)}>
                  {d}
                </button>
              ))}
            </div>
            <form
              className="ask"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) ask(input);
              }}
            >
              <input type="text" value={input} maxLength={120} placeholder={t.type} aria-label={t.type} list="dishes" onChange={(e) => setInput(e.target.value)} />
              <datalist id="dishes">
                {DISHES.map((d) => (
                  <option key={d.dish} value={d.dish} />
                ))}
              </datalist>
              <button type="submit" className="btn ghost" disabled={!ready || asking || !input.trim()}>
                {asking ? t.asking : t.ask}
              </button>
            </form>
            {askNote && (
              <p className="note warn" role="status">
                {askNote}
              </p>
            )}

            <div className="plan" aria-live="polite">
              <div className="plan-head">
                <strong className="dish">{plan.dish}</strong>
                <span className="source">{sourceLabel}</span>
              </div>
              <div className="steppers">
                <div className="stepper">
                  <span>{t.whistles}</span>
                  <button type="button" aria-label="One fewer whistle" onClick={() => setPlan({ ...plan, whistles: Math.max(1, plan.whistles - 1), source: "you" })}>
                    −
                  </button>
                  <output className="big" aria-label={t.whistles}>
                    {plan.whistles}
                  </output>
                  <button type="button" aria-label="One more whistle" onClick={() => setPlan({ ...plan, whistles: Math.min(12, plan.whistles + 1), source: "you" })}>
                    +
                  </button>
                </div>
                <div className="stepper">
                  <span>{t.simmer}</span>
                  <button type="button" aria-label="Five minutes less" onClick={() => setPlan({ ...plan, simmer: Math.max(0, plan.simmer - 5), source: "you" })}>
                    −
                  </button>
                  <output className="big small-out">{plan.simmer ? `${plan.simmer} ${t.min}` : t.none}</output>
                  <button type="button" aria-label="Five minutes more" onClick={() => setPlan({ ...plan, simmer: Math.min(45, plan.simmer + 5), source: "you" })}>
                    +
                  </button>
                </div>
              </div>
              {plan.note && <p className="note">{plan.note}</p>}
            </div>
          </section>

          <button type="button" className="btn huge" disabled={!ready || starting} onClick={() => start("mic")}>
            {starting && mode === "mic" ? t.loading : t.start}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="demo-links">
            <button type="button" className="link" disabled={!ready || starting} onClick={() => start("demo")}>
              {starting && mode === "demo" ? t.loading : t.demo}
            </button>
            <button type="button" className="link small" disabled={!ready || starting} onClick={() => start("fast")}>
              {t.demoFast}
            </button>
          </div>
          <p className="privacy">{t.privacy}</p>

          <details className="settings">
            <summary>{t.settings}</summary>
            <fieldset>
              <legend>{t.sensitivity}</legend>
              <div className="seg">
                {(["low", "normal", "high"] as const).map((s) => (
                  <label key={s}>
                    <input type="radio" name="sens" checked={sensitivity === s} onChange={() => setSensitivity(s)} />
                    <span>{t.sens[s]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="check">
              <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
              {t.voice}
            </label>
          </details>
        </>
      )}

      {phase !== "plan" && (
        <section className={`stage ${phase}`} aria-live="polite">
          <p className="stage-dish">
            {plan.dish}
            {mode !== "mic" && <span className="tag">recorded kitchen</span>}
          </p>

          {(phase === "listening" || phase === "done") && (
            <>
              <div className="count" data-testid="count">
                <span className="n">{count}</span>
                <span className="of">
                  {t.of} {plan.whistles}
                </span>
              </div>
              <div className="dots" aria-hidden="true">
                {Array.from({ length: plan.whistles }, (_, i) => (
                  <span key={i} className={i < count ? "dot on" : "dot"} />
                ))}
              </div>
            </>
          )}

          {phase === "listening" && (
            <>
              <p className="status">{t.listening}</p>
              <div className="meter" role="meter" aria-label={t.hearing} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.round(level * 100) / 100}>
                <span style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              <p className="meter-label">{t.hearing}</p>
              <div className="fixes">
                <button type="button" className="btn ghost" onClick={() => fix(1)}>
                  {t.missed}
                </button>
                <button type="button" className="btn ghost" disabled={count === 0} onClick={() => fix(-1)}>
                  {t.wrong}
                </button>
              </div>
              <button
                type="button"
                className="btn plain"
                onClick={() => {
                  stopEverything();
                  setPhase("plan");
                }}
              >
                {t.stop}
              </button>
            </>
          )}

          {phase === "done" && (
            <div className="alarm" role="alert">
              <p className="gas">{t.gasOff}</p>
              <button type="button" className="btn huge" onClick={gasOff}>
                {t.doneBtn}
              </button>
            </div>
          )}

          {phase === "simmer" && (
            <div className="simmer">
              <p className="gas calm">{t.lowFor}</p>
              <p className="timer" data-testid="timer">
                {mm}:{ss}
              </p>
              <button
                type="button"
                className="btn plain"
                onClick={() => {
                  setLeft(0);
                  setPhase("finished");
                }}
              >
                {t.stop}
              </button>
            </div>
          )}

          {phase === "finished" && (
            <div className="finished">
              <p className="gas calm">{t.finished}</p>
              <button
                type="button"
                className="btn huge"
                onClick={() => {
                  stopEverything();
                  setCount(0);
                  setLog([]);
                  setPhase("plan");
                }}
              >
                {t.again}
              </button>
            </div>
          )}

          {log.length > 0 && (
            <ol className="log">
              {log.map((l) => (
                <li key={l.id} className={l.kind}>
                  <span>{l.text}</span>
                  <time>{l.at}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
