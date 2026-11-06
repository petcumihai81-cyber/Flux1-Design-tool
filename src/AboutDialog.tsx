import { useState } from 'react'
import { APP_VERSION, BUILD_COMMIT, BUILD_DATE, CHANGELOG, FEATURES, REPO_URL } from './changelog'

const fmtDate = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

type Tab = 'despre' | 'noutati' | 'functii'

/** Fereastra „Despre”: versiunea, jurnalul de actualizări și funcțiile aplicației */
export function AboutDialog({ start = 'despre', onClose }: { start?: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(start)
  // jurnalul, grupat pe zile
  const days: { date: string; list: typeof CHANGELOG }[] = []
  for (const r of CHANGELOG) {
    const last = days[days.length - 1]
    if (last && last.date === r.date) last.list.push(r)
    else days.push({ date: r.date, list: [r] })
  }
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal about">
        <header className="modal-head">
          <b>Planșe Securitate</b>
          <span className="hint">versiunea {APP_VERSION}</span>
          <button className="close" onClick={onClose} aria-label="Închide">
            ×
          </button>
        </header>
        <nav className="about-tabs">
          {(
            [
              ['despre', 'Despre'],
              ['noutati', 'Noutăți'],
              ['functii', 'Funcții'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="about-body">
          {tab === 'despre' && (
            <>
              <div className="about-hero">
                <div className="about-logo">PS</div>
                <div>
                  <h2>Planșe Securitate</h2>
                  <p className="hint">Flux1 Design Tool</p>
                </div>
              </div>
              <p>
                Proiectarea sistemelor de securitate: planșe de amplasare, scheme bloc, catalog de echipamente, calcule, liste și memoriul
                tehnic pentru documentația de avizare (Legea 333/2003, HG 301/2012).
              </p>
              <dl className="about-info">
                <dt>Versiune</dt>
                <dd>{APP_VERSION}</dd>
                <dt>Build</dt>
                <dd>
                  {fmtDate(BUILD_DATE)}
                  {BUILD_COMMIT && <span className="hint"> · commit {BUILD_COMMIT}</span>}
                </dd>
                <dt>Ultima noutate</dt>
                <dd>
                  <button className="link" onClick={() => setTab('noutati')}>
                    {CHANGELOG[0].title}
                  </button>
                </dd>
                <dt>Funcționare</dt>
                <dd>integral în browser; proiectele rămân pe calculatorul tău (fișier sau memoria browserului)</dd>
                <dt>Cod sursă</dt>
                <dd>
                  <a href={REPO_URL} target="_blank" rel="noreferrer">
                    {REPO_URL.replace('https://', '')}
                  </a>
                </dd>
              </dl>
            </>
          )}

          {tab === 'noutati' &&
            days.map((d) => (
              <section key={d.date} className="about-day">
                <h4>{fmtDate(d.date)}</h4>
                {d.list.map((r) => (
                  <div key={r.version} className="about-rel">
                    <span className="about-ver">{r.version}</span>
                    <div>
                      <b>{r.title}</b>{' '}
                      <a className="hint" href={`${REPO_URL}/pull/${r.pr}`} target="_blank" rel="noreferrer">
                        #{r.pr}
                      </a>
                      {r.items && (
                        <ul>
                          {r.items.map((it) => (
                            <li key={it}>{it}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            ))}

          {tab === 'functii' && (
            <div className="about-features">
              {FEATURES.map((g) => (
                <section key={g.group}>
                  <h4>{g.group}</h4>
                  <ul>
                    {g.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="hint">Pașii pentru fiecare funcție sunt în ghid (butonul „?”).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
