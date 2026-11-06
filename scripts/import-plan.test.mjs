// node --test scripts/import-plan.test.mjs  — plan z kolejki importów Skrótu (bez sieci).
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchImportPlan, mergeImportPlan } from "./import-plan.mjs";

const IMP = { ok: true, id: "11111111-2222-4333-8444-555555555555", zatwierdzony_at: "2026-11-06T10:00:00Z", source: "Plan zimowy",
  groups: {
    C111: { odd: [{ d: 0, s: 0, pl: "Inne", k: "W" }], even: [] },
    C114: { odd: [{ d: 0, s: 0, pl: "Prawo", en: "Law", k: "W", p: "dr Małgorzata Szymszon", r: "s. 002" }, { d: 9, s: 0, pl: "zły dzień" }],
            even: [{ d: 3, s: -1, time: ["9:00", "10:30"], pl: "Odrabianie zajęć", k: "X", n: "Jednorazowo: 19.11.2026" }, { d: 1, s: 1, pl: "" }] },
    "zła grupa": { odd: [{ d: 0, s: 0, pl: "x" }], even: [] },
    C115: { odd: [], even: [] },
  } };

test("grupy z importu tylko wtedy, gdy strony uczelni ich nie podaje; złe pozycje odpadają", () => {
  const groups = { C111: { odd: [{ d: 1, s: 0, pl: "Prawo" }], even: [] } };
  const dodane = mergeImportPlan(groups, IMP);
  assert.deepEqual(dodane, ["C114"]);
  assert.deepEqual(groups.C111.odd, [{ d: 1, s: 0, pl: "Prawo" }], "plan uczelni ma pierwszeństwo");
  assert.deepEqual(groups.C114, {
    odd: [{ d: 0, s: 0, pl: "Prawo", en: "Law", k: "W", p: "dr Małgorzata Szymszon", r: "s. 002" }],
    even: [{ d: 3, s: -1, time: ["9:00", "10:30"], pl: "Odrabianie zajęć", k: "X", n: "Jednorazowo: 19.11.2026" }],
  });
  assert.equal(groups["zła grupa"], undefined);
  assert.equal(groups.C115, undefined, "pusta grupa nie wchodzi");
});

test("bez zatwierdzonego importu plan zostaje jak był", async () => {
  const groups = { C111: { odd: [], even: [] } };
  assert.deepEqual(mergeImportPlan(groups, null), []);
  assert.deepEqual(Object.keys(groups), ["C111"]);
  assert.equal(await fetchImportPlan({ offline: true }), null);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plan-")), "odp.json");
  fs.writeFileSync(f, JSON.stringify({ ok: false }));
  assert.equal(await fetchImportPlan({ file: f }), null);
  fs.writeFileSync(f, JSON.stringify(IMP));
  assert.equal((await fetchImportPlan({ file: f })).id, IMP.id);
  fs.writeFileSync(f, "nie json");
  const log = console.log; console.log = () => {};
  assert.equal(await fetchImportPlan({ file: f }), null);
  console.log = log;
});
