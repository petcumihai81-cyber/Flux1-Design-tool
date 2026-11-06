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
| `types.ts` | Modelul de date: `Project`, `Level`, `Device`, `Cable`, `Sheet`, `CatalogItem`, `Accessory`, `CalcParams`, `Tool`, `Selection` |
| `symbols.ts` | Sistemele (`SYSTEMS`: EFR, CA, CCTV, INC, NET) și biblioteca de simboluri SVG (`SYMBOLS`), cu prefix, tip de cablu implicit, `hub` / `root` pentru schema bloc |
| `project.ts` | Proiect gol, migrare (`normalizeProject`), numerotare (`nextLabel`), formate de pagină, limite desen, `deviceInfo` (date din catalog) |
| `layers.ts` | Straturile planșei de plan: chei `fundal`, `arh:pereti/goluri/text/cote/ghene`, `<SISTEM>:echipamente/etichete/cabluri`, `CCTV:conuri`; `layerVisible` (ține cont de `Sheet.systems` și `showCones`) și `layerLocked`, pe `Sheet.hiddenLayers` / `Sheet.lockedLayers`. Folosite de plan (afișare, selecție, dreptunghi), legendă și DXF; panoul e `LayersPanel` (tab-ul Straturi) |
| `symbolLibrary.ts` + `CustomSymbolDialog.tsx` | Aspectul echipamentelor: `Device.color` (culoare proprie) și simboluri personalizate (`Project.customSymbols`, `Device.symbolId` sau `CatalogItem.symbolId`). SVG curățat și încadrat în caseta 40×40, imagini tăiate la conținut și aduse la 160 px PNG transparent; recolorare (SVG: culori → culoarea aleasă; PNG: pictogramă monocromă). `deviceImage` / `loadLookImage` / `lookDataUrl` pentru plan, legendă, schemă, draw.io; biblioteca din browser (`plansa-securitate:simboluri`) pentru proiecte noi; `exportSymbols` / `readSymbolFile` (`.simboluri.json`, proiect, șablon sau pachet; SVG-ul importat se curăță din nou) / `mergeSymbols` (fără dubluri, id nou la conflict) |
| `catalog.ts` + `catalogSpecs.ts` | Catalogul inițial (`SEED_CATALOG`) cu fișele tehnice complete din proiectul de referință (`SEED_SPECS`, pe secțiuni), parsarea fișelor lipite (`parseSpecs`), categorii de accesorii, parametri impliciți de calcul |
| `calc.ts` | Calculele: acumulatori, stocare video, bilanț TVCI / UPS, buget PoE — funcții pure, fără UI |
| `history.ts` | Undo / redo (`commit` = cu istoric, `update` = fără, `checkpoint` la început de tragere) |
| `PlanCanvas.tsx` | Desenul planului (Konva): fundal, simboluri, conuri camere, cabluri, scară |
| `BlockCanvas.tsx` + `blockLayout.ts` + `diagram.ts` | Schema bloc: generată automat (arbore pornind de la centrală) sau editată manual (`Sheet.diagram`: blocuri legate de echipamente, texte, chenare, legături cu traseu ortogonal calculat sau manual — `DiagramEdge.points` = colțurile, capetele alunecă pe laturile blocurilor; `edgePath`, `moveSegment`, `alignNodes`, `distributeNodes`) |
| `Panels.tsx` | Paleta, proprietăți echipament / cablu, panourile Proiect / Planșă / Liste |
| `CatalogUI.tsx` | Dialogul de catalog și tab-ul Calcule |
| `exporters.ts` | PDF (pagină compusă pe canvas: chenar, desen, legendă, cartuș cu logo `title.logo` în rândul „Proiectant”) și Excel (SheetJS) |
| `memoriu.ts` + `memoriuDefaults.ts` + `MemoriuDialog.tsx` | Memoriul tehnic `.docx` (biblioteca `docx`): textele standard ale proiectelor avizate + date din proiect; câmpurile lipsă devin „[DE COMPLETAT]” evidențiat cu galben |
| `templates.ts` + `NewProjectDialog.tsx` + `NewProjectWizard.tsx` | Șabloane de proiect: `makeTemplate` (fără datele beneficiarului, fără planuri de fundal, desen opțional), `projectFromTemplate` (id-uri noi pentru niveluri / planșe — planurile de fundal din IndexedDB sunt legate de id-ul nivelului), șabloane de bază (`BUILTIN_TEMPLATES`), șabloanele utilizatorului în browser (`plansa-securitate:sabloane`), export / import `.sablon.json`. Asistentul (`NewProjectWizard`) pornește din proiectul gol sau din șablon și construiește proiectul pas cu pas: beneficiar, niveluri cu planuri (PDF / imagine / DXF, prin `loadBackground`, `PdfPagePicker`, `DxfImportDialog`), planșe (`buildSheets` sau planșele șablonului copiate pe nivelurile noi), cartuș, memoriu |
| `verify.ts` + `VerifyDialog.tsx` | Verificarea înainte de predare: `verifyProject` (funcție pură) întoarce erori / atenționări pe grupe, cu țintă de navigare (echipament, cablu, nivel, planșă, catalog, calcule, cartuș, memoriu); refolosește `missing` din `calc.ts`. La o regulă nouă de proiectare se adaugă și verificarea ei aici |
| `pack.ts` + `PackageDialog.tsx` + `download.ts` | Pachetul `.zip`: `makePackage` scoate data URL-urile (fundaluri, imagini `image`, logo, simboluri personalizate) în fișiere (`planuri/`, `imagini/`, `simboluri/`, `logo.*`) și le înlocuiește în `proiect.plansa.json` cu referințe `zip:<cale>`; `readPackage` le pune la loc. Toate exporturile descarcă prin `downloadBlob`; `captureDownloads` le adună (folderul `predare/` din pachet) în loc să le descarce |
| `drawio.ts` | Export al schemelor bloc în format `.drawio` |
| `dxf.ts` | Export DXF R12 (ANSI_1250) al planșei de plan: metri (y în sus), straturi `ARH_*`, `GHENE`, `<SISTEM>_ECHIPAMENTE/_CABLURI/_ETICHETE`, `CCTV_CONURI` + `CCTV_CONURI_HASURA` (R12 nu are HATCH: linii la 45°, la 2,5 mm pe hârtie, tăiate cu `hatchPolygon`); dimensiunile din mm de hârtie (note, săgeți, hașură) se convertesc cu `mmToM = 1 / (paperMmPerPx · ppm)`; simbolurile SVG convertite în blocuri; pereții întrerupți la goluri. Verificare: `ezdxf` (recover + randare PNG) |
| `background.ts` + `PdfPagePicker.tsx` | Încărcarea planului de fundal (PDF prin pdf.js sau imagine); la PDF cu mai multe pagini, alegerea paginii din miniaturi |
| `dxfImport.ts` + `DxfImportDialog.tsx` | Import DXF ca fundal: cititor propriu (ASCII R12…2018, UTF-8 sau Windows-1250), blocuri explodate (INSERT, DIMENSION), linii / polilinii cu bulge, arce, elipse, spline, hașuri, texte; dialog cu straturi, unitate (`$INSUNITS` sau ghicită) și previzualizare; randat în PNG la ≤ 100 px/m (max. ~6000 px), cu `pxPerMeter` setat direct |
| `sheetTables.ts` + `images.ts` | Adnotările planșei (tipuri noi de `ArchElement`): zone `rect` / `ellipse` (centru, `width` / `height` în m) și `polygon` (`points` închis; `polygonInfo` = arie Gauss + centru de greutate, `pointInPolygon`), cu `zoneArea` și `devicesInZone`, note `note` (`points` = [vârful săgeții, locul textului], `fontMm` pe hârtie, `boxed`) și linii `line` (`points` polilinie, `widthMm`, `dashed`, `arrowStart` / `arrowEnd`) — la ambele mânerele de vârf stau pe stratul `ui`, deasupra simbolurilor, imagini `image` (`src` data URL, păstrat în IndexedDB cu cheia `img:<id>`, nu în localStorage) și tabele `table` (`SheetTable`: echipamente / zone / cctv / cabluri, generate cu `tableData`, mărime `tableLayoutPx` din mm de hârtie). Limitele lor intră în `contentBounds` / `sheetDrawBounds` (tabelele la scara desenului fără ele) |
| `arch.ts` + `ArchShapes.tsx` | Schița de arhitectură (`Project.arch`): pereți cu grosime reală, uși, ferestre, texte, cote; lipire de vârfuri și aliniere ortogonală; schiță fără plan = 50 px/m |
| `ZoomBar.tsx` + `zoom.ts` | Bara de zoom (plan și schemă): procent raportat la planșa tipărită (`paperMmPerPx` × 96/25,4 px/mm; la schemă, încadrarea în `drawAreaMm`), presetări, încadrare, mărire pe selecție; scurtături `useZoomKeys` |
| `touch.ts` | Ecran tactil (`useTouchGestures`, folosit de `PlanCanvas` și `BlockCanvas`): `tap` / `dbltap` / `touchstart` / `touchmove` / `touchend` din Konva sunt retrimise ca `click` / `dblclick` / `mousedown` / `mousemove` / `mouseup`, cu un eveniment de mouse sintetic (buton 0, fără Shift), deci handler-ele de mouse merg neschimbate; pinch = zoom pe `view`; apăsare lungă (550 ms) = `contextmenu`; `touchend` cu `preventDefault` (fără click-uri dublate de browser) |
| `PdfPreview.tsx` | Previzualizarea paginilor înainte de descărcarea PDF |
| `HelpDialog.tsx` + `public/help/*.webp` | Ghidul din aplicație (butonul „?”), cu secțiuni „cum fac…” și capturi de ecran; se deschide singur la prima vizită |
| `App.tsx` | Starea aplicației, bara de unelte, planșe, scurtături, export |

Principii:
- **Un singur proiect, mai multe niveluri și planșe.** Fiecare `Level` (Parter, Etaj 1…) are fundalul, scara (`pxPerMeter`) și mărimea simbolurilor proprii. Echipamentele, cablurile și schița stau în listele comune ale proiectului, fiecare cu `levelId`; o planșă de plan afișează un nivel (`Sheet.levelId`) și alege sistemele (`systems`) și formatul paginii. Listele, calculele, memoriul și schemele bloc cuprind toate nivelurile. Ce depinde de scară se ia din nivelul elementului (`levelOf(p, x.levelId)`).
- **Toată starea e în `Project`** (salvat ca `.plansa.json` și automat în browser: proiectul fără planurile de fundal în `localStorage`, planurile de fundal în IndexedDB, pe id-ul nivelului — `storage.ts`). Orice câmp nou trebuie adăugat și în `emptyProject()` și în `normalizeProject()`, ca fișierele vechi să se deschidă în continuare.
- **Modificările trec prin istoric**: `h.commit(p => ...)`, nu se modifică starea direct.
- **Textul din PDF se desenează pe canvas** (nu cu fonturile jsPDF), ca diacriticele să apară corect.
- **Ramificații de cablu** (`Cable.via`): un cablu terminat pe alt cablu merge pe traseul acestuia până la capătul cu echipament central; `to` = acel echipament, iar lungimea (`cablePixels`) include porțiunea comună.
- **Ghene / treceri între niveluri** (`ArchElement` cu `kind: 'riser'`, `Cable.riser`): un cablu terminat la ghenă pe un nivel continuă pe cablul de pe alt nivel care pleacă de la aceeași ghenă (același nume, același sistem) spre un echipament central (`riserHost`); capetele logice vin din `cableEnds`, lungimea adaugă `verticalMeters` (înălțimile nivelurilor, implicit 3 m) și traseul comun, iar traseul comun (`isRiserRoute`) nu se numără separat în jurnal.
- **Planul de fundal** stă în `Level.background`; poziția și aspectul în `Level.bgX/bgY` (deplasare, px plan), `bgRotation` (grade, în jurul centrului), `bgFade` (0…0,9: dreptunghi alb `rgba` peste plan, intră și în PDF) și `bgLocked` (lipsă = blocat). Limitele vin din `backgroundBounds`; la încărcarea unui plan nou poziția și rotirea se resetează.
- **Pagină albă** (nivel fără fundal): `pageFrame` = zona de desen a planșei (`drawAreaMm`: fără chenar, legendă / cartuș, 5 mm margine) la scara din cartuș (`parseScale`), centrată în `Level.pageCenter` (lipsă = centrul desenului). Se vede pe plan ca chenar punctat (stratul `ui`), iar exportul PDF încadrează `sheetDrawBounds` (zona ∪ desen), deci scara din cartuș e reală cât timp desenul stă în zonă.
- **Simbolurile personalizate schimbă doar aspectul**: `Device.type` rămâne tipul standard (`CustomSymbol.base`), deci sistemul, cablurile, conurile, listele și calculele merg neschimbate. Imaginile colorate / personalizate se încarcă la cerere (`cachedImage` + `onSymbolImage` pentru redesenare). În DXF se folosește blocul standard, cu culoarea ACI cea mai apropiată (`nearestAci`).
- **Fără ferestrele browserului** (`window.prompt` / `confirm` / `alert`): se folosesc `askText`, `askConfirm`, `showAlert` din `dialogs.ts` (promisiuni), afișate de `DialogHost.tsx`, ca să arate ca restul aplicației.
- În Konva nu se folosește `opacity` pe forme mari (conurile camerelor): la export apar tăiate. Se folosesc culori `rgba(...)`.

## Convenții de proiectare (din proiectele reale ale utilizatorului)

- **Simboluri**: prefix + număr, implicit **fără zero în față** (CAE1, PIRW1, CMW1, BPW1, CVIE1); opțional cu două cifre (`numberPad`).
- **Wireless**: prefixul primește „W” (PIRW, CMW, BPW); echipamentele cu baterie proprie (`baterie: true`) **nu intră** în calculul acumulatorilor.
- **Tabelul de zone pentru efracție**: Nr. crt. | Modul | Zona modul | Partiție | Zona protejată | Denumire echipament | Simbol echipament | Tip detecție (întârziere / instantanee / 24h).
- **Tabelul CCTV**: Zona supravegheată | Camere alocate.
- **Listele de echipamente**: Nr. crt. | Denumire echipament | Model | Cantitate | Producător, separat pe fiecare sistem.
- **Proiectant implicit** în cartuș: ASL Security Solutions SRL. Logo-ul firmei: `TitleBlock.logo` (data URL ≤ 600 px); logo implicit în browser (`plansa-securitate:logo`, `defaultLogo` din `images.ts`) pentru proiectele noi; `logo: ''` = proiect fără logo (nu se mai completează din cel implicit).

## Formule de calcul (nu se modifică fără acordul utilizatorului)

- Acumulatori: `n = (Iv·tv + Ia·ta) / (0.86·C)`, `N = [n] + 1`; implicit tv = 23,5 h, ta = 0,5 h, C în mAh.
- Stocare video: `C_GB = BR·3600·24·Z·Ncam / (8·1024²)`, BR în kbps; varianta la detecție = × factor de activitate.
- UPS: `PA = P / cosφ` (cosφ = 0,8); autonomie estimată = Wh·0,85 / P (valoarea exactă se ia din curba producătorului).
- Bilanț TVCI: camerele alimentate PoE nu se adună separat dacă există un switch cu buget PoE (sunt incluse în consumul switch-ului).
- PoE: consum total + 20% rezervă ≤ bugetul switch-urilor.
- Verificare: proiectul de referință (Ajax HubBP + 7 camere Hikvision) trebuie să dea 130 / 400 mA → 1 acumulator, 147,8 W, ~75 min autonomie UPS, 43 W PoE.

## Memoriul tehnic

- Textele standard (preambul, normative, memorii pe subsisteme, caiete de sarcini, SSM) provin din proiectele avizate ale utilizatorului. Se modifică doar la cererea lui.
- Structura capitolelor urmează tiparul avizat, inclusiv numerotarea (Cap. IV apare de două ori: caiete de sarcini și liste; urmează V, VI, VIII).
- Pagina: A4, margini sus 1440 / dreapta 360 / jos 1134 / stânga 1080 DXA; Arial 11; titluri bold și subliniate (14 pt capitole, 12 pt subsisteme).

## Date tehnice

- **Nu se inventează niciodată specificații tehnice** (consumuri, puteri, capacități). Ce nu se găsește în fișa tehnică rămâne gol, adică „de completat”.
- Pentru fișe tehnice se caută întâi pe surse românești (telesystem.ro, spy-shop.ro, kmw.ro, secpral.ro), apoi pe site-ul producătorului.

## Testare

- Testele end-to-end se fac cu Playwright (preinstalat în mediul cloud) pe `vite preview`. Scenariile se scriu în fișiere temporare, nu în repo.
- Coordonatele de pe plan se transformă în coordonate de ecran cu `window.Konva.stages[0].getAbsoluteTransform().point(...)`.
- După modificări la export: generează PDF-ul și Excel-ul și verifică vizual pagina (`pdftoppm`) și conținutul (`openpyxl`).

## Ghidul din aplicație

- Când se schimbă interfața sau se adaugă o funcție, se actualizează și secțiunea corespunzătoare din `HelpDialog.tsx`.
- Capturile din `public/help/` (01–19) se regenerează cu Playwright pe `vite preview`, pe un plan demonstrativ (birouri 20 × 12 m, 100 px/m, cotă de 10 m), cu viewport 1400×860 și deviceScaleFactor 1.25, apoi se convertesc în WebP (calitate ~82, lățime max. 1500 px). `16-export-dxf` e randarea `ezdxf` a unui DXF exportat. Scripturile sunt temporare, nu se pun în repo.

## Git

- Lucrul se face pe ramuri, cu pull request (draft) către `main`; nu se face push direct pe `main`.
- Mesajele de commit și descrierile PR se scriu în română.

## Versiune și jurnal de actualizări

- Versiunea = `1.<numărul PR-ului>` (ex. PR #43 → 1.43). În fiecare PR: o intrare nouă **sus** în `CHANGELOG` din `src/changelog.ts` (titlu + 1–2 rânduri pentru utilizator) și aceeași versiune în `package.json` (`1.43.0`). La o funcție nouă importantă se actualizează și `FEATURES`.
- Versiunea, data build-ului și commit-ul intră în aplicație din `vite.config.ts` (`__APP_VERSION__`, `__BUILD_DATE__`, `__BUILD_COMMIT__`) și se văd în fereastra „Despre” (`AboutDialog.tsx`, click pe numele aplicației).

## Backlog

- Ideile și lucrurile de făcut sunt în **`BACKLOG.md`** (pe priorități P1–P3), împreună cu lista funcțiilor realizate (cu numărul PR-ului).
- La începutul unei sesiuni se citește `BACKLOG.md`. Când utilizatorul propune ceva nou, se adaugă acolo; când un PR se unește, elementul trece la „Realizat”.
