import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dopiszPowiadomienie } from "./powiadomienie.mjs";

test("treść maila nie przekracza limitu GitHuba", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pow-")), "zmiany.md");
  assert.equal(dopiszPowiadomienie(f, "BM", { pierwszy: true, limit: 500 }), true);
  for (let i = 0; i < 50; i++) dopiszPowiadomienie(f, `rocznik ${i} `.repeat(5), { limit: 500 });
  const t = fs.readFileSync(f, "utf8");
  assert.ok(t.length <= 500, String(t.length));
  assert.ok(t.startsWith("BM\n\n---\n\nrocznik 0"));
  assert.equal(t.match(/nie zmieściło się/g).length, 1);
  // pierwszy (BM) zaczyna od nowa; za długa pierwsza część jest przycięta
  dopiszPowiadomienie(f, "x".repeat(2000), { pierwszy: true, limit: 500 });
  assert.ok(fs.readFileSync(f, "utf8").length <= 500);
});
