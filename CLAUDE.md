# CLAUDE.md — instrucțiuni pentru lucrul pe acest proiect

Aplicație web (rulează doar în browser, fără server) pentru proiectarea sistemelor de securitate:
planșe de amplasare, scheme bloc, catalog de echipamente, calcule și liste pentru documentația
de avizare (Legea 333/2003, HG 301/2012). Utilizatorul este proiectant de sisteme de securitate.

## Limbă

- Interfața, mesajele, comentariile din cod, commit-urile și PR-urile se scriu **în română, cu diacritice** (ă, â, î, ș, ț).
- Identificatorii din cod (variabile, funcții, tipuri) rămân în engleză sau în română fără diacritice, ca acum.

## Comenzi

```bash
npm install          # dependențe
npm run dev          # server de dezvoltare (http://localhost:5173)
npm run build        # tsc -b + build Vite în dist/
npx tsc -b           # verificare tipuri
npx eslint src       # lint
npx vite preview --port 4173   # servește build-ul, pentru teste cu Playwright
```

Înainte de commit: `npx tsc -b`, `npx eslint src` și `npm run build` trebuie să treacă fără erori.

## Arhitectură (src/)

| Fișier | Rol |
|---|---|
| `types.ts` | Modelul de date: `Project`, `Device`, `Cable`, `Sheet`, `CatalogItem`, `Accessory`, `CalcParams`, `Tool`, `Selection` |
| `symbols.ts` | Sistemele (`SYSTEMS`: EFR, CA, CCTV, INC, NET) și biblioteca de simboluri SVG (`SYMBOLS`), cu prefix, tip de cablu implicit, `hub` / `root` pentru schema bloc |
| `project.ts` | Proiect gol, migrare (`normalizeProject`), numerotare (`nextLabel`), formate de pagină, limite desen, `deviceInfo` (date din catalog) |
| `catalog.ts` | Catalogul inițial (`SEED_CATALOG`), categorii de accesorii, parametri impliciți de calcul |
| `calc.ts` | Calculele: acumulatori, stocare video, bilanț TVCI / UPS, buget PoE — funcții pure, fără UI |
| `history.ts` | Undo / redo (`commit` = cu istoric, `update` = fără, `checkpoint` la început de tragere) |
| `PlanCanvas.tsx` | Desenul planului (Konva): fundal, simboluri, conuri camere, cabluri, scară |
| `BlockCanvas.tsx` + `blockLayout.ts` | Schema bloc generată automat din echipamente și cabluri (arbore pornind de la centrală) |
| `Panels.tsx` | Paleta, proprietăți echipament / cablu, panourile Proiect / Planșă / Liste |
| `CatalogUI.tsx` | Dialogul de catalog și tab-ul Calcule |
| `exporters.ts` | PDF (pagină compusă pe canvas: chenar, desen, legendă, cartuș) și Excel (SheetJS) |
| `drawio.ts` | Export al schemelor bloc în format `.drawio` |
| `background.ts` | Încărcarea planului de fundal (PDF prin pdf.js sau imagine) |
| `App.tsx` | Starea aplicației, bara de unelte, planșe, scurtături, export |

Principii:
- **Un singur proiect, mai multe planșe.** Echipamentele și cablurile sunt comune; fiecare `Sheet` alege ce sisteme afișează (`systems`) și formatul paginii. Planșele `bloc` sunt generate din aceleași date.
- **Toată starea e în `Project`** (salvat ca `.plansa.json` și automat în `localStorage`). Orice câmp nou trebuie adăugat și în `emptyProject()` și în `normalizeProject()`, ca fișierele vechi să se deschidă în continuare.
- **Modificările trec prin istoric**: `h.commit(p => ...)`, nu se modifică starea direct.
- **Textul din PDF se desenează pe canvas** (nu cu fonturile jsPDF), ca diacriticele să apară corect.
- În Konva nu se folosește `opacity` pe forme mari (conurile camerelor): la export apar tăiate. Se folosesc culori `rgba(...)`.

## Convenții de proiectare (din proiectele reale ale utilizatorului)

- **Simboluri**: prefix + număr, implicit **fără zero în față** (CAE1, PIRW1, CMW1, BPW1, CVIE1); opțional cu două cifre (`numberPad`).
- **Wireless**: prefixul primește „W” (PIRW, CMW, BPW); echipamentele cu baterie proprie (`baterie: true`) **nu intră** în calculul acumulatorilor.
- **Tabelul de zone pentru efracție**: Nr. crt. | Modul | Zona modul | Partiție | Zona protejată | Denumire echipament | Simbol echipament | Tip detecție (întârziere / instantanee / 24h).
- **Tabelul CCTV**: Zona supravegheată | Camere alocate.
- **Listele de echipamente**: Nr. crt. | Denumire echipament | Model | Cantitate | Producător, separat pe fiecare sistem.
- **Proiectant implicit** în cartuș: ASL Security Solutions SRL.

## Formule de calcul (nu se modifică fără acordul utilizatorului)

- Acumulatori: `n = (Iv·tv + Ia·ta) / (0.86·C)`, `N = [n] + 1`; implicit tv = 23,5 h, ta = 0,5 h, C în mAh.
- Stocare video: `C_GB = BR·3600·24·Z·Ncam / (8·1024²)`, BR în kbps; varianta la detecție = × factor de activitate.
- UPS: `PA = P / cosφ` (cosφ = 0,8); autonomie estimată = Wh·0,85 / P (valoarea exactă se ia din curba producătorului).
- Bilanț TVCI: camerele alimentate PoE nu se adună separat dacă există un switch cu buget PoE (sunt incluse în consumul switch-ului).
- PoE: consum total + 20% rezervă ≤ bugetul switch-urilor.
- Verificare: proiectul de referință (Ajax HubBP + 7 camere Hikvision) trebuie să dea 130 / 400 mA → 1 acumulator, 147,8 W, ~75 min autonomie UPS, 43 W PoE.

## Date tehnice

- **Nu se inventează niciodată specificații tehnice** (consumuri, puteri, capacități). Ce nu se găsește în fișa tehnică rămâne gol, adică „de completat”.
- Pentru fișe tehnice se caută întâi pe surse românești (telesystem.ro, spy-shop.ro, kmw.ro, secpral.ro), apoi pe site-ul producătorului.

## Testare

- Testele end-to-end se fac cu Playwright (preinstalat în mediul cloud) pe `vite preview`. Scenariile se scriu în fișiere temporare, nu în repo.
- Coordonatele de pe plan se transformă în coordonate de ecran cu `window.Konva.stages[0].getAbsoluteTransform().point(...)`.
- După modificări la export: generează PDF-ul și Excel-ul și verifică vizual pagina (`pdftoppm`) și conținutul (`openpyxl`).

## Git

- Lucrul se face pe ramuri, cu pull request (draft) către `main`; nu se face push direct pe `main`.
- Mesajele de commit și descrierile PR se scriu în română.

## Direcții următoare (discutate cu utilizatorul)

- Editor de schemă propriu, în stilul draw.io: blocuri mutate liber, legături, text, forme, pornind de la schema generată.
- Generarea memoriului tehnic `.docx` în formatul folosit la avizare (capitolele I–VIII, tabele, breviar de calcul, fișe tehnice), din datele proiectului.
- Export DXF pentru AutoCAD.
