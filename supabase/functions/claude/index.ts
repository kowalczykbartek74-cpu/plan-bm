// Funkcja serwerowa „claude” dla Skrót BM: przyjmuje prompt od zalogowanego administratora,
// pyta Claude przez API Anthropic i zwraca odpowiedź jako JSON ({ json: ... }).
// Wymaga sekretu ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const ORIGINS = ["https://skrotbm.pl", "https://www.skrotbm.pl", "https://kowalczykbartek74-cpu.github.io"];

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const h = { ...cors(req), "Content-Type": "application/json" };
  const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(405, { code: "method", message: "Tylko POST." });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return out(500, { code: "no_key", message: "Brak ANTHROPIC_API_KEY w sekretach Supabase." });

  // Kto pyta: tylko administratorzy z tabeli nauka_admini
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: me, error } = await sb.rpc("nauka_ja");
  if (error || !me?.admin) return out(403, { code: "not_granted", message: "AI jest dostępne tylko dla starosty." });

  let prompt = "";
  try { prompt = String((await req.json())?.prompt || ""); } catch { /* pusty */ }
  if (!prompt) return out(400, { code: "empty", message: "Brak treści zapytania." });
  if (new TextEncoder().encode(prompt).length > 160000) return out(413, { code: "prompt_too_large", message: "Za długie zapytanie." });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: "Reply with exactly one valid JSON value and nothing else: no prose, no code fences.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (res.status === 429 || res.status === 529) return out(429, { code: "rate_limited", message: "Za dużo zapytań. Spróbuj za minutę." });
  if (!res.ok) return out(502, { code: "upstream", message: "API Anthropic zwróciło błąd " + res.status + "." });

  const msg = await res.json();
  const text: string = (msg.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
  if (!text) return out(502, { code: "empty_completion", message: "Pusta odpowiedź AI." });
  const s = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  try { return out(200, { json: JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s) }); }
  catch { return out(502, { code: "invalid_json", message: "AI zwróciło niepoprawny JSON." }); }
});
