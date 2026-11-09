# Etap 5, WT: siatka tabeli ze SKANU planu (strona = obraz) – tylko do wycinków pilota i kontroli odczytu, nie do czytania treści.
#   python3 -I scripts/us/skan_siatka.py plik.pdf  →  {"dni": [[y linii wierszy dnia…]…], "pionowe": [x granic kolumn lat…]} (punkty PDF)
# Poziome linie = linie przechodzące przez kolumnę godzin (x 52–70 pt); przerwa < 15 pt = granica między dniami.
# Pionowe linie = granice kolumn w wierszu nagłówka nad pierwszym dniem („ROK 1”…).
import sys, json, pymupdf
d = pymupdf.open(sys.argv[1]); p = d[0]
Z = 2
pix = p.get_pixmap(dpi=72*Z, colorspace=pymupdf.csGRAY)
W, H, s = pix.width, pix.height, pix.samples
px = lambda x, y: s[y*W + x]
# 1) kolumna godzin: pionowy pas, gdzie są cyfry godzin – szukamy poziomych linii przechodzących przez x = 50..72 pt
def poziome(x0, x1, th=215):
    ys = [y for y in range(H) if sum(1 for x in range(int(x0*Z), int(x1*Z)) if px(x, y) < th) > (x1-x0)*Z*0.9]
    g = []
    for y in ys:
        if g and y - g[-1][-1] <= 2: g[-1].append(y)
        else: g.append([y])
    return [round(sum(x)/len(x)/Z, 1) for x in g]
linie = poziome(52, 70)
dni, cur = [], [linie[0]]
for a, b in zip(linie, linie[1:]):
    if b - a < 15: dni.append(cur); cur = [b]
    else: cur.append(b)
dni.append(cur)
dni = [x for x in dni if len(x) >= 2]
# 2) kolumny lat: pionowe linie w wierszu nagłówka (pierwsza linia pozioma szerokiej tabeli nad dniami)
def pionowe(y0, y1, th=200):
    xs = [x for x in range(W) if sum(1 for y in range(int(y0*Z), int(y1*Z)) if px(x, y) < th) > (y1-y0)*Z*0.9]
    g = []
    for x in xs:
        if g and x - g[-1][-1] <= 2: g[-1].append(x)
        else: g.append([x])
    return [round(sum(v)/len(v)/Z, 1) for v in g]
print(json.dumps({"dni": dni, "pionowe": pionowe(dni[0][0] - 25, dni[0][0] - 14)}))
