// 코스 품질 자동 점검 — 동네마다 낮·저녁 코스를 실제로 뽑아 규칙 위반을 찾는다.
//  고치다가 다른 데가 조용히 깨지는 걸 막는 용도 (2026-10-13: 지도 FitBounds·검색 핀 버그처럼).
//  ❌ 오류(exit 1): 중심 관광지 누락 · 중심에서 1km 초과 · 적합도 0점 중심 · 저녁에 19시 전 마감 · 같은 장소 중복 · 코스 생성 실패
//  ⚠️ 경고: 예상 시각이 이용시간 밖(timeOk=false) · 도보 25분 넘는 구간 · 장소 3곳 미만
//  + PLANS: 만나는 시각·첫 순서·정해 둔 일정이 지켜지는지.
//  Gemini 를 실제로 부른다(동네×2회 + PLANS). 실행: node scripts/checkCourses.mjs [slug…]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}
const { default: course } = await import('../api/course.js')
const { area } = await import('../lib/areas.js')

// 동네별 출발점 — 화면 추천 칩(StartPanel POPULAR)과 같은 좌표·범위
const POINTS = {
  seongsu: { label: '성수역', c: [127.0557, 37.5446], spot: true },
  yongsan: { label: '용산역', c: [126.9648, 37.5298], spot: true },
  jongno3: { label: '종로3가역', c: [126.9917, 37.5714], spot: true },
  itaewon: { label: '이태원역', c: [126.9945, 37.5345], spot: true },
  yeonnam: { label: '연남동', c: [126.9225, 37.5627], spot: true },
  euljiro: { label: '을지로3가역', c: [126.9926, 37.5663], spot: true },
  songridan: { label: '석촌호수', c: [127.1040, 37.5097], spot: true },
  cheonan_buldang: { label: '천안 불당동', c: [127.1095, 36.8125] },
  cheonan_sinbu: { label: '천안 신부동', c: [127.1556, 36.8196] },
}
const haversine2 = (a, b) => meters(a, b)
const meters = (a, b) => { const dx = (a.lng - b.lng) * 88000, dy = (a.lat - b.lat) * 111000; return Math.round(Math.sqrt(dx * dx + dy * dy)) }
const lastClose = (use = '') => { const e = [...String(use).matchAll(/~\s*(\d{1,2}):\d{2}/g)].map((m) => +m[1]); return e.length ? Math.max(...e) : null }

let n = 0
async function run(slug, time) {
  const p = POINTS[slug]
  const d = p.spot ? 0.012 : 0.02
  const res = { code: 200, status(c) { res.code = c; return res }, json(o) { res.o = o; return res }, setHeader() {}, end() {} }
  const query = { bbox: `${p.c[0] - d},${p.c[1] - d},${p.c[0] + d},${p.c[1] + d}`, theme: '데이트', time, car: '1' }
  if (p.spot) Object.assign(query, { from: p.label, fx: p.c[0], fy: p.c[1] })
  // 호출 제한(IP당 시간당 10회)에 안 걸리게 점검용 IP 를 매번 다르게
  await course({ query, method: 'GET', headers: { 'x-forwarded-for': `check-${n++}` } }, res)
  const c = res.o?.course
  const err = [], warn = []
  if (!c) { err.push(`코스 생성 실패 (${res.code} ${res.o?.reason || res.o?.error || ''})`); return { slug, time, c, err, warn } }
  const places = new Map(area(slug).places.map((x) => [x.id, x]))
  const ids = c.stops.map((s) => s.id)
  if (new Set(ids).size !== ids.length) err.push('같은 장소 중복')
  if (c.stops.length < 3) warn.push(`장소 ${c.stops.length}곳뿐`)
  const a = c.anchor && c.stops.find((s) => s.id === c.anchor.id)
  if (c.anchor && !a) err.push(`중심 ${c.anchor.name} 이 코스에 없음`)
  if (a) {
    const ap = places.get(a.id)
    // 저녁엔 밤 4점 이상이면 낮 0점이어도 허용(을지로 노가리골목 등) — api/course.js anchorOk 와 같은 규칙
    if (ap?.fit === 0 && !(time === 'evening' && (ap?.night ?? 0) >= 4)) err.push(`적합도 0점 중심: ${a.name}`)
    if (p.spot && haversine2(a, { lng: p.c[0], lat: p.c[1] }) > 950) err.push(`중심 ${a.name} 이 출발역에서 ${haversine2(a, { lng: p.c[0], lat: p.c[1] })}m`)
    if (time === 'evening' && ap?.night === 0) err.push(`밤 0점 중심: ${a.name}`)
    for (const s of c.stops) { const m = meters(a, s); if (m > 1100) err.push(`${s.name} 중심에서 ${m}m`) }
  }
  for (const s of c.stops) {
    if (time === 'evening') { const h = lastClose(s.hours?.use); if (h !== null && h >= 6 && h < 19) err.push(`저녁인데 ${h}시 마감: ${s.name}`) }
    if (s.timeOk === false) warn.push(`${s.time} ${s.name} 이용시간 밖 (${(s.hours?.use || '').replace(/\s+/g, ' ').slice(0, 24)})`)
  }
  ;(c.legs || []).forEach((l, i) => { if (l.walk?.min > 25) warn.push(`${c.stops[i].name}→${c.stops[i + 1].name} 도보 ${l.walk.min}분`) })
  return { slug, time, c, err, warn }
}

// 시작 시각·첫 순서·정해 둔 일정 (한 문장 입력 "밤 8시에 올댓재즈, 1시쯤 만나서 점심부터")
const PLANS = [
  { slug: 'itaewon', label: '이태원 13시 점심부터 → 🎯20:00 올댓재즈', st: '13:00', first: '점심', fixed: { label: '올댓재즈', lng: 126.9926, lat: 37.5338, time: '20:00' } },
  { slug: 'seongsu', label: '성수 15시 카페부터', st: '15:00', first: '카페' },
]
async function runPlan(pl) {
  const p = POINTS[pl.slug], d = 0.012
  const res = { code: 200, status(c) { res.code = c; return res }, json(o) { res.o = o; return res }, setHeader() {}, end() {} }
  const query = { bbox: `${p.c[0] - d},${p.c[1] - d},${p.c[0] + d},${p.c[1] + d}`, from: p.label, fx: p.c[0], fy: p.c[1], st: pl.st, first: pl.first }
  if (pl.fixed) Object.assign(query, { fixed: pl.fixed.label, kx: pl.fixed.lng, ky: pl.fixed.lat, kt: pl.fixed.time })
  await course({ query, method: 'GET', headers: { 'x-forwarded-for': `check-${n++}` } }, res)
  const c = res.o?.course, err = [], warn = []
  if (!c) return { c, err: [`코스 생성 실패 (${res.code} ${res.o?.error || ''})`], warn }
  const min = (t) => { const [h, m] = t.split(':'); return +h * 60 + +m }
  const s0 = c.stops[0]
  if (Math.abs(min(s0.time) - min(pl.st)) > 30) err.push(`첫 장소 ${s0.time} — 시작 ${pl.st} 과 30분 넘게 차이`)
  const isMeal = (s) => s.kind === 'food' && s.cat !== '카페'
  if ((pl.first === '점심' || pl.first === '저녁') && !isMeal(s0)) err.push(`첫 장소가 식사가 아님: ${s0.name}`)
  if (pl.first === '카페' && s0.cat !== '카페') err.push(`첫 장소가 카페가 아님: ${s0.name}`)
  if (pl.fixed) {
    if (c.fixed?.late) err.push(`정해 둔 ${pl.fixed.time} 에 늦음`)
    if (c.fixed?.walk?.min > 15) warn.push(`마지막 → 정해 둔 곳 도보 ${c.fixed.walk.min}분`)
    if (c.stops.length < 4) warn.push(`7시간인데 ${c.stops.length}곳뿐`)
  }
  return { c, err, warn }
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(POINTS)
let errors = 0
for (const pl of PLANS) {
  if (!slugs.includes(pl.slug)) continue
  const r = await runPlan(pl)
  errors += r.err.length
  console.log(`${r.err.length ? '❌' : r.warn.length ? '⚠️' : '✅'} ${pl.label} — ${r.c ? r.c.stops.map((s) => `${s.time} ${s.name}`).join(' → ') + (r.c.fixed ? ` → 🎯${r.c.fixed.time}` : '') : ''}`)
  for (const e of r.err) console.log(`     ❌ ${e}`)
  for (const w of r.warn) console.log(`     ⚠️ ${w}`)
}
for (const slug of slugs) {
  for (const time of ['day', 'evening']) {
    const r = await run(slug, time)
    errors += r.err.length
    const mark = r.err.length ? '❌' : r.warn.length ? '⚠️' : '✅'
    console.log(`${mark} ${slug} ${time === 'evening' ? '저녁' : '낮'} — ${r.c ? `📌${r.c.anchor?.name || '-'} | ${r.c.stops.map((s) => `${s.time} ${s.name}`).join(' → ')}` : ''}`)
    for (const e of r.err) console.log(`     ❌ ${e}`)
    for (const w of r.warn) console.log(`     ⚠️ ${w}`)
  }
}
console.log(errors ? `\n오류 ${errors}건` : '\n오류 없음')
process.exit(errors ? 1 : 0)
