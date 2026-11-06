# BACKLOG — Planșe Securitate

Lista ideilor și a lucrurilor de făcut, discutate cu utilizatorul. Se actualizează la fiecare sesiune:
ce se începe trece la „În lucru”, ce se unește în `main` se mută la „Realizat”, cu numărul PR-ului.

Legendă priorități: **P1** = urmează, **P2** = util, **P3** = poate, mai târziu.

## În lucru

- [ ] **P2** Asistent pentru proiect nou (pas cu pas: beneficiar, niveluri și planuri, sisteme și planșe, cartuș, memoriu, rezumat) — PR #37.

## De făcut

### Planșe și desen
- [ ] **P3** Hașură configurabilă pe zone (model, nu doar umplere transparentă).

### Proiecte și șabloane
- [ ] **P2** Pachet proiect .zip: „Salvează ca pachet” / „Deschide pachet” — proiectul (.json), planurile de fundal și imaginile ca fișiere (PNG / JPG, mai mici decât în JSON), simbolurile personalizate (SVG / PNG), logo-ul; opțional și exporturile pentru predare (PDF, Excel, DXF, memoriu .docx).
- [ ] **P2** Export / import al bibliotecii de simboluri personalizate (fișier), ca să se poată muta pe alt calculator / browser fără să deschizi un proiect care le conține.

### Export / import
- [ ] **P2** DXF: conurile camerelor hașurate (umplute), ca în aplicație.
- [ ] **P3** DXF: tabelele de pe planșă (text pe grilă) și imaginile (sau doar conturul lor, cu numele fișierului).
- [ ] **P3** Import DXF: notele de tip MULTILEADER (acum sunt sărite, cu număr afișat în dialog).

### Telefon / tabletă
- [ ] **P2** Suport pentru ecran tactil: zoom cu două degete, apăsare lungă în loc de click dreapta, tragere cu un deget.
- [ ] **P3** Panouri care se strâng pe ecran mic (paleta și panoul din dreapta ca sertare).

### Calitate
- [ ] **P3** Commit-uri semnate pe viitor (configurarea semnării, fără rescrierea istoricului existent).

## Realizat

- [x] Planșe multiple, scheme bloc, rețea date, catalog și calcule ([#1](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/1))
- [x] Generare memoriu tehnic .docx pentru avizare ([#2](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/2))
- [x] Editor de schemă bloc în stilul draw.io ([#3](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/3))
- [x] Reglarea conurilor camerelor direct pe plan și din catalog ([#4](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/4))
- [x] Meniu la click dreapta și copiere / tăiere / lipire pe plan ([#5](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/5))
- [x] Rotirea funcționează la toate simbolurile, cu textul păstrat drept ([#6](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/6))
- [x] Ramificații de cablu și capete de cablu editabile ([#7](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/7))
- [x] Ghid de utilizare în aplicație, cu capturi de ecran ([#8](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/8))
- [x] Schiță de arhitectură și previzualizare PDF ([#9](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/9))
- [x] Niveluri (Parter, Etaj 1, Etaj 2...) cu plan propriu ([#10](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/10))
- [x] Simboluri potrivite pentru planșă, editarea textelor și oglindirea simbolurilor ([#11](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/11))
- [x] Redimensionarea ușilor și ferestrelor direct pe plan ([#12](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/12))
- [x] Salvare automată sigură pentru planurile mari și indicator de modificări nesalvate ([#13](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/13))
- [x] Selecție multiplă pe plan ([#14](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/14))
- [x] Cabluri între etaje prin ghene și nivelul în liste ([#15](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/15))
- [x] Fișe tehnice complete în catalog și în memoriu ([#16](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/16))
- [x] Export DXF pentru AutoCAD ([#17](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/17))
- [x] Zona de desen a planșei pe pagina albă ([#18](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/18))
- [x] Import DXF ca plan de fundal ([#19](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/19))
- [x] Planul de fundal: estompare, blocare, mutare și rotire ([#20](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/20))
- [x] Alegerea paginii din PDF-urile cu mai multe pagini ([#21](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/21))
- [x] Verificare înainte de predare ([#22](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/22))
- [x] Editor de schemă: trasee manuale, selecție multiplă, aliniere și distribuire ([#23](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/23))
- [x] Ghid: capturi noi și actualizate ([#24](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/24))
- [x] Culoarea simbolurilor și simboluri personalizate ([#25](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/25))
- [x] Straturi pe planșe: arată / ascunde și blocare ([#26](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/26))
- [x] File de planșe ca în Excel: meniu, duplicare, redenumire, reordonare ([#27](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/27))
- [x] Bară de zoom pe planșe: procent, presetări, încadrare, mărire pe selecție ([#28](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/28))
- [x] Zone, imagini și tabele pe planșă ([#29](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/29))
- [x] BACKLOG.md: ideile de făcut pe priorități și funcțiile realizate ([#30](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/30))
- [x] Note cu săgeată pe plan ([#31](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/31))
- [x] Linii și săgeți libere pe plan ([#32](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/32))
- [x] Zone poligonale pe planșă ([#34](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/34))
- [x] Logo-ul firmei în cartuș ([#35](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/35))
- [x] Șabloane de proiect ([#36](https://github.com/petcumihai81-cyber/Flux1-Design-tool/pull/36))
