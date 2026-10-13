// 동네 데이터 보강 — buildArea 결과(src/data/places/<slug>.json)에 덧붙인다. 관광공사 기본 API(KorService2)는 부르지 않음.
//  ① 인기 점수(pop): 한국관광공사 '관광지별 연관 관광지'(티맵 내비 검색 기반, TarRlteTarService1) — 같은 구 데이터만
//     · 중심 관광지로 선정 +20, 다른 중심 관광지의 '함께 간 곳'으로 등장할 때마다 +1
//     · 이름만으로 맞추면 다른 동네 동명 가게가 섞여서(예: 종로 '경복궁' 식당) 같은 구(rlteSignguCd)일 때만 센다
//  ② 주차장(parking): 전국주차장정보표준데이터(data.go.kr 15012896, 공영·민영, 요금·운영시간) — 동네 범위 + 500m
//  전부 "이용허락범위 제한 없음".
//
// 실행:  node scripts/enrichArea.mjs yongsan        (buildArea.mjs 도 끝에서 자동 호출)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, 'data_raw')

// 동네 → 연관 관광지 API 의 시군구 코드 (행정표준코드, 앞 5자리)
export const RLTE = {
  seongsu: { areaCd: '11', signguCd: '11200' },        // 성동구
  yongsan: { areaCd: '11', signguCd: '11170' },        // 용산구
  jongno3: { areaCd: '11', signguCd: '11110' },        // 종로구
  cheonan_buldang: { areaCd: '44', signguCd: '44133' }, // 천안 서북구
  cheonan_sinbu: { areaCd: '44', signguCd: '44131' },   // 천안 동남구
}

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

const norm = (s = '') => s.split('/')[0].replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase()

// 최근 기준월부터 거꾸로 찾아 데이터가 있는 달을 쓴다
async function rlteRows(key, { areaCd, signguCd }) {
  const now = new Date()
  for (let back = 0; back < 6; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const baseYm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const out = []
    for (let page = 1; page <= 5; page++) {
      const qs = new URLSearchParams({ serviceKey: key, MobileOS: 'ETC', MobileApp: 'kokkokkok', _type: 'json', numOfRows: 1000, pageNo: page, baseYm, areaCd, signguCd })
      let b
      try { b = (await (await fetch(`https://apis.data.go.kr/B551011/TarRlteTarService1/areaBasedList1?${qs}`)).json())?.response?.body } catch (_) { b = null }
      out.push(...(b?.items?.item || []))
      if (!b || page * 1000 >= (b.totalCount || 0)) break
    }
    if (out.length) return { baseYm, rows: out }
  }
  return { baseYm: null, rows: [] }
}

function scorePop(area, rows, signguCd) {
  const center = new Set(rows.map((r) => norm(r.tAtsNm)))
  // 분류가 같은 것끼리만 센다 — 관광지 '경복궁'이 같은 이름 식당 점수로 들어가는 것 방지
  const cnt = { travel: {}, food: {} }
  for (const r of rows) {
    if (r.rlteSignguCd !== signguCd) continue
    const kind = r.rlteCtgryLclsNm === '음식' ? 'food' : r.rlteCtgryLclsNm === '관광지' ? 'travel' : null
    if (kind) cnt[kind][norm(r.rlteTatsNm)] = (cnt[kind][norm(r.rlteTatsNm)] || 0) + 1
  }
  let n = 0
  for (const p of area.places) {
    const k = norm(p.name)
    if (k.length < 2) continue
    const pop = (center.has(k) && p.kind === 'travel' ? 20 : 0) + (cnt[p.kind]?.[k] || 0)
    if (pop > 0) { p.pop = pop; n++ } else delete p.pop
  }
  return n
}

// ── 데이트 적합도(fit 0~5) — 중심 관광지를 사람이 고르지 않도록 AI가 상식으로 판정 ──
//  · 입력은 공공데이터(이름·분류·주소)뿐 → AI 입력 허용. 결과는 우리 가공물.
//  · "이 가게 알아?"(지식)가 아니라 "공원 vs 체육공원" 같은 상식 판단이라 과장 위험이 낮다.
async function scoreFit(area, key) {
  const sights = area.places.filter((p) => p.kind === 'travel')
  if (!sights.length || !key) return 0
  const prompt = [
    `너는 "${area.label}" 동네의 데이트 코스 큐레이터야. 아래 장소마다 "연인 데이트 코스의 중심(메인 볼거리)"으로 얼마나 적합한지 0~5점을 매겨.`,
    '기준: 5=이 동네를 대표하는 데이트 명소(누구나 아는 큰 공원·궁궐·대표 거리) / 4=데이트로 좋은 곳(산책로·감성 거리·한옥거리·전시공간) / 3=괜찮음(박물관·갤러리·시장) / 2=곁들이기 좋음(편집숍·플래그십 매장) / 1=애매(일반 매장·특정 목적 시설) / 0=부적합(체육시설·기념비·종교 성지·관공서·음식 골목·주차장·학교·키즈 시설).',
    '이름과 분류만 보고 상식으로 판단해. 형식: id|이름|분류|주소',
    sights.map((p) => `${p.id}|${p.name}|${p.cat}|${(p.addr || '').split(' ').slice(1, 4).join(' ')}`).join('\n'),
  ].join('\n')
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, fit: { type: 'INTEGER' } }, required: ['id', 'fit'] } } },
  }
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) {
        const got = JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '[]')
        const fit = new Map(got.map((g) => [g.id, Math.max(0, Math.min(5, g.fit | 0))]))
        let n = 0
        for (const p of sights) if (fit.has(p.id)) { p.fit = fit.get(p.id); n++ }
        return n
      }
    } catch (_) {}
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)))
  }
  return 0
}

// ── 주차장 ──
const hm = (a, b) => (a && b ? `${a}~${b}` : '')
const won = (n) => (n ? `${Number(n).toLocaleString()}원` : '')
async function readParking(bbox) {
  const f = path.join(RAW, '전국주차장정보표준데이터.csv')
  if (!fs.existsSync(f)) return []
  const pad = 0.006 // ≈500m
  const [w, s, e, n] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad]
  const txt = new TextDecoder('euc-kr').decode(fs.readFileSync(f))
  const out = []
  for await (const r of parse(txt, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true })) {
    const lat = parseFloat(r['위도']), lng = parseFloat(r['경도'])
    if (!(lng >= w && lng <= e && lat >= s && lat <= n)) continue
    const free = /무료/.test(r['요금정보'] || '')
    out.push({
      id: r['주차장관리번호'], name: r['주차장명'], type: r['주차장구분'] || '', form: r['주차장유형'] || '',
      lat: +lat.toFixed(6), lng: +lng.toFixed(6), spaces: parseInt(r['주차구획수'], 10) || 0,
      addr: r['소재지도로명주소'] || r['소재지지번주소'] || '',
      hours: { wd: hm(r['평일운영시작시각'], r['평일운영종료시각']), sat: hm(r['토요일운영시작시각'], r['토요일운영종료시각']), hol: hm(r['공휴일운영시작시각'], r['공휴일운영종료시각']) },
      fee: free ? '무료' : [r['주차기본시간'] && r['주차기본요금'] ? `${r['주차기본시간']}분 ${won(r['주차기본요금'])}` : '', r['추가단위시간'] && r['추가단위요금'] ? `추가 ${r['추가단위시간']}분 ${won(r['추가단위요금'])}` : '', r['1일주차권요금'] ? `1일 ${won(r['1일주차권요금'])}` : ''].filter(Boolean).join(' · '),
      tel: r['전화번호'] || '', asOf: r['데이터기준일자'] || '',
    })
  }
  return out
}

export async function enrich(slug) {
  const file = path.join(ROOT, 'src', 'data', 'places', `${slug}.json`)
  const area = JSON.parse(fs.readFileSync(file, 'utf8'))
  const env = loadEnv()
  if (RLTE[slug] && env.TOUR_API_KEY) {
    const { baseYm, rows } = await rlteRows(env.TOUR_API_KEY, RLTE[slug])
    const n = scorePop(area, rows, RLTE[slug].signguCd)
    area.popAsOf = baseYm
    console.log(`인기 점수(연관 관광지 ${baseYm || '없음'}, ${rows.length}행): ${n}곳`)
  }
  const nFit = await scoreFit(area, env.GEMINI_API_KEY)
  console.log(`데이트 적합도: 관광지 ${nFit}곳 판정`)
  area.parking = await readParking(area.bbox)
  console.log(`주차장: ${area.parking.length}곳 (공영 ${area.parking.filter((p) => p.type === '공영').length} · 민영 ${area.parking.filter((p) => p.type === '민영').length})`)
  if (!area.sources.includes('한국관광공사 연관 관광지')) area.sources.push('한국관광공사 연관 관광지', '전국주차장정보표준데이터')
  fs.writeFileSync(file, JSON.stringify(area) + '\n', 'utf8')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  enrich(process.argv[2]).catch((e) => { console.error(e); process.exit(1) })
}
