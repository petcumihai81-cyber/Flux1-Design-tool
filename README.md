# Planșe Securitate (Flux1 Design Tool)

Aplicație web pentru desenarea planșelor de amplasare la sistemele de securitate:
**alarmare la efracție**, **control acces**, **supraveghere video (CCTV)** și
**detecție și semnalizare incendiu**.

Rulează integral în browser. Nu are server și nu trimite date nicăieri.

## Ce face

- **Plan de fundal**: încarci planul clădirii ca PDF (orice pagină) sau imagine.
- **Calibrare scară**: unealta *Scară* → click pe capetele unei cote cunoscute → introduci lungimea în metri.
- **Bibliotecă de simboluri** pe cele 4 subsisteme: plasare prin click sau drag & drop, cu numerotare automată (PIR01, CVe02, DF03…).
- **Camere video** cu con de vizualizare reglabil (unghi + distanță în metri, la scară reală) și rotire din mâner sau tasta `R`.
- **Trasee de cablu** între echipamente, cu lungime calculată din scară, rezervă configurabilă și tip de cablu propus automat după echipament.
- **Proprietăți per echipament**: cod, model, zonă protejată, partiție sau buclă, observații.
- **Afișare pe subsisteme**: poți ascunde subsisteme ca să scoți câte o planșă separată pentru fiecare.
- **Export PDF** (A4, A3 sau A2 orizontal), cu chenar, legendă generată automat (simboluri folosite + cantități) și cartuș.
- **Export Excel** cu trei foi:
  - *Echipamente*: listă de cantități pe tip și model
  - *Zone protejate*: simbol, denumire, zonă, partiție, tip detecție
  - *Jurnal cablu*: cod, de la, la, tip cablu, lungime, traseu, plus totaluri pe tip de cablu
- **Salvare / deschidere proiect** ca fișier `.plansa.json`, plus salvare automată în browser.
- Undo / redo, duplicare și scurtături de tastatură.

## Scurtături

| Tastă | Acțiune |
|---|---|
| `V` / `C` / `F` | selectare / cablu / încadrare în ecran |
| `R`, `Shift+R` | rotire ±15° |
| `Ctrl+D` | duplicare echipament |
| `Del` | ștergere |
| `Ctrl+Z` / `Ctrl+Y` | anulare / refacere |
| `Ctrl+S` | salvare proiect |
| `Esc` | ieșire din unealta curentă |
| Rotița mouse-ului | zoom; tragere pe fundal = deplasare |

La desenarea unui cablu: click pe echipamentul de start, apoi pe punctele de traseu, apoi click pe echipamentul final
(sau dublu-click / `Enter`). `Backspace` șterge ultimul punct.

## Dezvoltare

```bash
npm install
npm run dev      # server local de dezvoltare
npm run build    # build de producție în dist/
```

Tehnologii: React + TypeScript + Vite, Konva (desen), pdf.js (planuri PDF), jsPDF (export), SheetJS (Excel).

## Publicare

Workflow-ul `.github/workflows/deploy.yml` publică automat aplicația pe GitHub Pages la fiecare push pe `main`.
Trebuie activat o singură dată: **Settings → Pages → Source: GitHub Actions**.
