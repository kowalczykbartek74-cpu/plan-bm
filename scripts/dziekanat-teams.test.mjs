// Odrabianie i zastępstwa z Teams (zatwierdzone w Zdawalni) w planie: dopisane raz, bez dubla z komunikatem dziekanatu.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeTeams } from "./dziekanat.mjs";

test("odrabianie z Teams trafia do planu jako dodatkowe zajęcia", () => {
  const zmiany = { C112: [], C113: [] };
  const teams = [{ id: "o1", tid: "t-be", kind: "makeup", title: "Making up missed classes", team: "BE C 112 2026/2027", z: {
    C112: [{ type: "extra", kind: "makeup", date: "2026-11-09", start: "8:15", end: "9:45", pl: "Ekonomia biznesu", k: "CW", r: "s. 003" },
           { type: "extra", kind: "makeup", date: "2026-11-12", start: "12:00", end: "13:30", pl: "Ekonomia biznesu", k: "W", r: "s. 044" }],
    C113: [{ type: "extra", kind: "makeup", date: "2026-11-12", start: "12:00", end: "13:30", pl: "Ekonomia biznesu", k: "W", r: "s. 044" }] } }];
  const posts = mergeTeams([], zmiany, teams);
  assert.equal(posts.length, 1);
  assert.equal(zmiany.C112.length, 2);
  assert.deepEqual(zmiany.C112.map((x) => [x.type, x.kind, x.date, x.start, x.r, x.src]), [
    ["extra", "makeup", "2026-11-09", "8:15", "s. 003", "teams"], ["extra", "makeup", "2026-11-12", "12:00", "s. 044", "teams"]]);
  assert.equal(zmiany.C113.length, 1);
});

test("zastępstwo: przeniesione zajęcia + nowe o tej samej godzinie", () => {
  const zmiany = { C112: [] };
  mergeTeams([], zmiany, [{ id: "o2", kind: "makeup", title: "Zastępstwo", z: { C112: [
    { type: "cancel", date: "2026-11-17", start: "8:15", pl: "Prawo", moved: true },
    { type: "extra", kind: "change", date: "2026-11-17", start: "8:15", end: "9:45", pl: "Prawo", k: "W", p: "dr Anna Nowak", r: "s. 002" }] } }]);
  assert.deepEqual(zmiany.C112.map((x) => [x.type, x.kind || "", x.moved || false, x.p || ""]), [["cancel", "", true, ""], ["extra", "change", false, "dr Anna Nowak"]]);
});

test("odrabianie, które już jest w komunikacie dziekanatu, nie dubluje się", () => {
  const zmiany = { C112: [{ type: "extra", kind: "makeup", date: "2026-11-26", start: "12:00", end: "13:30", pl: "Analiza matematyczna", k: "X", post: 4 }] };
  mergeTeams([{ url: "x" }], zmiany, [{ id: "o3", z: { C112: [{ type: "extra", kind: "makeup", date: "2026-11-26", start: "12:00", end: "13:30", pl: "Analiza matematyczna", k: "W" }] } }]);
  assert.equal(zmiany.C112.length, 1);
  assert.equal(zmiany.C112[0].src, undefined);
});
