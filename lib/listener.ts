// The ears: YAMNet, an open audio model from Google, running in the browser through MediaPipe.
// Every quarter second it scores the last second of sound. Nothing is recorded or sent anywhere.
import type { AudioClassifier } from "@mediapipe/tasks-audio";
import type { Frame } from "./counter.ts";

const WINDOW = 0.975; // seconds of audio YAMNet looks at
export const HOP = 0.25;
const LABELS = { steam: ["Steam", "Hiss"], tone: ["Whistle", "Steam whistle"] };

let classifier: Promise<AudioClassifier> | null = null;

export function loadModel(): Promise<AudioClassifier> {
  classifier ||= (async () => {
    const { AudioClassifier, FilesetResolver } = await import("@mediapipe/tasks-audio");
    const files = await FilesetResolver.forAudioTasks("/mediapipe");
    return AudioClassifier.createFromOptions(files, {
      baseOptions: { modelAssetPath: "/models/yamnet.tflite" },
      maxResults: -1,
      scoreThreshold: 0,
      categoryAllowlist: [...LABELS.steam, ...LABELS.tone],
    });
  })();
  classifier.catch(() => (classifier = null));
  return classifier;
}

/** Scores one window of samples. */
export function score(model: AudioClassifier, samples: Float32Array, sampleRate: number, t: number): Frame {
  const result = model.classify(samples, sampleRate)[0];
  const cats = result?.classifications?.[0]?.categories ?? [];
  const get = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const db = 10 * Math.log10(sum / Math.max(samples.length, 1) + 1e-12);
  return {
    t,
    steam: Math.max(...LABELS.steam.map(get)),
    tone: Math.max(...LABELS.tone.map(get)),
    db: Math.round(db * 10) / 10,
  };
}

export type Listening = { stop: () => void; context: AudioContext };

/** Listens to the microphone and calls onFrame four times a second. */
export async function listenToMic(onFrame: (f: Frame) => void): Promise<Listening> {
  const model = await loadModel();
  // The browser's noise suppression is built to remove steady hiss, which is exactly what a whistle is.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext();
  await context.audioWorklet.addModule("/capture-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "capture");
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(node).connect(silent).connect(context.destination);

  const rate = context.sampleRate;
  const size = Math.round(WINDOW * rate);
  const ring = new Float32Array(size);
  let filled = 0;
  let sinceHop = 0;
  const hopSamples = Math.round(HOP * rate);
  const started = context.currentTime;

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const block = e.data;
    // keep the latest second of audio
    if (block.length >= size) ring.set(block.subarray(block.length - size));
    else {
      ring.copyWithin(0, block.length);
      ring.set(block, size - block.length);
    }
    filled = Math.min(size, filled + block.length);
    sinceHop += block.length;
    if (filled === size && sinceHop >= hopSamples) {
      sinceHop = 0;
      onFrame(score(model, ring.slice(), rate, context.currentTime - started));
    }
  };

  return {
    context,
    stop: () => {
      node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      context.close().catch(() => {});
    },
  };
}

/**
 * Runs a recording through the same scoring, for trying the app without a cooker.
 * At speed 1 it plays the sound and scores in step with it; faster, it scores silently.
 */
export async function listenToRecording(
  url: string,
  onFrame: (f: Frame) => void,
  { speed = 1, signal }: { speed?: number; signal?: AbortSignal } = {},
): Promise<Listening> {
  const model = await loadModel();
  const context = new AudioContext();
  const bytes = await (await fetch(url, { signal })).arrayBuffer();
  const audio = await context.decodeAudioData(bytes);
  const data = audio.getChannelData(0);
  const rate = audio.sampleRate;
  const size = Math.round(WINDOW * rate);
  const hop = Math.round(HOP * rate);

  let stopped = false;
  let player: AudioBufferSourceNode | null = null;
  if (speed === 1) {
    player = context.createBufferSource();
    player.buffer = audio;
    player.connect(context.destination);
    player.start();
  }
  const started = context.currentTime;

  (async () => {
    for (let i = 0; i + size <= data.length && !stopped && !signal?.aborted; i += hop) {
      const t = i / rate;
      const due = (t + WINDOW) / speed;
      const wait = due - (context.currentTime - started);
      if (speed === 1 && wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
      else if (i % (hop * 16) === 0) await new Promise((r) => setTimeout(r, 0)); // let the page breathe
      if (stopped) break;
      onFrame(score(model, data.subarray(i, i + size), rate, t + WINDOW));
    }
    if (!stopped) onFrame({ t: data.length / rate + 6, steam: 0, tone: 0, db: -90 }); // the end: let a last burst finish
  })();

  return {
    context,
    stop: () => {
      stopped = true;
      player?.stop();
      context.close().catch(() => {});
    },
  };
}
