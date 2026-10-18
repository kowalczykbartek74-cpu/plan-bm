// Dołącza kalendarz roku (kalendarz.json) do plan.json i do kopii danych w index.html.
// Bez internetu, więc działa nawet wtedy, gdy strona uczelni nie odpowiada.
// Uruchamiane przez GitHub Actions po każdym sprawdzeniu planu i po każdej zmianie kalendarz.json.
import fs from "node:fs";

const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function check(k) {
  const err = (m) => { throw new Error("kalendarz.json: " + m); };
  if (!k || typeof k !== "object") err("to nie jest obiekt JSON");
  if (!Array.isArray(k.tygodnie) || !k.tygodnie.length) err("brak listy „tygodnie”");
  for (const t of k.tygodnie) {
    if (!Array.isArray(t) || t.length !== 3 || !isDay(t[0]) || !isDay(t[1]) || !["odd", "even"].includes(t[2]) || t[0] > t[1])
      err("zły wpis w „tygodnie”: " + JSON.stringify(t) + " (ma być [\"RRRR-MM-DD\", \"RRRR-MM-DD\", \"odd\" albo \"even\"])");
  }
  for (const [d, v] of Object.entries(k.wolne || {})) if (!isDay(d) || typeof v !== "string") err("zły wpis w „wolne”: " + d);
  for (const [d, v] of Object.entries(k.zamiany || {})) {
    if (!isDay(d) || !["odd", "even"].includes(v?.p) || !(Number.isInteger(v?.asDay) && v.asDay >= 0 && v.asDay <= 4)) err("zły wpis w „zamiany”: " + d);
  }
  for (const o of k.okresy || []) if (!isDay(o?.od) || !isDay(o?.do) || typeof o?.opis !== "string") err("zły wpis w „okresy”: " + JSON.stringify(o));
  if (k.start != null && !isDay(k.start)) err("„start” ma być datą RRRR-MM-DD");
}

const kal = JSON.parse(fs.readFileSync("kalendarz.json", "utf8"));
check(kal);
delete kal.opis;

const plan = JSON.parse(fs.readFileSync("plan.json", "utf8"));
if (JSON.stringify(plan.kalendarz) === JSON.stringify(kal)) {
  console.log("Kalendarz w plan.json jest aktualny.");
} else {
  plan.kalendarz = kal;
  fs.writeFileSync("plan.json", JSON.stringify(plan, null, 1) + "\n");
  const html = fs.readFileSync("index.html", "utf8");
  const start = "/*PLAN_DATA_START*/", end = "/*PLAN_DATA_END*/";
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < 0) throw new Error("Brak znaczników danych w index.html");
  fs.writeFileSync("index.html", html.slice(0, i + start.length) + JSON.stringify(plan) + html.slice(j));
  console.log("Dołączono kalendarz do plan.json i index.html.");
}
