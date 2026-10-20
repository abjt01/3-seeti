// The API and static files against the built app, with no AI key (MOCK_MODEL).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startServer } from "./helpers/server.ts";

let server: Awaited<ReturnType<typeof startServer>>;
before(async () => (server = await startServer()));
after(() => server?.stop());

const plan = async (body: unknown, raw = false) => {
  const res = await fetch(`${server.base}/api/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};

describe("plan API", () => {
  it("answers everyday dishes from the table, no model needed", async () => {
    const { status, data } = await plan({ dish: "rajma" });
    assert.equal(status, 200);
    assert.deepEqual(data.plan, { dish: "Rajma", whistles: 6, simmer: 10, note: "Soaked overnight. Not soaked? Ask for that.", source: "table" });
  });

  it("says plainly when it can't help without the model", async () => {
    const { status, data } = await plan({ dish: "rajma bina bhigoye" });
    assert.equal(status, 200);
    assert.equal(data.plan, null);
    assert.match(data.why, /Set the number of whistles yourself/);
  });

  it("refuses empty, oversized and broken requests", async () => {
    assert.equal((await plan({ dish: "" })).status, 400);
    assert.equal((await plan({ dish: "x".repeat(121) })).status, 400);
    assert.equal((await plan({})).status, 400);
    assert.equal((await plan("not json", true)).status, 400);
  });
});

describe("what the phone downloads to listen offline", () => {
  for (const [file, type] of [
    ["/models/yamnet.tflite", ""],
    ["/mediapipe/audio_wasm_internal.wasm", "application/wasm"],
    ["/mediapipe/audio_wasm_internal.js", "javascript"],
    ["/capture-worklet.js", "javascript"],
    ["/sw.js", "javascript"],
    ["/demo/kitchen-session.mp3", "audio/mpeg"],
    ["/manifest.webmanifest", "manifest"],
  ]) {
    it(`serves ${file}`, async () => {
      const res = await fetch(server.base + file);
      assert.equal(res.status, 200);
      if (type) assert.match(res.headers.get("content-type") || "", new RegExp(type));
    });
  }

  it("serves the model whole", async () => {
    const buf = new Uint8Array(await (await fetch(`${server.base}/models/yamnet.tflite`)).arrayBuffer());
    assert.ok(buf.length > 4_000_000);
    assert.equal(new TextDecoder().decode(buf.slice(4, 8)), "TFL3");
  });

  it("is healthy and serves the page", async () => {
    assert.equal((await fetch(`${server.base}/healthz`)).status, 200);
    const html = await (await fetch(server.base)).text();
    assert.match(html, /3 Seeti/);
  });
});
