# plan.skrotbm.pl → plan.zdawalni.pl

Stary adres planu zajęć. Plan jest teraz w repo [plan-bm](https://github.com/kowalczykbartek74-cpu/plan-bm) pod adresem **https://plan.zdawalni.pl**.

- `index.html`, `skrzynka.html`, `404.html` (ten sam plik): przekierowanie na plan.zdawalni.pl z zachowaniem adresu
  (`#/wefiz/zarz/1/c151`, `?k=zarz26`, `/skrzynka.html`) i ustawień z tej domeny (grupa, podgrupa, kierunek, motyw, język)
  przez `plan.zdawalni.pl/przenies.html`.
- `kalendarz/*.ics`, `plan.json`, `plan/*.json`: kopie z plan-bm (workflow `kopia-planu.yml` co 30 min).
  Studenci BM mają w telefonach subskrypcje `plan.skrotbm.pl/kalendarz/C112.ics`; aplikacje kalendarza nie przechodzą
  przez przekierowanie strony, więc te pliki muszą tu leżeć naprawdę. UID-y wydarzeń są te same co na plan.zdawalni.pl,
  więc nic się nie dubluje.
- Zawartość tego repo powstaje w plan-bm: `docs/plan-skrotbm-przekierowanie/`. Tam ją zmieniaj.

Domenę skrotbm.pl opłacaj tak długo, jak ktoś może mieć starą subskrypcję kalendarza (co najmniej do końca roku akademickiego 2026/27).
