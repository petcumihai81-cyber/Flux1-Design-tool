# Planșe Securitate (Flux1 Design Tool)

Aplicație web pentru desenarea planșelor de amplasare și a schemelor bloc la sistemele de securitate:
**alarmare la efracție**, **control acces**, **supraveghere video (CCTV)**,
**detecție și semnalizare incendiu** și **rețea de date (cablare structurată)**.

Rulează integral în browser. Nu are server și nu trimite date nicăieri.

## Ce face

- **Plan de fundal**: încarci planul clădirii ca PDF (orice pagină) sau imagine.
- **Calibrare scară**: unealta *Scară* → click pe capetele unei cote cunoscute → introduci lungimea în metri.
- **Bibliotecă de simboluri** pe cele 4 subsisteme: plasare prin click sau drag & drop, cu numerotare automată (PIR01, CVe02, DF03…).
- **Camere video** cu con de vizualizare la scară reală: se reglează direct pe plan (vârful conului = distanța, marginile = unghiul, mânerul albastru = rotirea; `Shift` = fără pas) sau din panoul de proprietăți. Unghiul și distanța pot fi trecute în catalog pe fiecare model de cameră.
- **Trasee de cablu** între echipamente, cu lungime calculată din scară, rezervă configurabilă și tip de cablu propus automat după echipament.
- **Proprietăți per echipament**: cod, model, zonă protejată, partiție sau buclă, observații.
- **Mai multe planșe în același proiect** (bara de jos): o planșă cu toate sistemele sau, automat, câte o planșă pentru fiecare sistem.
  Fiecare planșă are titlul, numărul, scara, formatul (A0–A4 sau dimensiune personalizată în mm), orientarea (peisaj sau portret) și sistemele afișate proprii.
- **Scheme bloc generate automat** din echipamentele și cablurile de pe plan (centrală → module → detectoare, NVR → switch → camere, rack → switch → prize).
  Echipamentele fără cablu desenat apar legate punctat de centrală.
- **Editor de schemă** în stilul draw.io: „Editează schema” transformă schema generată într-una editabilă. Blocurile se mută liber (cu aliniere pe grilă),
  legăturile le urmăresc, se pot trage legături noi (eticheta se completează din cablul de pe plan), se adaugă texte și chenare de grupare,
  cu culori și linii punctate. Echipamentele rămân legate de plan; cele adăugate ulterior apar ca „neplasate”. „Regenerează” refă schema automat.
- **Export draw.io**: schemele bloc ca fișier `.drawio` editabil, cu câte o pagină pe sistem.
- **Export PDF** pentru planșa curentă sau pentru toate planșele într-un singur PDF (formate diferite pe pagini diferite), cu chenar, legendă automată (simboluri folosite + cantități) și cartuș.
- **Export Excel** cu patru foi:
  - *Echipamente*: structura fiecărui sistem (denumire, model, cantitate, producător)
  - *Zone protejate*: modul, zona modulului, partiție, zona protejată, simbol, tip detecție; plus camerele grupate pe zone
  - *Jurnal cablu*: cod, de la, la, tip cablu, lungime, traseu, plus totaluri pe tip de cablu
  - *Breviar calcul*: acumulatori, stocare video, bilanț TVCI / UPS, buget PoE
- **Catalog de echipamente**: model, producător, prefix de simbol (ex. PIRW, CMW, CVIE), tensiune, consum în veghe și în alarmă, putere, PoE, bitrate,
  capacitate acumulator, HDD sau UPS. Pornește cu echipamentele unui proiect de referință (Ajax + Hikvision), se poate importa sau exporta
  și salva ca implicit pentru proiectele noi. Echipamentele din catalog apar în paletă, gata de plasat.
- **Calcule automate** (tab-ul *Calcule*) și **breviar de calcul** în Excel:
  - acumulatori pentru efracție și incendiu: n = (Iv·tv + Ia·ta) / (0.86·C); echipamentele wireless cu baterie proprie sunt excluse
  - stocare video: C = BR·3600·24·Z·Ncam / (8·1024²), pentru înregistrare continuă și la detecție, cu verificare față de HDD-urile alese
  - bilanț energetic TVCI și UPS (PA = P / cosφ, autonomie estimată); camerele PoE sunt incluse în consumul switch-ului
  - buget PoE față de switch-uri, cu 20% rezervă
- **Memoriu tehnic `.docx`** (butonul *Memoriu*), în formatul documentațiilor avizate: preambul, date generale și normative,
  amplasament, zone funcționale, surse de alimentare, memorii pe fiecare subsistem, caiete de sarcini, breviarul de calcul complet,
  instrucțiuni de exploatare, SSM, liste de echipamente, zone protejate, fișe tehnice din catalog, piese desenate și semnături.
  Ce nu e completat apare ca **[DE COMPLETAT]**, marcat cu galben.
- **Accesorii fără simbol pe plan** (HDD, acumulatori, UPS, surse), incluse în liste și în calcule.
- **Salvare / deschidere proiect** ca fișier `.plansa.json`, plus salvare automată în browser.
- Undo / redo, duplicare și scurtături de tastatură.

## Scurtături

| Tastă | Acțiune |
|---|---|
| `V` / `C` / `F` | selectare / cablu / încadrare în ecran |
| `R`, `Shift+R` | rotire ±15° |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | copiere / tăiere / lipire echipament (păstrează modelul, zona, conul camerei) |
| `Ctrl+D` | duplicare echipament |
| Click dreapta | meniu: copiază, taie, lipește aici, duplică, rotește 90°, șterge |
| `Del` | ștergere |
| `Ctrl+Z` / `Ctrl+Y` | anulare / refacere |
| `Ctrl+S` | salvare proiect |
| `Esc` | ieșire din unealta curentă |
| Rotița mouse-ului | zoom; tragere pe fundal = deplasare |

La desenarea unui cablu: click pe echipamentul de start, apoi pe punctele de traseu, apoi click pe echipamentul final
(sau dublu-click / `Enter`). `Backspace` șterge ultimul punct. Dacă termini pe **alt cablu**, se creează o **ramificație**:
cablul merge pe același traseu până la switch / NVR / centrală, iar lungimea include porțiunea comună.
La un cablu selectat, capetele se pot trage pe alt echipament (sau cablu), dublu-click pe cablu adaugă un punct de traseu,
iar „De la” / „La” se pot alege și din listă.

## Dezvoltare

```bash
npm install
npm run dev      # server local de dezvoltare
npm run build    # build de producție în dist/
```

Tehnologii: React + TypeScript + Vite, Konva (desen), pdf.js (planuri PDF), jsPDF (export), SheetJS (Excel).

## Rulare pentru test

**Local, cu Node.js 20 sau mai nou** (Windows, WSL, Linux, macOS):

```bash
npm install
npm run dev
```

Se deschide la http://localhost:5173.

**Cu Docker** (WSL, sau pe un server de test):

```bash
docker build -t flux1-design-tool .
docker run -d -p 8080:80 --name flux1 flux1-design-tool
```

Se deschide la http://localhost:8080 (sau http://IP-server:8080).

## Publicare

Workflow-ul `.github/workflows/deploy.yml` publică automat aplicația pe GitHub Pages la fiecare push pe `main`.
Trebuie activat o singură dată: **Settings → Pages → Source: GitHub Actions**.
