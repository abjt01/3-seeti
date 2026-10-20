// Serves MediaPipe's audio runtime from this app instead of a CDN, so listening works offline.
import fs from "node:fs";
import path from "node:path";

const from = path.join("node_modules", "@mediapipe", "tasks-audio", "wasm");
const to = path.join("public", "mediapipe");
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
console.log(`copied ${fs.readdirSync(to).length} MediaPipe files to ${to}`);
