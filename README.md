# Planșe Securitate (Flux1 Design Tool)

Aplicație web pentru desenarea planșelor de amplasare și a schemelor bloc la sistemele de securitate:
**alarmare la efracție**, **control acces**, **supraveghere video (CCTV)**,
**detecție și semnalizare incendiu** și **rețea de date (cablare structurată)**.

Rulează integral în browser. Nu are server și nu trimite date nicăieri.

## Ce face

- **Plan de fundal**: încarci planul clădirii ca PDF (orice pagină) sau imagine.
- **Schiță de arhitectură** (fără plan sau peste plan): pereți exteriori / interiori cu grosime reală, uși cu sensul de deschidere, ferestre, texte de încăpere și cote; aliniere automată și lipire de pereții existenți. Pe pagina albă se vede zona de desen a planșei (format, orientare, scara din cartuș), iar PDF-ul iese la scara reală.
- **Calibrare scară**: unealta *Scară* → click pe capetele unei cote cunoscute → introduci lungimea în metri.
- **Bibliotecă de simboluri** pe cele 4 subsisteme: plasare prin click sau drag & drop, cu numerotare automată (PIR01, CVe02, DF03…).
- **Camere video** cu con de vizualizare la scară reală: se reglează direct pe plan (vârful conului = distanța, marginile = unghiul, mânerul albastru = rotirea; `Shift` = fără pas) sau din panoul de proprietăți. Unghiul și distanța pot fi trecute în catalog pe fiecare model de cameră.
- **Trasee de cablu** între echipamente, cu lungime calculată din scară, rezervă configurabilă și tip de cablu propus automat după echipament.
- **Proprietăți per echipament**: cod, model, zonă protejată, partiție sau buclă, observații.
- **Cabluri între etaje prin ghene** („Trecere între niveluri”, același nume pe fiecare nivel): cablul de la etaj continuă pe traseul comun de la ghenă până la switch / NVR / centrală, cu înălțimea nivelului adăugată la lungime; schema bloc și jurnalul de cablu le leagă automat.
- **Niveluri (Parter, Etaj 1, Etaj 2…)**: fiecare nivel are planul lui (PDF, imagine sau pagină albă pentru schiță), scara și echipamentele lui; listele, calculele, memoriul și schemele bloc cuprind toate nivelurile.
- **Mai multe planșe în același proiect** (bara de jos): o planșă cu toate sistemele sau, automat, câte o planșă pentru fiecare sistem.
  Fiecare planșă are titlul, numărul, scara, formatul (A0–A4 sau dimensiune personalizată în mm), orientarea (peisaj sau portret) și sistemele afișate proprii.
- **Scheme bloc generate automat** din echipamentele și cablurile de pe plan (centrală → module → detectoare, NVR → switch → camere, rack → switch → prize).
  Echipamentele fără cablu desenat apar legate punctat de centrală.
- **Editor de schemă** în stilul draw.io: „Editează schema” transformă schema generată într-una editabilă. Blocurile se mută liber (cu aliniere pe grilă),
  legăturile le urmăresc, se pot trage legături noi (eticheta se completează din cablul de pe plan), se adaugă texte și chenare de grupare,
  cu culori și linii punctate. Echipamentele rămân legate de plan; cele adăugate ulterior apar ca „neplasate”. „Regenerează” refă schema automat.
  Traseele legăturilor se ajustează manual (segmente trase cu mouse-ul, capete care alunecă pe laturile blocurilor); selecție multiplă
  (Shift+click / Shift+dreptunghi), mutare în grup, aliniere și distribuire.
- **Planul de fundal**: estompare reglabilă (0–90%), blocat implicit; deblocat se mută cu mouse-ul și se poate roti fin pentru aliniere.
- **Șabloane de proiect**: „Nou” = proiect gol, șabloane de bază (casă, birou, magazin) sau șabloanele tale (salvate din proiectul curent, cu sau fără desen, fără datele beneficiarului), cu export / import ca fișier. **Asistentul** („Continuă cu asistentul →”) te poartă pas cu pas prin datele proiectului: beneficiar și obiectiv, niveluri cu planurile lor (PDF, imagine, DXF sau pagină albă), sisteme și planșe (un plan pe sistem sau toate pe unul, schemele bloc, format, scară), cartuș și datele pentru memoriu.
- **Logo-ul firmei în cartuș** (lângă „Proiectant”, pe toate planșele), cu logo implicit pentru proiectele noi.
- **Zone, note, linii, imagini și tabele pe planșă**: note cu săgeată (text pe mai multe rânduri, spre un punct de pe plan); linii și săgeți libere (culoare, grosime, punctat, săgeți la capete); zone dreptunghi / elipsă / poligon cu nume și arie (m²) care pot atribui zona echipamentelor din interior; imagini (logo, fotografii); tabele generate din proiect (echipamente, zone, CCTV, jurnal cablu) care se actualizează singure.
- **Zoom** ca în draw.io: bară cu − / procent / +, presetări, procent scris, încadrare și mărire pe selecție; 100% = mărimea reală a planșei tipărite; Ctrl + / Ctrl − / Ctrl 0 / Ctrl 1.
- **File de planșe ca în Excel**: click dreapta (deschide, redenumește, duplică, mută, renumerotează, șterge), dublu-click pentru redenumire, reordonare prin tragere.
- **Straturi** (ca în AutoCAD / Photoshop), pe fiecare planșă: fundal, arhitectură (pereți, goluri, texte, cote, ghene) și, pe fiecare sistem, echipamente, etichete, trasee, conuri — cu arată / ascunde (inclusiv în PDF, DXF și legendă) și blocare la selecție.
- **Culoarea simbolurilor și simboluri personalizate**: culoare proprie pe echipament (proprietăți, click dreapta, selecție multiplă); simboluri încărcate (SVG, PNG, ICO, JPG, WebP), aduse la mărimea celorlalte, cu fundal transparent și recolorare, care se comportă ca un simbol standard ales (con, cabluri, liste, calcule); bibliotecă proprie pentru proiectele noi.
- **Verificare înainte de predare**: erori (scară necalibrată, cabluri nelegate, zone lipsă, consumuri lipsă, UPS / HDD / PoE insuficiente, numerotare dublă) și atenționări (modele, fișe tehnice, cartuș, memoriu), fiecare cu buton care duce la locul problemei.
- **Import DXF** ca plan de fundal: alegi straturile și unitatea (mm / cm / m, ghicită dacă lipsește din fișier), iar planul vine deja calibrat la scara reală. DWG-ul se salvează întâi ca DXF.
- **Export DXF** (AutoCAD, format R12): planșa de plan curentă în metri, cu straturi pe arhitectură și pe fiecare sistem (echipamente, cabluri, etichete, conuri camere), simbolurile ca blocuri; pereții se întrerup la uși și ferestre.
- **Export draw.io**: schemele bloc ca fișier `.drawio` editabil, cu câte o pagină pe sistem.
- **Previzualizare PDF** înainte de descărcare: paginile exact cum vor ieși, cu miniaturi la mai multe planșe.
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
- **Pachet proiect .zip** („Pachet”): proiectul cu planurile de fundal, imaginile, simbolurile personalizate și logo-ul ca fișiere separate, plus, opțional, documentele de predare (PDF, DXF, Excel, draw.io, memoriu). Se redeschide cu „Deschide”.
- Undo / redo, duplicare și scurtături de tastatură.

## Ghid

Butonul **?** din bara de sus deschide ghidul de utilizare, cu pași și capturi de ecran pentru fiecare funcție. La prima vizită se deschide singur.

## Scurtături

| Tastă | Acțiune |
|---|---|
| `V` / `C` / `F` | selectare / cablu / încadrare în ecran |
| `R`, `Shift+R` | rotire ±15° |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | copiere / tăiere / lipire echipament (păstrează modelul, zona, conul camerei) |
| `Ctrl+D` | duplicare echipament |
| Click dreapta | meniu: copiază, taie, lipește aici, duplică, rotește 90°, oglindește, șterge; la texte: editare, A+ / A− |
| `F2` / dublu-click pe text | editarea textului direct pe plan |
| `Shift` + tragere / `Shift` + click | selecție multiplă (dreptunghi / adaugă-scoate element) |
| `Ctrl+A` | selectează tot de pe planșa curentă |
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

## Planuri

Ideile și lucrurile de făcut, pe priorități, sunt în [BACKLOG.md](BACKLOG.md), împreună cu lista funcțiilor realizate.

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
