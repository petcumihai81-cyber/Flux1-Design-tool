import { useState } from 'react'

/**
 * Ghidul aplicației: secțiuni „cum fac…”, cu pași și capturi de ecran (public/help/*.webp).
 * Capturile se regenerează automat cu Playwright pe planul demonstrativ (vezi CLAUDE.md).
 */

interface Section {
  id: string
  title: string
  intro?: string
  img?: string
  steps?: React.ReactNode[]
  tips?: React.ReactNode[]
}

const K = ({ children }: { children: React.ReactNode }) => <kbd>{children}</kbd>
const B = ({ children }: { children: React.ReactNode }) => <b>{children}</b>

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Început rapid',
    intro: 'Un proiect nou în 4 pași: plan, scară, echipamente, export.',
    img: 'help/01-scara.webp',
    steps: [
      <>
        Apasă <B>Încarcă plan</B> și alege planul clădirii (PDF, imagine sau DXF). La un PDF cu mai multe pagini apar miniaturile paginilor (cu formatul fiecăreia): click pe planul dorit și se încarcă doar pagina aceea. Un plan DXF
        vine deja calibrat — sari peste pasul următor.
      </>,
      <>
        Apasă <B>Scară</B>, dă click pe cele două capete ale unei cote cunoscute (ex. o cotă de 10 m) și scrie lungimea reală în metri. Din acest
        moment, conurile camerelor și lungimile cablurilor sunt la scară reală.
      </>,
      <>Plasează echipamentele din paleta din stânga și trage cablurile (vezi secțiunile următoare).</>,
      <>
        Exportă: <B>PDF planșă</B> / <B>PDF toate</B>, <B>Excel</B> (liste, zone, jurnal cablu, breviar), <B>DXF</B> (AutoCAD), <B>Memoriu</B> (.docx).
      </>,
    ],
    tips: [
      <>
        Salvează des cu <B>Salvează</B> sau <K>Ctrl+S</K>: proiectul se descarcă ca fișier <code>.plansa.json</code>, pe care îl redeschizi cu{' '}
        <B>Deschide</B>, inclusiv pe alt calculator.
      </>,
      <>Navigare: rotița mouse-ului = zoom, tragi de fundal = deplasare, <K>F</K> = încadrare în ecran.</>,
    ],
  },
  {
    id: 'echipamente',
    title: 'Plasarea echipamentelor',
    img: 'help/02-echipamente.webp',
    steps: [
      <>
        În paleta din stânga, secțiunea <B>Din catalog</B> are modelele tale (ex. Ajax HubBP, camere Hikvision), cu prefixul lor (PIRW, CMW,
        CVIE…). Celelalte secțiuni au simbolurile generice pe sisteme.
      </>,
      <>
        Dă click pe un simbol, apoi click pe plan, de câte ori ai nevoie. <K>Esc</K> sau click dreapta = gata. Poți și să tragi simbolul din paletă
        direct pe plan.
      </>,
      <>Numerotarea e automată (CVIE1, CVIE2…). Selectează echipamentul ca să-i completezi în dreapta zona protejată, partiția, tipul de detecție, modelul din catalog.</>,
      <>
        Rotire: mânerul albastru de lângă simbol, sau <K>R</K> / <K>Shift+R</K> (±15°). La simbolurile cu text (NVR, CAE…) textul rămâne drept.
      </>,
    ],
    tips: [<>Caută rapid un simbol sau un model scriind în câmpul de căutare de deasupra paletei.</>],
  },
  {
    id: 'camere',
    title: 'Camere: conul de vizualizare',
    img: 'help/03-con.webp',
    steps: [
      <>Selectează camera: pe con apar mânerele.</>,
      <>
        <B>Pătratul din vârf</B> reglează distanța (pas 0,5 m), <B>cercurile de pe margini</B> reglează unghiul (pas 5°). Ține <K>Shift</K> pentru
        reglaj fin.
      </>,
      <>Valorile se pot scrie și în panoul din dreapta (Unghi / Distanță vizualizare).</>,
      <>
        În catalog poți trece unghiul și distanța pe fiecare model de cameră: o cameră plasată din catalog pornește direct cu valorile modelului.
      </>,
    ],
    tips: [<>Conurile se pot ascunde pe o planșă: tab-ul Proiect → „Conuri de vizualizare camere”.</>],
  },
  {
    id: 'cabluri',
    title: 'Trasee de cablu',
    img: 'help/04-cabluri.webp',
    steps: [
      <>
        Apasă <B>Cablu</B> (sau <K>C</K>). Click pe echipamentul de start, apoi click pe punctele de traseu, apoi click pe echipamentul final.
      </>,
      <>
        <B>Traseu comun (ramificație):</B> dacă termini cablul <i>pe alt cablu</i>, aplicația înțelege că merge pe același traseu până la switch /
        NVR / centrală. Lungimea include porțiunea comună.
      </>,
      <>
        Editare: selectează cablul. Tragi de puncte ca să schimbi traseul; tragi un capăt pe alt echipament ca să-l legi. Dublu-click pe cablu adaugă
        un punct, dublu-click pe un punct îl șterge.
      </>,
      <>În dreapta: cod, „De la” / „La” (din listă), tip cablu (propus automat după echipament), lungime calculată cu rezervă, traseu / observații.</>,
    ],
    tips: [
      <>În timpul desenării: <K>Backspace</K> șterge ultimul punct, <K>Enter</K> sau dublu-click termină cablul liber, <K>Esc</K> anulează.</>,
      <>
        <B>Cabluri între etaje</B>: pune pe fiecare nivel o <B>Trecere între niveluri</B> (din Arhitectură) cu același nume, de ex. G1. La etaj
        tragi cablurile de la echipamente până la G1; la nivelul cu switch-ul / NVR-ul / centrala tragi o singură dată traseul de la G1 până la
        echipament. Aplicația le leagă: schema bloc arată legătura, iar lungimea din jurnal include bucata de la etaj, înălțimea nivelului
        (tab-ul Proiect → Nivel, implicit 3 m) și traseul comun.
      </>,
    ],
  },
  {
    id: 'arhitectura',
    title: 'Schiță de arhitectură',
    intro: 'Pentru obiective fără plan sau pentru completarea unui plan existent.',
    img: 'help/11-arhitectura.webp',
    steps: [
      <>
        Deschide secțiunea <B>Arhitectură (schiță)</B> din paletă. Fără plan încărcat, schița pornește la scară (1 m = 50 px), deci conurile și
        cablurile sunt reale din prima.
      </>,
      <>
        Pe pagina albă, <B>chenarul albastru punctat</B> arată zona de desen a planșei (format și orientare din tab-ul <B>Proiect</B>) la scara din
        cartuș, ex. A4 peisaj la 1:100 ≈ 16,5 × 18,6 m. Ce desenezi în chenar iese în PDF exact la acea scară; dacă desenul iese din chenar,
        acesta devine portocaliu — alege un format mai mare sau o scară mai mică. <B>Centrează zona planșei pe desen</B> mută chenarul peste
        desen.
      </>,
      <>
        <B>Perete exterior / interior</B>: click din punct în punct. Peretele se aliniază singur pe orizontală / verticală și se lipește de pereții
        existenți (<K>Shift</K> = liber). Click pe primul punct închide conturul; dublu-click sau <K>Enter</K> termină.
      </>,
      <>
        <B>Ușă</B> și <B>Fereastră</B>: click pe un perete — se așază pe el, aliniate. Lățimea se schimbă trăgând de pătratele albastre de la
        capete (alunecă pe direcția peretelui, rotunjit la 5 cm) sau din panoul din dreapta; tot acolo „Întoarce sensul” și „Schimbă balamaua”.
      </>,
      <>
        <B>Text încăpere</B> pentru numele spațiilor și <B>Cotă</B> (două click-uri; lungimea se calculează singură). Textul se editează cu
        dublu-click (sau <K>F2</K>), se mărește trăgând de pătratul albastru din colț, iar din click dreapta ai A+ / A−.
      </>,
      <>Elementele se selectează, se mută, se duplică și se șterg ca echipamentele (inclusiv din click dreapta). Vârfurile pereților se trag cu mânerele albastre.</>,
    ],
    tips: [
      <>Schița apare pe planșele nivelului ei și în PDF, sub echipamente și cabluri.</>,
      <>
        Pereții, ușile și ferestrele au mărime reală (în metri); simbolurile au mărimea „de planșă”. Dacă simbolurile par uriașe lângă ferestre și
        texte, apasă în tab-ul Proiect → Nivel <B>Potrivește simbolurile la planșă (~6 mm)</B>. Textul unui nume de încăpere se mărește din „Înălțime
        litere”.
      </>,
    ],
  },
  {
    id: 'meniu',
    title: 'Click dreapta: copiere, duplicare, ștergere',
    img: 'help/05-meniu.webp',
    steps: [
      <>
        Click dreapta pe un echipament: <B>Copiază</B>, <B>Taie</B>, <B>Lipește aici</B>, <B>Duplică</B>, <B>Rotește 90°</B>, <B>Șterge</B>. La
        simbolurile cu orientare (detectoare, contacte, sirene, cititoare) ai și <B>Oglindește orizontal / vertical</B>.
      </>,
      <>Click dreapta pe o zonă goală: <B>Lipește aici</B>, exact unde ai dat click.</>,
      <>Copia păstrează modelul din catalog, zona, partiția și conul camerei și primește următorul număr liber.</>,
      <>
        <B>Selecție multiplă</B>: <K>Shift</K> + tragere pe o zonă goală = dreptunghi de selecție; <K>Shift</K> + click adaugă / scoate un element;{' '}
        <K>Ctrl+A</K> = tot de pe planșă. Grupul se mută trăgând de chenarul albastru (cablurile legate se ajustează), iar din click dreapta sau din
        panoul din dreapta îl aliniezi, îl distribui uniform, îl copiezi, îl duplici, îl rotești sau îl ștergi. Tot acolo setezi odată zona,
        modulul, partiția și tipul de detecție pentru toate echipamentele selectate.
      </>,
    ],
    tips: [
      <>
        Scurtături: <K>Ctrl+C</K> <K>Ctrl+X</K> <K>Ctrl+V</K> <K>Ctrl+D</K> <K>Del</K>.
      </>,
    ],
  },
  {
    id: 'planse',
    title: 'Planșe și formate',
    img: 'help/06-planse.webp',
    steps: [
      <>
        <B>Niveluri (etaje)</B>: fiecare nivel are planul lui (poză, PDF sau pagină albă), scara lui și echipamentele lui. <B>+ Planșă</B> →{' '}
        <B>Nivel nou – încarcă planul</B> sau <B>Nivel nou – pagină albă</B>. Numele nivelului (Parter, Etaj 1…) se schimbă din tab-ul{' '}
        <B>Proiect</B>, secțiunea „Nivel”.
      </>,
      <>
        Pe același nivel poți avea mai multe planșe (ex. Parter – efracție, Parter – CCTV): diferă sistemele afișate și formatul paginii.
        Numerotarea, listele, calculele, memoriul și schemele bloc cuprind toate nivelurile.
      </>,
      <>
        <B>+ Planșă</B> → <B>Câte un plan pentru fiecare sistem folosit</B> creează automat planurile separate (efracție, CCTV…), sau alegi o schemă
        bloc.
      </>,
      <>
        În tab-ul <B>Proiect</B>: titlul și numărul planșei, scara din cartuș, formatul (A0–A4 sau personalizat), orientarea (peisaj / portret) și
        sistemele afișate.
      </>,
      <>
        <B>PDF planșă</B> exportă planșa curentă; <B>PDF toate</B> pune toate planșele într-un singur PDF, cu legendă și cartuș pe fiecare pagină.
      </>,
    ],
  },
  {
    id: 'previzualizare',
    title: 'Previzualizare și export PDF',
    img: 'help/12-previzualizare.webp',
    steps: [
      <>
        <B>PDF planșă</B> sau <B>PDF toate</B> deschid întâi previzualizarea: paginile exact cum vor ieși, cu chenar, legendă și cartuș.
      </>,
      <>La mai multe planșe, miniaturile din stânga (sau săgețile ← →) trec de la o pagină la alta. Click pe pagină = mărire 100%.</>,
      <>
        Dacă totul e în regulă, apeși <B>Descarcă PDF</B>; altfel <B>Închide</B>, corectezi și generezi din nou.
      </>,
    ],
  },
  {
    id: 'fundal',
    title: 'Planul de fundal: estompare, aliniere, blocare',
    steps: [
      <>
        În tab-ul <B>Proiect</B>, la <B>Nivel</B>: <B>Estompare plan</B> (0–90%) face planul mai șters, ca o copie decolorată, iar simbolurile ies
        în evidență. Se vede la fel și în PDF.
      </>,
      <>
        Planul e <B>blocat</B> implicit, ca să nu-l miști din greșeală. Debifează <B>Plan blocat</B> și trage-l cu mouse-ul (unealta{' '}
        <B>Selectare</B>) ca să-l aliniezi; <B>Rotire plan</B> îndreaptă un plan scanat strâmb. Echipamentele, cablurile și schița rămân pe loc.
      </>,
      <>
        Bifează din nou <B>Plan blocat</B> când ai terminat. <B>Readu planul în poziția inițială</B> anulează mutarea și rotirea; scara
        calibrată rămâne aceeași.
      </>,
    ],
  },
  {
    id: 'import-dxf',
    title: 'Plan DXF de la arhitect',
    intro: 'Planul primit în format CAD se încarcă direct, la scara reală.',
    steps: [
      <>
        <B>Încarcă plan</B> → alege fișierul <B>.dxf</B>. Un <B>.dwg</B> nu se poate citi în browser: în AutoCAD (sau alt program CAD) folosește{' '}
        <B>Save As → DXF</B>, orice versiune.
      </>,
      <>
        În fereastra de import verifică <B>unitatea desenului</B> (milimetri, centimetri, metri). Dacă fișierul nu o spune, o ghicesc după
        mărime; dimensiunea afișată (ex. „24,0 × 14,0 m”) trebuie să fie cea reală a clădirii.
      </>,
      <>
        <B>Debifează straturile</B> de care nu ai nevoie (mobilier, cote, cartușul arhitectului, axe); previzualizarea se actualizează imediat.
        Planul se desenează gri, ca simbolurile de securitate să iasă în evidență; bifează <B>Culorile din DXF</B> dacă vrei culorile originale.
      </>,
      <>
        <B>Încarcă planul</B>: nivelul primește planul și scara calibrată automat (fără unealta <B>Scară</B>), iar simbolurile se potrivesc la
        ~6 mm pe planșă.
      </>,
    ],
  },
  {
    id: 'dxf',
    title: 'Export DXF pentru AutoCAD',
    steps: [
      <>
        Pe o planșă de plan apeși <B>DXF</B>: se descarcă desenul nivelului ca fișier <B>.dxf</B> (format R12), care se deschide în AutoCAD,
        BricsCAD, DraftSight sau LibreCAD.
      </>,
      <>
        Unitatea de desen este <B>metrul</B>, la scara calibrată a nivelului (1 unitate = 1 m). Fără calibrare, dimensiunile nu sunt reale —
        calibrează scara înainte de export.
      </>,
      <>
        Fiecare lucru stă pe stratul lui: <B>ARH_PERETI</B>, <B>ARH_USI</B>, <B>ARH_FERESTRE</B>, <B>ARH_TEXT</B>, <B>ARH_COTE</B>,{' '}
        <B>GHENE</B>, iar pe fiecare sistem <B>EFR_ECHIPAMENTE</B> / <B>EFR_CABLURI</B> / <B>EFR_ETICHETE</B> (la fel CA, CCTV, INC, NET) și{' '}
        <B>CCTV_CONURI</B>. Se exportă doar sistemele bifate pe planșă.
      </>,
      <>
        Simbolurile sunt blocuri (un bloc pe tip de echipament), deci în CAD le poți număra sau înlocui ușor. Planul de fundal (poză / PDF) nu
        intră în DXF: în CAD îl ai deja ca desen original.
      </>,
    ],
  },
  {
    id: 'schema',
    title: 'Schema bloc',
    img: 'help/07-schema.webp',
    steps: [
      <>Schema se generează automat din plan: centrala / NVR / switch sus, echipamentele legate prin cablu dedesubt. Liniile punctate = echipamente fără cablu desenat pe plan.</>,
      <>
        <B>Editează schema</B> o face editabilă: <B>Selectare</B> (muți blocurile), <B>Legătură</B> (tragi de la un bloc la altul), <B>Text</B>,{' '}
        <B>Chenar</B> (grupare, ex. „Camera tehnică”).
      </>,
      <>Selectezi o legătură sau un text și îi schimbi eticheta, culoarea, linia punctată; <K>Del</K> șterge.</>,
      <>
        <B>+ Neplasate</B> adaugă echipamentele puse pe plan după editare; <B>Regenerează</B> refă schema din plan.
      </>,
    ],
    tips: [<>Cel mai simplu: desenează cablurile pe plan, apoi „Regenerează” — schema și jurnalul de cablu ies din aceleași date.</>],
  },
  {
    id: 'catalog',
    title: 'Catalogul de echipamente',
    img: 'help/08-catalog.webp',
    steps: [
      <>
        <B>Catalog</B> din bara de sus: modelele tale, cu producător, prefix de simbol, consumuri (veghe / alarmă), putere, PoE, bitrate, unghi
        cameră, capacități (acumulator, HDD, UPS).
      </>,
      <>Bifează „Baterie proprie” la echipamentele wireless: nu intră în calculul acumulatorilor.</>,
      <>
        <B>Fișa tehnică</B> (jos în formular) apare în capitolul „Fișele tehnice ale echipamentelor” din memoriu, pe secțiuni. Cel mai repede:{' '}
        <B>Lipește din fișa producătorului</B> — copiezi tabelul de pe site sau din PDF și îl lipești; rândurile „parametru – valoare” și titlurile
        de secțiune se recunosc singure. Echipamentele din catalogul inițial au deja fișele completate.
      </>,
      <>
        <B>Salvează ca implicit</B> = proiectele noi pornesc cu acest catalog. <B>Export</B> / <B>Import</B> = îl muți pe alt calculator.
      </>,
    ],
    tips: [<>Câmpurile goale rămân „de completat” în breviar și în memoriu — nu se inventează valori.</>],
  },
  {
    id: 'calcule',
    title: 'Calcule și breviar',
    img: 'help/09-calcule.webp',
    steps: [
      <>
        Tab-ul <B>Calcule</B>: adaugă întâi <B>accesoriile</B> fără simbol pe plan (HDD, UPS, acumulator, surse).
      </>,
      <>Calculele se fac singure: acumulatori efracție / incendiu, stocare video, bilanț TVCI și UPS, buget PoE — fiecare cu formula și o verificare verde / roșie.</>,
      <>Parametrii (23,5 h / 0,5 h, zile stocare, bitrate, cos φ…) se modifică în josul panoului.</>,
      <>
        <B>Excel</B> conține foaia „Breviar calcul”, iar memoriul include breviarul complet.
      </>,
    ],
  },
  {
    id: 'memoriu',
    title: 'Memoriul tehnic (.docx)',
    img: 'help/10-memoriu.webp',
    steps: [
      <>
        <B>Memoriu</B> din bara de sus: completezi datele obiectivului (beneficiar, CUI, CAEN, vecinătăți, zone funcționale, alimentare, semnături).
      </>,
      <>
        <B>Generează memoriul</B>: documentul are toate capitolele avizate, cu listele, zonele, calculele, fișele tehnice din catalog și lista
        planșelor.
      </>,
      <>Ce nu ai completat apare ca [DE COMPLETAT], evidențiat cu galben în Word.</>,
    ],
  },
  {
    id: 'scurtaturi',
    title: 'Scurtături și salvare',
    steps: [
      <>
        <K>V</K> selectare · <K>C</K> cablu · <K>F</K> încadrare · <K>R</K> / <K>Shift+R</K> rotire · <K>Esc</K> ieșire din unealtă
      </>,
      <>
        <K>Ctrl+Z</K> / <K>Ctrl+Y</K> anulare / refacere · <K>Ctrl+S</K> salvare · <K>Del</K> ștergere
      </>,
      <>
        <K>Ctrl+C</K> / <K>Ctrl+X</K> / <K>Ctrl+V</K> copiere / tăiere / lipire · <K>Ctrl+D</K> duplicare · click dreapta = meniu
      </>,
      <>
        Proiectul curent se păstrează automat în browser (inclusiv planurile de fundal mari), dar doar pe acest calculator. Punctul galben de pe{' '}
        <B>Salvează</B> arată că ai modificări care nu sunt încă în fișierul <code>.plansa.json</code> — pentru siguranță și arhivă, salvează cu{' '}
        <K>Ctrl+S</K>.
      </>,
    ],
  },
]

export function HelpDialog({ onClose, start }: { onClose: () => void; start?: string }) {
  const [id, setId] = useState(start ?? SECTIONS[0].id)
  const idx = SECTIONS.findIndex((s) => s.id === id)
  const s = SECTIONS[Math.max(0, idx)]
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help">
        <header className="modal-head">
          <b>Ghid de utilizare</b>
          <span className="hint">Cum fac… pas cu pas</span>
          <button className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <nav className="help-nav">
            {SECTIONS.map((x, i) => (
              <button key={x.id} className={x.id === s.id ? 'on' : ''} onClick={() => setId(x.id)}>
                <span className="n">{i + 1}</span>
                {x.title}
              </button>
            ))}
          </nav>
          <article className="help-body">
            <h2>{s.title}</h2>
            {s.intro && <p className="lead">{s.intro}</p>}
            {s.img && <img src={s.img} alt={s.title} loading="lazy" />}
            {s.steps && (
              <ol>
                {s.steps.map((st, i) => (
                  <li key={i}>{st}</li>
                ))}
              </ol>
            )}
            {s.tips && (
              <div className="tips">
                {s.tips.map((t, i) => (
                  <p key={i}>💡 {t}</p>
                ))}
              </div>
            )}
            <div className="help-pager">
              <button disabled={idx <= 0} onClick={() => setId(SECTIONS[idx - 1].id)}>
                ← Înapoi
              </button>
              {idx < SECTIONS.length - 1 ? (
                <button className="primary" onClick={() => setId(SECTIONS[idx + 1].id)}>
                  Următorul: {SECTIONS[idx + 1].title} →
                </button>
              ) : (
                <button className="primary" onClick={onClose}>
                  Gata
                </button>
              )}
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
