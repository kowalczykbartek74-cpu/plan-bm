# Etap 5: tekst PDF z pozycjami dla parserów planów (scripts/us/<wydział>-pdf.mjs). Bez sieci, tylko odczyt pliku.
#   python3 -I scripts/us/pdf_tekst.py plik.pdf > plik.json
# Wynik: {"strony": [{"n", "w", "h", "slowa": [[x0, y0, x1, y1, tekst, blok, linia]], "linie": [[x0, y0, x1, y1]], "prostokaty": [[x0, y0, x1, y1, wypelnienie]]}]}
# Biblioteka: PyMuPDF (pip install pymupdf==1.28.2).
import json, sys
import pymupdf

def strona(p):
    slowa = [[round(w[0], 1), round(w[1], 1), round(w[2], 1), round(w[3], 1), w[4], w[5], w[6]] for w in p.get_text("words")]
    linie, prost = [], []
    for d in p.get_drawings():
        for it in d.get("items", []):
            if it[0] == "l":
                a, b = it[1], it[2]
                linie.append([round(a.x, 1), round(a.y, 1), round(b.x, 1), round(b.y, 1)])
            elif it[0] == "re":
                r = it[1]
                f = d.get("fill")
                prost.append([round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1), "#%02x%02x%02x" % tuple(int(c * 255) for c in f) if f else None])
    return {"n": p.number + 1, "w": round(p.rect.width, 1), "h": round(p.rect.height, 1), "slowa": slowa, "linie": linie, "prostokaty": prost}

doc = pymupdf.open(sys.argv[1])
json.dump({"strony": [strona(p) for p in doc]}, sys.stdout, ensure_ascii=False)
