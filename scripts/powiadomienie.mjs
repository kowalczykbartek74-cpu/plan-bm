// Treść maila-powiadomienia (zgłoszenie na GitHubie: zmiany.md, dziekanat.md). GitHub przyjmuje najwyżej 65 536 znaków;
// dłuższa treść = błąd kroku „Powiadom…”, a wtedy cały przebieg pada i strona się nie publikuje. Dlatego limit:
// część, która się nie mieści, zastępuje jedna linia z odesłaniem do strony stanu.
import fs from "node:fs";

export const LIMIT = 60000;
const KONIEC = "\n---\n\n_Więcej zmian nie zmieściło się w tym mailu – pełny stan: https://plan.zdawalni.pl/stan.html_\n";

// pierwszy = true: zaczyna plik od nowa (BM); inaczej dopisuje część rocznika po „---”
export function dopiszPowiadomienie(plik, tekst, { pierwszy = false, limit = LIMIT } = {}) {
  const jest = !pierwszy && fs.existsSync(plik) ? fs.readFileSync(plik, "utf8") : "";
  if (jest.endsWith(KONIEC)) return false;
  const czesc = (jest ? "\n---\n\n" : "") + tekst + "\n";
  if (jest.length + czesc.length <= limit - KONIEC.length) { fs.writeFileSync(plik, jest + czesc); return true; }
  // pierwsza część za długa sama w sobie → przycięta
  fs.writeFileSync(plik, (jest || tekst.slice(0, limit - KONIEC.length - 1)) + KONIEC);
  return false;
}
