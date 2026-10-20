import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISHES, QUICK, checkPlan, lookup } from "../../lib/dishes.ts";
import { kettleLine, simmerLine, startLine, whistleLine } from "../../lib/words.ts";

describe("the dish table", () => {
  it("knows a dish by its everyday names", () => {
    assert.equal(lookup("dal")?.dish, "Toor dal");
    assert.equal(lookup("Arhar")?.whistles, 3);
    assert.equal(lookup("chawal")?.dish, "Rice");
    assert.equal(lookup("Rajma!")?.simmer, 10);
    assert.equal(lookup("kabuli chana")?.dish, "Chole");
    assert.equal(lookup("rajma ki")?.dish, "Rajma");
  });

  it("prefers the longer name: 'chana dal' is not 'dal'", () => {
    assert.equal(lookup("chana dal")?.dish, "Chana dal");
  });

  it("leaves anything with more to it for the model", () => {
    assert.equal(lookup("rajma bina bhigoye"), null);
    assert.equal(lookup("aadha kilo mutton"), null);
    assert.equal(lookup(""), null);
  });

  it("has sane numbers for every dish, and the quick picks are all in it", () => {
    for (const d of DISHES) {
      assert.ok(d.whistles >= 1 && d.whistles <= 12, d.dish);
      assert.ok((d.simmer ?? 0) >= 0 && (d.simmer ?? 0) <= 45, d.dish);
    }
    for (const q of QUICK) assert.ok(lookup(q), q);
  });
});

describe("holding a model's answer to limits", () => {
  it("accepts a sensible plan and tidies it", () => {
    assert.deepEqual(checkPlan({ dish: " Lauki chana dal ", whistles: "4", simmer: 0, note: "  Cook until\nsoft " }, "x"), {
      dish: "Lauki chana dal",
      whistles: 4,
      simmer: 0,
      note: "Cook until soft",
      source: "model",
    });
  });

  it("refuses counts no cooker needs", () => {
    assert.equal(checkPlan({ whistles: 0 }, "chai"), null);
    assert.equal(checkPlan({ whistles: 25 }, "x"), null);
    assert.equal(checkPlan({ whistles: "many" }, "x"), null);
    assert.equal(checkPlan("six", "x"), null);
  });

  it("caps the simmer time and fills in the dish name", () => {
    const p = checkPlan({ whistles: 5, simmer: 300 }, "kala chana");
    assert.equal(p?.simmer, 45);
    assert.equal(p?.dish, "Kala chana");
  });
});

describe("what the phone says", () => {
  it("counts in Hindi and says when to stop", () => {
    assert.equal(whistleLine(1, 3, "hi"), "Pehli seeti. Do aur.");
    assert.equal(whistleLine(2, 3, "hi"), "Doosri seeti. Bas ek aur.");
    assert.equal(whistleLine(3, 3, "hi"), "Teesri seeti. Gas band kar do!");
  });

  it("counts in English", () => {
    assert.equal(whistleLine(1, 6, "en"), "First whistle. 5 more to go.");
    assert.equal(whistleLine(6, 6, "en"), "Sixth whistle. Turn off the gas!");
  });

  it("still says something past twelve, and for the rest of the kitchen", () => {
    assert.match(whistleLine(13, 14, "en"), /Whistle 13/);
    assert.match(startLine(3, "Toor dal", "hi"), /teen seeti/);
    assert.match(simmerLine(10, "en"), /10 minutes/);
    assert.match(kettleLine("hi"), /kettle/);
  });
});
