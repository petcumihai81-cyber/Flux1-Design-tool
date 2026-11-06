import { Arrow, Circle, Ellipse, Group, Image as KImage, Line, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { ArchElement, Project } from './types'
import { fmtM, polygonInfo, snapPoint, wallAt, wallVertices } from './arch'
import { polylineLength } from './project'
import { cachedImage } from './symbols'
import { tableData, tableLayoutPx } from './sheetTables'
import { HATCH_MM_DEFAULT, hatchTile } from './hatch'

/**
 * Desenul elementelor de arhitectură pe plan: pereți (grosime reală), uși (cu sensul de deschidere),
 * ferestre, texte de încăpere și cote. În modul Selectare se pot selecta, muta și edita.
 */

interface Props {
  arch: ArchElement[]
  ppm: number
  /** Mărimea simbolurilor (px) — textul cotelor se scalează cu ea */
  symbolSize: number
  /** px de ecran → unități plan (pentru mânere de mărime constantă) */
  k: number
  selectedId?: string
  interactive: boolean
  onSelect: (id: string, shift: boolean) => void
  /** Elementele din selecția multiplă (evidențiate, nemutabile individual) */
  groupIds?: Set<string>
  /** Dublu-click pe un text: editare directă pe plan */
  onEditText: (id: string) => void
  checkpoint: () => void
  update: (fn: (p: Project) => Project) => void
  /** Pentru tabelele de pe planșă: proiectul (datele) și px de plan pe mm de hârtie */
  project?: Project
  pxPerMm?: number
}

const INK = '#222'

/** Culoare #rrggbb cu transparență */
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Puncte pe un arc (pentru deschiderea ușii) */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n = 16) {
  const pts: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return pts
}

export default function ArchShapes({ arch, ppm, k, symbolSize, selectedId, groupIds, interactive, onSelect, onEditText, checkpoint, update, project, pxPerMm = ppm / 10 }: Props) {
  const patch = (id: string, p: Partial<ArchElement>) =>
    update((pr) => ({ ...pr, arch: pr.arch.map((a) => (a.id === id ? { ...a, ...p } : a)) }))

  const common = (a: ArchElement) => ({
    name: 'arch:' + a.id,
    onClick: (e: KonvaEventObject<MouseEvent>) => {
      if (!interactive || e.evt.button !== 0) return
      e.cancelBubble = true
      onSelect(a.id, e.evt.shiftKey)
    },
  })

  /** Mutarea întregului element (pereți și cote: se translatează punctele) */
  const moveProps = (a: ArchElement) => ({
    draggable: interactive && !locked,
    onDragStart: (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      checkpoint()
      onSelect(a.id, false)
    },
    onDragEnd: (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true
      const n = e.target
      if (a.points) {
        const dx = n.x()
        const dy = n.y()
        n.position({ x: 0, y: 0 })
        patch(a.id, { points: a.points.map((v, i) => v + (i % 2 ? dy : dx)) })
      } else {
        let x = n.x()
        let y = n.y()
        let rotation = a.rotation
        // ușile și ferestrele se lipesc din nou de perete
        if (a.kind === 'door' || a.kind === 'window') {
          const w = wallAt(arch, x, y, 0.5 * ppm)
          if (w) {
            x = w.x
            y = w.y
            const keep = Math.round(((a.rotation ?? 0) - w.angle) / 180) * 180
            rotation = w.angle + keep
          }
        }
        patch(a.id, { x, y, rotation })
      }
    },
  })

  const sel = (a: ArchElement) => a.id === selectedId || !!groupIds?.has(a.id)
  const locked = !!groupIds?.size

  /** Zonă (dreptunghi / elipsă) sau imagine: grup centrat în (x, y), rotit */
  const renderBox = (a: ArchElement) => {
    if (a.x == null || a.y == null) return null
    const w = (a.width ?? 4) * ppm
    const h = (a.height ?? 3) * ppm
    const selected = sel(a)
    if (a.kind === 'image') {
      const img = a.src ? cachedImage(`img:${a.id}:${a.src.length}`, () => a.src!) : undefined
      return (
        <Group key={a.id} {...common(a)} {...moveProps(a)} x={a.x} y={a.y} rotation={a.rotation ?? 0}>
          {img ? (
            <KImage name={'arch:' + a.id} image={img} x={-w / 2} y={-h / 2} width={w} height={h} />
          ) : (
            <Rect name={'arch:' + a.id} x={-w / 2} y={-h / 2} width={w} height={h} fill="#eceff1" stroke="#b0bec5" dash={[6 * k, 4 * k]} />
          )}
          {selected && <Rect x={-w / 2} y={-h / 2} width={w} height={h} stroke="#1e88e5" strokeWidth={2 * k} dash={[6 * k, 4 * k]} listening={false} />}
        </Group>
      )
    }
    const stroke = a.stroke ?? '#1565c0'
    const fill = a.fill ?? stroke
    const op = a.fillOpacity ?? 0.12
    const hp = hatchProps(a, stroke)
    const area = a.kind === 'rect' ? (a.width ?? 4) * (a.height ?? 3) : Math.PI * ((a.width ?? 4) / 2) * ((a.height ?? 3) / 2)
    const fs = Math.max(symbolSize * 0.42, 0.3 * ppm)
    const lines = [a.text ?? '', a.showArea !== false ? `${area.toFixed(1).replace('.', ',')} m²` : ''].filter(Boolean).join('\n')
    const shapeProps = {
      name: 'arch:' + a.id,
      fill: hexA(fill, op),
      stroke: selected ? '#1e88e5' : stroke,
      strokeWidth: Math.max(0.04 * ppm, 1.5 * k),
      dash: a.dashed !== false ? [0.25 * ppm, 0.15 * ppm] : undefined,
    }
    return (
      <Group key={a.id} {...common(a)} {...moveProps(a)} x={a.x} y={a.y} rotation={a.rotation ?? 0}>
        {a.kind === 'rect' ? <Rect {...shapeProps} x={-w / 2} y={-h / 2} width={w} height={h} /> : <Ellipse {...shapeProps} radiusX={w / 2} radiusY={h / 2} />}
        {hp && (a.kind === 'rect' ? <Rect {...hp} x={-w / 2} y={-h / 2} width={w} height={h} /> : <Ellipse {...hp} radiusX={w / 2} radiusY={h / 2} />)}
        {lines && (
          <Text
            text={lines}
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            align="center"
            verticalAlign="middle"
            fontSize={fs}
            fontStyle="bold"
            fontFamily="Arial"
            fill={stroke}
            lineHeight={1.25}
            listening={false}
          />
        )}
      </Group>
    )
  }

  /** Hașura unei zone: model repetat (în culoarea conturului), peste umplere, fără să prindă click-uri */
  const hatchProps = (a: ArchElement, color: string) => {
    const tile = hatchTile(a.hatch ?? 'none', color, (a.hatchMm ?? HATCH_MM_DEFAULT) * pxPerMm, 0.18 * pxPerMm)
    if (!tile) return null
    return {
      fillPatternImage: tile.canvas as unknown as HTMLImageElement,
      fillPatternScale: { x: 1 / tile.res, y: 1 / tile.res },
      fillPatternRepeat: 'repeat',
      fillPriority: 'pattern',
      listening: false,
      perfectDrawEnabled: false,
    }
  }

  /** Zonă poligon: contur închis prin vârfuri, cu numele și aria în centrul de greutate */
  const renderPolygon = (a: ArchElement) => {
    const pts = a.points!
    const stroke = a.stroke ?? '#6a1b9a'
    const info = polygonInfo(pts)
    const area = info.area / (ppm * ppm)
    const fs = Math.max(symbolSize * 0.42, 0.3 * ppm)
    const lines = [a.text ?? '', a.showArea !== false ? `${area.toFixed(1).replace('.', ',')} m²` : ''].filter(Boolean).join('\n')
    const tw = fs * 12
    return (
      <Group key={a.id} {...common(a)} {...moveProps(a)}>
        <Line
          name={'arch:' + a.id}
          points={pts}
          closed
          fill={hexA(a.fill ?? stroke, a.fillOpacity ?? 0.12)}
          stroke={sel(a) ? '#1e88e5' : stroke}
          strokeWidth={Math.max(0.04 * ppm, 1.5 * k)}
          dash={a.dashed !== false ? [0.25 * ppm, 0.15 * ppm] : undefined}
          lineJoin="round"
        />
        {(() => {
          const hp = hatchProps(a, stroke)
          return hp && <Line {...hp} points={pts} closed />
        })()}
        {lines && (
          <Text
            text={lines}
            x={info.cx - tw / 2}
            y={info.cy - fs * 1.25}
            width={tw}
            align="center"
            fontSize={fs}
            fontStyle="bold"
            fontFamily="Arial"
            fill={stroke}
            lineHeight={1.25}
            listening={false}
          />
        )}
      </Group>
    )
  }

  /** Notă cu săgeată: points = [vârful săgeții, locul textului]; textul stă deasupra unei linii de sprijin */
  const renderNote = (a: ArchElement) => {
    const [tx, ty, ax, ay] = a.points!
    const fpx = (a.fontMm ?? 2.5) * pxPerMm
    const lines = (a.text ?? '').split('\n')
    const w = Math.max(fpx * 2, Math.max(...lines.map((l) => [...l].length)) * fpx * 0.6)
    const lh = fpx * 1.25
    const h = lines.length * lh
    const pad = fpx * 0.35
    // textul se așază de partea opusă vârfului
    const right = tx <= ax
    const x0 = right ? ax : ax - w
    const color = sel(a) ? '#1565c0' : a.stroke ?? '#222222'
    const sw = Math.max(fpx * 0.09, 0.8 * k)
    return (
      <Group key={a.id} {...common(a)} {...moveProps(a)}>
        <Arrow
          name={'arch:' + a.id}
          points={[ax, ay, tx, ty]}
          stroke={color}
          fill={color}
          strokeWidth={sw}
          pointerLength={fpx * 1.1}
          pointerWidth={fpx * 0.75}
          hitStrokeWidth={Math.max(fpx, 10 * k)}
        />
        {a.boxed && <Rect x={x0 - pad} y={ay - h - pad} width={w + 2 * pad} height={h + pad} fill="#fff" stroke={color} strokeWidth={sw} />}
        <Line name={'arch:' + a.id} points={[x0, ay, x0 + w, ay]} stroke={color} strokeWidth={sw} />
        <Text
          name={'arch:' + a.id}
          x={x0}
          y={ay - h - pad * 0.4}
          width={w}
          text={a.text ?? ''}
          fontSize={fpx}
          lineHeight={1.25}
          fontFamily="Arial"
          fill={color}
          align={right ? 'left' : 'right'}
          onDblClick={(e) => {
            if (!interactive) return
            e.cancelBubble = true
            onEditText(a.id)
          }}
        />
      </Group>
    )
  }

  /** Dimensiunile tabelului (px plan) din date și mărimea textului pe hârtie */
  const tableLayout = (a: ArchElement) => {
    if (!project || !a.table) return null
    const data = tableData(project, a.table, a.levelId)
    return { data, ...tableLayoutPx(data, a.table.fontMm ?? 2.5, pxPerMm) }
  }

  /** Tabel pe planșă: (x, y) = colțul din stânga-sus */
  const renderTable = (a: ArchElement) => {
    const L = tableLayout(a)
    if (!L || a.x == null || a.y == null) return null
    const { data, fpx, rowH, colW, width, height, titleH } = L
    const xs = colW.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [0])
    const pad = fpx * 0.35
    const rows = data.rows.length ? data.rows : [['', '(fără date)']]
    return (
      <Group key={a.id} {...common(a)} {...moveProps(a)} x={a.x} y={a.y} rotation={a.rotation ?? 0}>
        <Rect name={'arch:' + a.id} y={titleH} width={width} height={height - titleH} fill="#fff" stroke={sel(a) ? '#1e88e5' : '#222'} strokeWidth={fpx * 0.12} />
        <Text text={data.title.toUpperCase()} width={width} height={titleH} verticalAlign="middle" fontSize={fpx * 1.05} fontStyle="bold" fontFamily="Arial" fill="#222" listening={false} />
        <Rect y={titleH} width={width} height={rowH} fill="#eceff1" listening={false} />
        {data.header.map((hd, i) => (
          <Text key={'h' + i} text={hd} x={xs[i] + pad} y={titleH} width={colW[i] - 2 * pad} height={rowH} verticalAlign="middle" fontSize={fpx} fontStyle="bold" fontFamily="Arial" fill="#222" ellipsis wrap="none" listening={false} />
        ))}
        {rows.map((r, ri) => {
          const y = titleH + rowH * (ri + 1)
          const section = r.length === 1 && r[0].startsWith('§')
          return (
            <Group key={'r' + ri} listening={false}>
              <Line points={[0, y, width, y]} stroke="#90a4ae" strokeWidth={fpx * 0.06} />
              {section ? (
                <Text text={r[0].slice(1)} x={pad} y={y} width={width - 2 * pad} height={rowH} verticalAlign="middle" fontSize={fpx} fontStyle="bold" fontFamily="Arial" fill="#37474f" />
              ) : (
                r.map((c, ci) => (
                  <Text key={ci} text={c} x={xs[ci] + pad} y={y} width={colW[ci] - 2 * pad} height={rowH} verticalAlign="middle" fontSize={fpx} fontFamily="Arial" fill="#222" ellipsis wrap="none" />
                ))
              )}
            </Group>
          )
        })}
        {xs.slice(1, -1).map((x, i) => (
          <Line key={'v' + i} points={[x, titleH, x, height]} stroke="#90a4ae" strokeWidth={fpx * 0.06} listening={false} />
        ))}
      </Group>
    )
  }

  /** Mânerul din colțul dreapta-jos: zonele se redimensionează liber, imaginile proporțional, tabelele schimbă mărimea textului */
  const resizeHandle = (a: ArchElement) => {
    if (a.x == null || a.y == null) return null
    const r = ((a.rotation ?? 0) * Math.PI) / 180
    const cs = Math.cos(r)
    const sn = Math.sin(r)
    const isTable = a.kind === 'table'
    const L = isTable ? tableLayout(a) : null
    if (isTable && !L) return null
    const w = isTable ? L!.width : (a.width ?? 4) * ppm
    const h = isTable ? L!.height : (a.height ?? 3) * ppm
    // colțul fix (stânga-sus) și colțul tras (dreapta-jos), în coordonate plan
    const tl = isTable ? { x: a.x, y: a.y } : { x: a.x - (cs * w) / 2 + (sn * h) / 2, y: a.y - (sn * w) / 2 - (cs * h) / 2 }
    const br = { x: tl.x + cs * w - sn * h, y: tl.y + sn * w + cs * h }
    return (
      <Rect
        key={'rs' + a.id}
        x={br.x}
        y={br.y}
        width={12 * k}
        height={12 * k}
        offsetX={6 * k}
        offsetY={6 * k}
        rotation={a.rotation ?? 0}
        fill="#1e88e5"
        stroke="#fff"
        strokeWidth={1.5 * k}
        draggable
        onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'nwse-resize')}
        onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
        onDragStart={(e) => {
          e.cancelBubble = true
          checkpoint()
        }}
        onDragMove={(e) => {
          e.cancelBubble = true
          const dx = e.target.x() - tl.x
          const dy = e.target.y() - tl.y
          // proiecția pe axele elementului rotit
          let nw = Math.max(0.2 * ppm, dx * cs + dy * sn)
          let nh = Math.max(0.2 * ppm, -dx * sn + dy * cs)
          if (isTable) {
            const f = Math.max(0.6, Math.min(12, ((a.table?.fontMm ?? 2.5) * nw) / w))
            patch(a.id, { table: { ...a.table!, fontMm: Math.round(f * 10) / 10 } })
            return
          }
          if (a.kind === 'image') nh = nw * (h / w)
          else nw = Math.round((nw / ppm) * 20) / 20 * ppm
          if (a.kind !== 'image') nh = Math.round((nh / ppm) * 20) / 20 * ppm
          patch(a.id, {
            width: nw / ppm,
            height: nh / ppm,
            x: tl.x + (cs * nw - sn * nh) / 2,
            y: tl.y + (sn * nw + cs * nh) / 2,
          })
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true
        }}
      />
    )
  }

  return (
    <>
      {/* zonele și imaginile, sub pereți */}
      {arch.filter((a) => a.kind === 'rect' || a.kind === 'ellipse' || a.kind === 'image').map((a) => renderBox(a))}
      {arch.filter((a) => a.kind === 'polygon' && a.points && a.points.length >= 6).map((a) => renderPolygon(a))}
      {/* pereții primii, ca ușile și ferestrele să-i „taie” */}
      {arch
        .filter((a) => a.kind === 'wall' && a.points)
        .map((a) => (
          <Line
            key={a.id}
            {...common(a)}
            {...moveProps(a)}
            points={a.points!}
            stroke={sel(a) ? '#1565c0' : INK}
            strokeWidth={(a.thickness ?? 0.25) * ppm}
            lineCap="square"
            lineJoin="miter"
            hitStrokeWidth={Math.max((a.thickness ?? 0.25) * ppm, 10 * k)}
          />
        ))}

      {arch.map((a) => {
        if (a.kind === 'door' || a.kind === 'window') {
          const w = (a.width ?? (a.kind === 'door' ? 0.9 : 1.2)) * ppm
          const t = 0.32 * ppm // acoperă grosimea peretelui
          const color = sel(a) ? '#1565c0' : INK
          return (
            <Group key={a.id} {...common(a)} {...moveProps(a)} x={a.x} y={a.y} rotation={a.rotation ?? 0} scaleX={a.flipX ? -1 : 1} scaleY={a.flipY ? -1 : 1}>
              <Rect name={'arch:' + a.id} x={-w / 2} y={-t / 2} width={w} height={t} fill="#fff" />
              {a.kind === 'door' ? (
                <>
                  {/* foaia ușii (deschisă la 90°) și arcul de deschidere */}
                  <Line name={'arch:' + a.id} points={[-w / 2, 0, -w / 2, -w]} stroke={color} strokeWidth={Math.max(0.04 * ppm, 1.5 * k)} />
                  <Line name={'arch:' + a.id} points={arcPoints(-w / 2, 0, w, -90, 0)} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} dash={[6 * k, 4 * k]} />
                  <Line name={'arch:' + a.id} points={[-w / 2, -t / 2, -w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[w / 2, -t / 2, w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                </>
              ) : (
                <>
                  <Rect name={'arch:' + a.id} x={-w / 2} y={-t / 4} width={w} height={t / 2} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[-w / 2, 0, w / 2, 0]} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[-w / 2, -t / 2, -w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                  <Line name={'arch:' + a.id} points={[w / 2, -t / 2, w / 2, t / 2]} stroke={color} strokeWidth={Math.max(0.03 * ppm, 1 * k)} />
                </>
              )}
            </Group>
          )
        }
        if (a.kind === 'label') {
          const h = (a.size ?? 0.45) * ppm
          // lățimea aproximativă a textului, ca zona de click să nu acopere pereții vecini
          const labelW = Math.max(h * 2, [...(a.text ?? '')].length * h * 0.58)
          return (
            <Text
              key={a.id}
              {...common(a)}
              {...moveProps(a)}
              x={a.x}
              y={a.y}
              rotation={a.rotation ?? 0}
              text={a.text ?? ''}
              fontSize={h}
              fontStyle="bold"
              fontFamily="Arial"
              fill={sel(a) ? '#1565c0' : '#555'}
              width={labelW}
              offsetX={labelW / 2}
              offsetY={h / 2}
              align="center"
              onDblClick={(e) => {
                if (!interactive) return
                e.cancelBubble = true
                onEditText(a.id)
              }}
            />
          )
        }
        if (a.kind === 'riser') {
          // trecere între niveluri: cerc cu săgeți sus / jos și numele ghenei
          const r = symbolSize * 0.45
          const color = sel(a) ? '#1565c0' : '#455a64'
          const sw = Math.max(symbolSize * 0.06, 1.5 * k)
          return (
            <Group key={a.id} {...common(a)} {...moveProps(a)} x={a.x} y={a.y}>
              <Circle name={'arch:' + a.id} radius={r} fill="#fff" stroke={color} strokeWidth={sw} />
              <Line name={'arch:' + a.id} points={[-r * 0.38, -r * 0.18, 0, -r * 0.62, r * 0.38, -r * 0.18]} stroke={color} strokeWidth={sw} lineJoin="round" />
              <Line name={'arch:' + a.id} points={[-r * 0.38, r * 0.18, 0, r * 0.62, r * 0.38, r * 0.18]} stroke={color} strokeWidth={sw} lineJoin="round" />
              <Text
                name={'arch:' + a.id}
                text={a.text ?? 'G'}
                y={r + symbolSize * 0.08}
                width={symbolSize * 3}
                offsetX={symbolSize * 1.5}
                align="center"
                fontSize={symbolSize * 0.36}
                fontStyle="bold"
                fontFamily="Arial"
                fill={color}
              />
            </Group>
          )
        }
        if (a.kind === 'dim' && a.points) {
          const [x1, y1, x2, y2] = a.points
          const ang = Math.atan2(y2 - y1, x2 - x1)
          const L = Math.hypot(x2 - x1, y2 - y1)
          const tk = 0.15 * ppm
          const nx = -Math.sin(ang)
          const ny = Math.cos(ang)
          const color = sel(a) ? '#1565c0' : INK
          const fs = Math.max(0.3 * ppm, symbolSize * 0.35, 10 * k)
          let deg = (ang * 180) / Math.PI
          if (deg > 90 || deg < -90) deg += 180
          return (
            <Group key={a.id} {...common(a)} {...moveProps(a)}>
              <Line name={'arch:' + a.id} points={a.points} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} hitStrokeWidth={10 * k} />
              <Line name={'arch:' + a.id} points={[x1 - nx * tk, y1 - ny * tk, x1 + nx * tk, y1 + ny * tk]} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
              <Line name={'arch:' + a.id} points={[x2 - nx * tk, y2 - ny * tk, x2 + nx * tk, y2 + ny * tk]} stroke={color} strokeWidth={Math.max(0.02 * ppm, 1 * k)} />
              <Text
                name={'arch:' + a.id}
                x={(x1 + x2) / 2 - nx * fs * 0.9}
                y={(y1 + y2) / 2 - ny * fs * 0.9}
                rotation={deg}
                text={fmtM(L / ppm)}
                fontSize={fs}
                fontFamily="Arial"
                fill={color}
                width={fs * 8}
                offsetX={fs * 4}
                offsetY={fs / 2}
                align="center"
              />
            </Group>
          )
        }
        return null
      })}

      {/* mânere pentru vârfurile peretelui / capetele cotei selectate */}
      {interactive &&
        arch
          // notele au mânerele pe stratul de interfață (deasupra simbolurilor spre care arată)
          .filter((a) => a.id === selectedId && a.points && a.kind !== 'note' && a.kind !== 'line')
          .map((a) =>
            a.points!.map((_, i) =>
              i % 2 ? null : (
                <Circle
                  key={a.id + i}
                  x={a.points![i]}
                  y={a.points![i + 1]}
                  radius={6 * k}
                  fill="#fff"
                  stroke="#1e88e5"
                  strokeWidth={2 * k}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true
                    checkpoint()
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true
                    const pts = [...a.points!]
                    const prev = i >= 2 ? { x: pts[i - 2], y: pts[i - 1] } : i + 2 < pts.length ? { x: pts[i + 2], y: pts[i + 3] } : undefined
                    const p = snapPoint({ x: e.target.x(), y: e.target.y() }, prev, wallVertices(arch, a.id), 10 * k, e.evt.shiftKey)
                    e.target.position(p)
                    pts[i] = p.x
                    pts[i + 1] = p.y
                    patch(a.id, { points: pts })
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true
                  }}
                />
              ),
            ),
          )}
      {/* uși / ferestre selectate: mânere la capete, care alunecă de-a lungul peretelui */}
      {interactive &&
        arch
          .filter((a) => a.id === selectedId && (a.kind === 'door' || a.kind === 'window') && a.x != null && a.y != null)
          .map((a) => {
            const width = a.width ?? (a.kind === 'door' ? 0.9 : 1.2)
            const rot = ((a.rotation ?? 0) * Math.PI) / 180
            const ux = Math.cos(rot)
            const uy = Math.sin(rot)
            const half = (width * ppm) / 2
            const ends = [-1, 1].map((sgn) => ({ sgn, x: a.x! + ux * half * sgn, y: a.y! + uy * half * sgn }))
            return (
              <Group key={'gw' + a.id}>
                {ends.map((end) => {
                  const fixed = ends.find((e) => e.sgn !== end.sgn)!
                  return (
                    <Rect
                      key={end.sgn}
                      x={end.x}
                      y={end.y}
                      width={11 * k}
                      height={11 * k}
                      offsetX={5.5 * k}
                      offsetY={5.5 * k}
                      rotation={a.rotation ?? 0}
                      fill="#1e88e5"
                      stroke="#fff"
                      strokeWidth={1.5 * k}
                      draggable
                      onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'ew-resize')}
                      onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                      onDragStart={(e) => {
                        e.cancelBubble = true
                        checkpoint()
                      }}
                      onDragMove={(e) => {
                        e.cancelBubble = true
                        // proiecția pe direcția peretelui; capătul opus rămâne fix
                        const along = (e.target.x() - fixed.x) * ux * end.sgn + (e.target.y() - fixed.y) * uy * end.sgn
                        const w = Math.max(0.3, Math.round((along / ppm) * 20) / 20)
                        const cx = fixed.x + ux * end.sgn * ((w * ppm) / 2)
                        const cy = fixed.y + uy * end.sgn * ((w * ppm) / 2)
                        patch(a.id, { width: w, x: cx, y: cy })
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true
                      }}
                    />
                  )
                })}
                <Text
                  x={a.x! - uy * 0.45 * ppm}
                  y={a.y! + ux * 0.45 * ppm}
                  text={fmtM(width)}
                  fontSize={13 * k}
                  fontStyle="bold"
                  fill="#1565c0"
                  width={120 * k}
                  offsetX={60 * k}
                  offsetY={6 * k}
                  align="center"
                  listening={false}
                />
              </Group>
            )
          })}
      {/* mâner de redimensionare pentru textul selectat (colțul din dreapta-jos) */}
      {interactive &&
        arch
          .filter((a) => a.id === selectedId && a.kind === 'label' && a.x != null && a.y != null)
          .map((a) => {
            const len = Math.max(3, [...(a.text ?? '')].length)
            // distanța centru → colț, pentru o înălțime de 1 m
            const unit = ppm * Math.hypot(Math.max(1, len * 0.58) / 2, 0.5)
            const size = a.size ?? 0.45
            const rot = ((a.rotation ?? 0) * Math.PI) / 180
            const lx = (Math.max(1, len * 0.58) / 2) * size * ppm
            const ly = 0.5 * size * ppm
            const hx = a.x! + lx * Math.cos(rot) - ly * Math.sin(rot)
            const hy = a.y! + lx * Math.sin(rot) + ly * Math.cos(rot)
            return (
              <Rect
                key={'rs' + a.id}
                x={hx}
                y={hy}
                width={11 * k}
                height={11 * k}
                offsetX={5.5 * k}
                offsetY={5.5 * k}
                fill="#1e88e5"
                stroke="#fff"
                strokeWidth={1.5 * k}
                draggable
                onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'nwse-resize')}
                onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
                onDragStart={(e) => {
                  e.cancelBubble = true
                  checkpoint()
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true
                  const d = Math.hypot(e.target.x() - a.x!, e.target.y() - a.y!)
                  const s = Math.max(0.1, Math.round((d / unit) * 20) / 20)
                  patch(a.id, { size: s })
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true
                }}
              />
            )
          })}
      {arch.filter((a) => a.kind === 'table').map((a) => renderTable(a))}
      {arch.filter((a) => a.kind === 'line' && a.points && a.points.length >= 4).map((a) => {
        const color = sel(a) ? '#1565c0' : a.stroke ?? '#222222'
        const sw = Math.max((a.widthMm ?? 0.35) * pxPerMm, 0.8 * k)
        const head = Math.max(sw * 4, 2.2 * pxPerMm)
        return (
          <Arrow
            key={a.id}
            {...common(a)}
            {...moveProps(a)}
            points={a.points!}
            stroke={color}
            fill={color}
            strokeWidth={sw}
            dash={a.dashed ? [sw * 6, sw * 4] : undefined}
            pointerAtBeginning={!!a.arrowStart}
            pointerAtEnding={!!a.arrowEnd}
            pointerLength={head}
            pointerWidth={head * 0.7}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={Math.max(sw, 10 * k)}
          />
        )
      })}
      {arch.filter((a) => a.kind === 'note' && a.points && a.points.length >= 4).map((a) => renderNote(a))}
      {/* zonă / imagine / tabel selectat: mâner de redimensionare în colțul din dreapta-jos */}
      {interactive &&
        arch
          .filter((a) => a.id === selectedId && (a.kind === 'rect' || a.kind === 'ellipse' || a.kind === 'image' || a.kind === 'table'))
          .map((a) => resizeHandle(a))}
      {/* lungimea peretelui selectat */}
      {arch
        .filter((a) => a.id === selectedId && a.kind === 'wall' && a.points && a.points.length >= 4)
        .map((a) => (
          <Text
            key={'len' + a.id}
            x={a.points![0]}
            y={a.points![1] - 22 * k}
            text={fmtM(polylineLength(a.points!) / ppm)}
            fontSize={13 * k}
            fontStyle="bold"
            fill="#1565c0"
            listening={false}
          />
        ))}
    </>
  )
}
