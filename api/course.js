// AI 코스 짜기 — 현재 지도 영역의 '저장된 곳'(숙소·맛집·관광지)에서 하루 동선을 만든다.
//  · 핵심: AI 가 좌표를 지어내지 않게, 우리 seed DB 에 실재하는 곳만 후보로 주고
//    Gemini 는 그중에서 '고르고 · 순서 잡고 · 이유 쓰기'만 한다(환각 방지).
//  · GEMINI_API_KEY 가 없으면 휴리스틱(블로그수 + 최근접 순서)으로 폴백 — 키 없이도 동작.
// 호출:  GET /api/course?bbox=서,남,동,북
// 환경변수: GEMINI_API_KEY (없으면 폴백), GEMINI_MODEL(선택, 기본 gemini-2.5-flash)

import { seedAll } from '../lib/store.js'
import { cachedEnrich } from '../lib/gcache.js'
import { enrichWithGoogle } from './kakao.js'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const inBox = (p, w, s, e, n) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n
const d2 = (a, b) => { const dx = a.lng - b.lng, dy = a.lat - b.lat; return dx * dx + dy * dy }
const topBy = (list, n) => [...list].sort((a, b) => (b.blog || 0) - (a.blog || 0)).slice(0, n)

// 시작점에서 가까운 순으로 순서 잡기(최근접 이웃) — 동선이 안 꼬이게
function nearestRoute(start, places) {
  const left = [...places]
  const route = []
  let cur = start
  while (left.length) {
    let bi = 0, bd = Infinity
    for (let i = 0; i < left.length; i++) { const dd = d2(cur, left[i]); if (dd < bd) { bd = dd; bi = i } }
    cur = left.splice(bi, 1)[0]
    route.push(cur)
  }
  return route
}

// 영역 안 + 종류별 인기 상위 후보를 모은다
async function gatherCandidates(bbox) {
  const [w, s, e, n] = bbox
  const out = {}
  for (const k of ['food', 'travel', 'stay']) {
    const all = await seedAll(k)
    out[k] = topBy(all.filter((p) => inBox(p, w, s, e, n)), 12)
  }
  return out
}

// POST 바디 읽기 (Vercel=req.body 파싱됨 / 로컬 vite=스트림 직접 읽기)
async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  return await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

// 키 없을 때 폴백: 블로그수 상위로 뽑고 최근접 순서로 묶는다
function heuristicCourse(cand) {
  const stay = cand.stay[0]
  const picked = [...topBy(cand.food, 3), ...topBy(cand.travel, 2)]
  if (!stay && !picked.length) return null
  const start = stay || picked[0]
  const ordered = nearestRoute(start, picked.filter((p) => p !== start))
  const seq = stay ? [stay, ...ordered] : ordered
  const stops = seq.map((p, i) => ({
    ...p, order: i + 1,
    reason: p.kind === 'stay' ? '오늘의 베이스캠프 — 짐 풀고 출발하기 좋아요'
      : p.kind === 'travel' ? '근처에서 둘러보기 좋은 명소'
      : '블로그에서 자주 언급되는 인기 맛집',
  }))
  return { title: '하루 추천 코스', summary: `이 지역 인기 ${stops.length}곳을 가까운 순서로 묶었어요.`, stops, by: 'auto' }
}

// Gemini: 후보 목록을 주고 동선(고르기+순서+이유)을 JSON 으로 받는다. theme=테마, cluster=흩어진 후보를 가까운 것끼리.
async function geminiCourse(cand, key, theme, cluster = false) {
  const byId = new Map()
  const flat = []
  for (const k of ['stay', 'food', 'travel']) {
    for (const p of cand[k]) {
      byId.set(p.id, p)
      flat.push({ id: p.id, name: p.name, kind: p.kind || k, region: p.region || '', tags: p.tags || [], blog: p.blog || 0, fav: !!p.fav })
    }
  }
  const hasFav = flat.some((f) => f.fav)
  const th = (theme || '').trim()
  const prompt = [
    '너는 한국 여행 동선을 짜는 큐레이터야. 아래 "후보" 목록(JSON)에서만 골라서 하루 코스를 만들어.',
    '규칙:',
    '- 후보에 있는 id 만 사용 (목록에 없는 곳은 절대 만들지 마).',
    cluster ? '- 후보가 여러 지역에 흩어져 있을 수 있어. region 을 보고 "하루에 다닐 수 있는 가까운 곳들"로만 골라(멀리 떨어진 곳은 제외).' : '',
    hasFav ? '- fav:true 는 사용자가 즐겨찾기한 곳이야. 동선에 맞으면 적극적으로 우선 포함해줘.' : '',
    '- 숙소(kind=stay)가 있으면 1곳을 베이스캠프로 맨 처음에 넣어. 없으면 생략.',
    '- 맛집(kind=food) 2~3곳, 관광지(kind=travel) 2곳 정도를 섞어 자연스러운 하루 순서로 배치(점심→구경→저녁 느낌).',
    '- blog(블로그 언급수)와 tags 를 인기/특징 근거로 참고해.',
    '- 각 stop 의 reason 은 한국어 한 문장, 친근하고 구체적으로.',
    '- title 은 이 동선을 한 줄로 표현(예: "성수 감성 한 바퀴"), summary 는 한 문장 소개.',
    th ? `- 사용자가 원하는 테마: "${th}". 이 테마 분위기에 맞게 장소를 고르고, 순서·이유·제목에도 테마를 자연스럽게 반영해.` : '',
    '후보:',
    JSON.stringify(flat),
  ].filter(Boolean).join('\n')

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
          stops: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { id: { type: 'STRING' }, reason: { type: 'STRING' } },
              required: ['id', 'reason'],
            },
          },
        },
        required: ['title', 'summary', 'stops'],
      },
    },
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const d = await r.json()
  const txt = d.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) throw new Error('gemini 빈 응답')
  const parsed = JSON.parse(txt)
  // id → 실재하는 우리 데이터(좌표 포함)로 복원. 모르는 id 는 버림.
  const stops = (parsed.stops || [])
    .map((s) => { const p = byId.get(s.id); return p ? { ...p, reason: s.reason } : null })
    .filter(Boolean)
    .map((p, i) => ({ ...p, order: i + 1 }))
  if (!stops.length) throw new Error('gemini 가 후보를 못 골랐음')
  return { title: parsed.title || '하루 추천 코스', summary: parsed.summary || '', stops, by: 'ai' }
}

// ===== 구간별 이동수단(차/대중교통/도보) =====
function haversine(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
// 도보: 직선거리×1.3 우회보정 / 75m·분(=4.5km/h)
function walkLeg(a, b) {
  const d = haversine(a, b) * 1.3
  return { min: Math.max(1, Math.round(d / 75)), dist: Math.round(d) }
}
// 차: 카카오모빌리티 자동차 길찾기 (기존 KAKAO_REST_KEY)
async function carLeg(a, b, kkey) {
  if (!kkey) return null
  try {
    const r = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?origin=${a.lng},${a.lat}&destination=${b.lng},${b.lat}&priority=RECOMMEND`, { headers: { Authorization: `KakaoAK ${kkey}` } })
    if (!r.ok) return null
    const s = (await r.json()).routes?.[0]?.summary
    return s ? { min: Math.max(1, Math.round(s.duration / 60)), dist: s.distance } : null
  } catch (_) { return null }
}
// 대중교통: ODsay (버스/지하철 번호 포함). ODSAY_API_KEY 필요(없으면 생략)
async function transitLeg(a, b, okey) {
  if (!okey) return null
  try {
    const r = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?SX=${a.lng}&SY=${a.lat}&EX=${b.lng}&EY=${b.lat}&apiKey=${encodeURIComponent(okey)}`)
    if (!r.ok) return null
    const path = (await r.json()).result?.path?.[0]
    if (!path?.info) return null
    const buses = [], subways = []
    for (const sp of path.subPath || []) {
      if (sp.trafficType === 2) for (const l of sp.lane || []) if (l.busNo) buses.push(l.busNo)
      else if (sp.trafficType === 1) for (const l of sp.lane || []) if (l.name) subways.push(l.name)
    }
    return { min: Math.round(path.info.totalTime), buses: [...new Set(buses)], subways: [...new Set(subways)] }
  } catch (_) { return null }
}
// 코스 stops 사이(1→2, 2→3 …) 구간별 이동수단을 계산
async function buildLegs(stops, kkey, okey) {
  const pairs = []
  for (let i = 0; i < stops.length - 1; i++) pairs.push([stops[i], stops[i + 1]])
  return Promise.all(pairs.map(async ([a, b]) => {
    const [car, transit] = await Promise.all([carLeg(a, b, kkey), transitLeg(a, b, okey)])
    return { car, transit, walk: walkLeg(a, b) }
  }))
}

// ===== 숙박 어필리에이트 (목표 2: 코스 근처 숙소 예약 → 수수료) =====
// 코스 중심 좌표로 OTA 예약 검색 딥링크를 만든다. 제휴사 무관: env STAY_AFF_LINK 에
// 제휴사가 준 링크 형식을 넣으면 {lat}{lng}{area}{checkin}{checkout} 를 채워준다.
//  예) 부킹: https://www.booking.com/searchresults.html?aid=YOUR_AID&latitude={lat}&longitude={lng}
//  STAY_AFF_LINK 미설정 시 숙박 블록 생략(제휴 승인 전엔 자동 비활성).
function buildLodging(stops, area) {
  const tmpl = process.env.STAY_AFF_LINK
  const pts = (stops || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (!tmpl || !pts.length) return null
  const lat = (pts.reduce((s, p) => s + p.lat, 0) / pts.length).toFixed(5)
  const lng = (pts.reduce((s, p) => s + p.lng, 0) / pts.length).toFixed(5)
  const url = tmpl
    .replace(/\{lat\}/g, lat).replace(/\{lng\}/g, lng)
    .replace(/\{area\}/g, encodeURIComponent(area || ''))
    .replace(/\{checkin\}/g, '').replace(/\{checkout\}/g, '')
  return { lat: +lat, lng: +lng, url, label: '이 코스 근처 숙소 예약하기' }
}

// 좌표 배열 파싱 (문자열 "w,s,e,n" → [.. ] 또는 null)
function parseBbox(v) {
  const a = (v || '').toString().split(',').map(Number)
  return a.length === 4 && a.every(Number.isFinite) ? a : null
}

export default async function handler(req, res) {
  let theme = (req.query?.theme || '').toString().slice(0, 80)
  let bbox = parseBbox(req.query?.bbox)
  let favs = []
  try {
    // POST = 즐겨찾기 참고. body 에 bbox(선택)+candidates(저장목록)
    if (req.method === 'POST') {
      const b = await readBody(req)
      theme = (b.theme || theme || '').toString().slice(0, 80)
      bbox = bbox || parseBbox(b.bbox)
      favs = (Array.isArray(b.candidates) ? b.candidates : []).filter((p) => p?.lat != null && p?.lng != null).slice(0, 60)
    }
    if (!bbox && !favs.length) { res.status(200).json({ course: null, error: 'bbox 필요' }); return }

    // 지역 seed 후보
    let cand = bbox ? await gatherCandidates(bbox) : { food: [], travel: [], stay: [] }

    // 즐겨찾기 합치기: bbox 있으면 그 주변(±0.05°≈5km)만, 없으면 전부. 중복은 fav 표시만.
    let cluster = false
    if (favs.length) {
      const idx = new Map()
      for (const k of ['food', 'travel', 'stay']) for (const it of cand[k]) idx.set(it.id, it)
      const pad = 0.05
      const within = bbox ? (p) => p.lng >= bbox[0] - pad && p.lng <= bbox[2] + pad && p.lat >= bbox[1] - pad && p.lat <= bbox[3] + pad : () => true
      let added = 0
      for (const p of favs) {
        if (!within(p)) continue
        const ex = idx.get(p.id)
        if (ex) { ex.fav = true; continue }
        const k = ['food', 'travel', 'stay'].includes(p.kind) ? p.kind : 'food'
        const it = { ...p, fav: true }
        cand[k].push(it); idx.set(p.id, it); added++
      }
      cluster = true // 즐겨찾기 기반 → 흩어진 후보를 가까운 것끼리 묶게(근처 seed 포함)
    }

    const total = cand.food.length + cand.travel.length + cand.stay.length
    if (total < 2) { res.status(200).json({ course: null, reason: 'empty' }); return }
    const key = process.env.GEMINI_API_KEY
    let course
    if (key) {
      // 일시적 실패(혼잡/타임아웃) 대비 최대 3회 재시도 후에만 휴리스틱 폴백
      for (let i = 0; i < 3 && !course; i++) {
        try { course = await geminiCourse(cand, key, theme, cluster) }
        catch (_) { if (i < 2) await new Promise((r) => setTimeout(r, 400 * (i + 1))) }
      }
      if (!course) { course = heuristicCourse(cand); if (course) course.note = 'auto' } // 3회 다 실패 → 자동 구성
    } else {
      course = heuristicCourse(cand)
    }
    if (!course) { res.status(200).json({ course: null, reason: 'empty' }); return }
    // 코스 항목에 구글 평점·사진 보강(캐시 우선, 14일 지난 것만 재호출) + 상세연결용 source/gid
    if (course.stops?.length) {
      course.stops = course.stops.map((s) => ({ source: 'kakao', ...s }))
      const gkey = process.env.GOOGLE_PLACES_API_KEY
      if (gkey) course.stops = await cachedEnrich(course.stops, course.stops.length, (it) => enrichWithGoogle(it, gkey))
    }
    // 구간별 이동시간(차/대중교통/도보)
    if (course.stops?.length > 1) {
      course.legs = await buildLegs(course.stops, process.env.KAKAO_REST_KEY, process.env.ODSAY_API_KEY)
    }
    // 숙박 어필리에이트 — 코스 근처 숙소 예약 링크(제휴 승인+STAY_AFF_LINK 설정 시 활성)
    const lodging = buildLodging(course.stops, course.title)
    if (lodging) course.lodging = lodging
    res.status(200).json({ course })
  } catch (e) {
    res.status(200).json({ course: null, error: String(e) })
  }
}
