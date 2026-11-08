// plan.json BM po zmianach ma być identyczny jak przed: ten sam import BM starym kodem (origin/main) i nowym,
// na tych samych stronach uczelni (lokalna atrapa z .cache/efz/), wynik porównany bajt w bajt (bez znaczników czasu).
// Bez cache (nowa kopia repo) test jest pomijany: najpierw node scripts/kierunki-1rok.mjs.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";

const CACHE = ".cache/efz";
const plikGrupy = (g) => fs.existsSync(CACHE) && fs.readdirSync(CACHE).find((f) => f.startsWith(`planGrup_numerGrupy_${g}-`));
const REF = process.env.BM_REF || "origin/main";
const maRef = (() => { try { execFileSync("git", ["rev-parse", "--verify", REF], { stdio: "ignore" }); return true; } catch { return false; } })();

test("plan.json i index.html BM: stary i nowy kod dają ten sam wynik", { skip: !plikGrupy("C111") || !maRef ? "brak .cache/efz albo " + REF : false }, async () => {
  const serwer = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/plan") { res.end("<p>Aktualizacja planu: atrapa</p>"); return; }
    const g = u.searchParams.get("numerGrupy"), f = g && plikGrupy(g);
    const t = f && fs.readFileSync(path.join(CACHE, f), "utf8");
    if (!t || t === "\u0000brak") { res.writeHead(302, { Location: "/plan" }); res.end(); return; }
    res.end(t);
  });
  await new Promise((r) => serwer.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${serwer.address().port}/`;
  const pusty = path.join(os.tmpdir(), "pusty-import.json"); fs.writeFileSync(pusty, "{}");
  const przebieg = (stary) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), stary ? "bm-stary-" : "bm-nowy-"));
    fs.mkdirSync(path.join(d, "scripts"));
    if (stary) execFileSync("sh", ["-c", `git archive ${REF} scripts | tar -x -C "${d}"`]);
    else for (const f of fs.readdirSync("scripts")) fs.copyFileSync(path.join("scripts", f), path.join(d, "scripts", f));
    for (const f of ["plan.json", "index.html"]) fs.copyFileSync(f, path.join(d, f));
    return new Promise((res, rej) => {
      import("node:child_process").then(({ execFile }) => execFile(process.execPath, ["scripts/update-plan.mjs", "--import-file", pusty],
        { cwd: d, env: { ...process.env, PLAN_BASE_URL: base, GITHUB_OUTPUT: "", GITHUB_ACTIONS: "" } }, (e, out, err) => e ? rej(new Error(err || out)) : res(d)));
    });
  };
  try {
    const [a, b] = [await przebieg(true), await przebieg(false)];
    const bezCzasu = (t) => t.replace(/"(checkedAt|changedAt)":\s*"[^"]*"/g, '"$1":"-"');
    for (const f of ["plan.json", "index.html"]) {
      assert.strictEqual(bezCzasu(fs.readFileSync(path.join(b, f), "utf8")), bezCzasu(fs.readFileSync(path.join(a, f), "utf8")), f);
    }
    // i plan z atrapy to dokładnie grupy z plan.json w repo (strony uczelni się nie zmieniły)
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(b, "plan.json"), "utf8")).groups, JSON.parse(fs.readFileSync("plan.json", "utf8")).groups);
  } finally { serwer.close(); }
});
