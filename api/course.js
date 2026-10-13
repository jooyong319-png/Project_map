// AI 코스 짜기 — 현재 지도 영역의 '저장된 곳'(숙소·맛집·관광지)에서 하루 동선을 만든다.
//  · 핵심: AI 가 좌표를 지어내지 않게, 우리 seed DB 에 실재하는 곳만 후보로 주고
//    Gemini 는 그중에서 '고르고 · 순서 잡고 · 이유 쓰기'만 한다(환각 방지).
//  · GEMINI_API_KEY 가 없으면 휴리스틱(영업 연수·태그 + 최근접 순서)으로 폴백 — 키 없이도 동작.
// 호출:  GET /api/course?bbox=서,남,동,북
// 환경변수: GEMINI_API_KEY (없으면 폴백), GEMINI_MODEL(선택, 기본 gemini-2.5-flash)

import { seedAll } from '../lib/store.js'
import { placesIn, parkingNear } from '../lib/areas.js'
import { cachedEnrich, googleKey } from '../lib/gcache.js'
import { enrichWithGoogle } from './kakao.js'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const inBox = (p, w, s, e, n) => p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n
const d2 = (a, b) => { const dx = a.lng - b.lng, dy = a.lat - b.lat; return dx * dx + dy * dy }
// 인기 신호 = 공공데이터만 (네이버 블로그 수는 약관상 코스 후보·AI 입력에 못 씀)
//  · 영업 연수(인허가일 기준, 오래될수록 검증된 곳) + 지정·특징 태그 수
const sinceYear = (p) => (p.licensed ? parseInt(String(p.licensed).slice(0, 4), 10) || 0 : 0)
const score = (p) => (sinceYear(p) ? Math.min(new Date().getFullYear() - sinceYear(p), 50) : 0) + (p.tags?.length || 0) * 10
const topBy = (list, n) => [...list].sort((a, b) => score(b) - score(a)).slice(0, n)

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

// 같은 우선순위 안에서는 섞는다 → '다시 짜기'마다 다른 코스
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }
// 우선순위(tier) 높은 것부터, tier 안에서는 무작위로 n개
const pick = (list, tier, n) => {
  const groups = new Map()
  for (const p of list) { const t = tier(p); if (t < 0) continue; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(p) }
  return [...groups.keys()].sort((a, b) => b - a).flatMap((t) => shuffle(groups.get(t))).slice(0, n)
}
const has = (p, t) => p.tags?.includes(t)
const curated = (p) => has(p, '관광공사 소개') // 관광공사가 소개한 곳 = 이용시간·쉬는 날 정보가 있다
const titled = (p) => ['백년가게', '모범음식점', '안심식당', '착한가격', '노포'].some((t) => has(p, t)) // 공공 지정·인증·영업 연수
// 식사: AI 픽(모델이 아는 데이트 명소, 실재 확인) > 관광공사 소개 > 공공 타이틀 > 그 외(후보 제외)
const mealTier = (p) => (has(p, 'AI 픽') ? 3 : curated(p) ? 2 : titled(p) ? 1 : -1)
const cafeTier = (p) => (has(p, 'AI 픽') ? 2 : curated(p) ? 1 : 0)
// 저녁 코스 여부 — 테마에 저녁·밤·야경·퇴근
export const isEvening = (theme = '') => /저녁|밤|야경|퇴근|야간|나이트/.test(theme)
const sightTier = (p) => (p.cat === '쇼핑' ? 0 : 1) // 관광지·문화시설 > 쇼핑(플래그십·편집숍)

// 영역 안 후보를 모은다 — 정적 동네 데이터(공공데이터) 우선, 준비 안 된 동네는 DB(seed) 폴백
// 중심 관광지 점수 — 티맵 연관(pop, scripts/enrichArea.mjs) + 관광공사 소개 + 관광지·문화시설(쇼핑보다 우선)
const anchorScore = (p) => (p.pop || 0) + (curated(p) ? 5 : 0) + (p.cat === '쇼핑' ? 0 : 3)
const ANCHOR_RADIUS = 1000 // 중심 관광지에서 이 거리(m) 안의 맛집·카페만

async function gatherCandidates(bbox) {
  const local = placesIn(bbox).map((p) => ({ ...p, region: p.region || p.addr || '' }))
  if (local.length) {
    // ① 중심 관광지: 점수 상위 3곳 중 하나(다시 짜면 다른 중심) → ② 그 1km 안에서 맛집·카페·다른 구경거리
    const sights = local.filter((p) => p.kind === 'travel').sort((a, b) => anchorScore(b) - anchorScore(a))
    const anchor = sights.length ? shuffle(sights.slice(0, 3))[0] : null
    const near = anchor ? local.filter((p) => p === anchor || haversine(anchor, p) <= ANCHOR_RADIUS) : local
    const food = near.filter((p) => p.kind === 'food')
    // 같은 tier 안에선 티맵 인기(pop) 있는 곳이 먼저 오도록 tier 에 소수점 가산
    const withPop = (tier) => (p) => { const t = tier(p); return t < 0 ? t : t + Math.min(p.pop || 0, 9) / 10 }
    return {
      anchor,
      food: [...pick(food.filter((p) => p.cat !== '카페'), withPop(mealTier), 14), ...pick(food.filter((p) => p.cat === '카페'), withPop(cafeTier), 8)],
      travel: [...(anchor ? [anchor] : []), ...pick(near.filter((p) => p.kind === 'travel' && p !== anchor), sightTier, 10)],
      stay: [],
    }
  }
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

// 키 없을 때 폴백: 공공데이터 점수(영업 연수·태그) 상위로 뽑고 최근접 순서로 묶는다
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
      : '이 동네에서 오래 자리를 지킨 곳',
  }))
  return { title: '하루 추천 코스', summary: `이 지역 인기 ${stops.length}곳을 가까운 순서로 묶었어요.`, stops, by: 'auto' }
}

// Gemini: 후보 목록을 주고 동선(고르기+순서+이유)을 JSON 으로 받는다. theme=테마, cluster=흩어진 후보를 가까운 것끼리.
async function geminiCourse(cand, key, theme, cluster = false, from = null) {
  const anchor = cand.anchor
  const evening = isEvening(theme)
  const byId = new Map()
  const flat = []
  for (const k of ['stay', 'food', 'travel']) {
    for (const p of cand[k]) {
      byId.set(p.id, p)
      flat.push({ id: p.id, name: p.name, kind: p.kind || k, region: p.region || '', cat: p.cat || '', tags: p.tags || [], since: sinceYear(p) || undefined, menu: p.menu || p.price || undefined, use: p.hours?.use || undefined, rest: p.hours?.rest || undefined, note: p.pick || undefined, fav: !!p.fav })
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
    evening
      ? '- 저녁(18시 이후 시작) 코스야. 저녁 식사 1곳 → 걷기 좋은 곳·야경 1곳(있으면) → 와인바·바·이자카야·디저트 카페 중 1곳, 총 3~4곳. use(이용시간)를 보고 저녁에 문 닫는 곳(예: ~19:00 마감, 브런치·낮 카페)은 빼.'
      : '- 식사(kind=food, cat≠카페) 2곳(점심·저녁), 카페(cat=카페) 1곳, 구경(kind=travel) 2곳 정도를 섞어 자연스러운 하루 순서로 배치(점심→구경→카페→구경→저녁 느낌). 후보가 모자라면 있는 만큼.',
    '- 서로 걸어서 15분 안쪽으로 이어지게 가까운 곳끼리 골라 (region·주소 참고).',
    anchor ? `- 오늘의 중심 관광지는 "${anchor.name}"(id ${anchor.id})야. 반드시 코스에 넣고, 나머지는 그 주변으로 동선을 짜.` : '',
    from ? `- 출발점은 "${from.label}"이야. 첫 장소는 여기서 걸어서 가까운 곳으로 하고, 동선이 출발점에서 자연스럽게 이어지게 해. summary 에 출발점을 언급해.` : '',
    '- AI 픽 태그의 note 는 그 가게에 대한 참고 설명이야. 공공 타이틀(모범음식점·안심식당·착한가격·백년가게·노포)은 reason 에 자연스럽게 언급해도 돼.',
    '- 관광공사 소개 태그가 있는 곳은 이용시간이 확인된 곳이라 우선해. rest(쉬는 날)가 있으면 reason 끝에 "(○요일 휴무)"처럼 짧게 덧붙여.',
    '- since(영업 시작 연도, 오래될수록 검증된 곳)와 cat·tags 를 특징 근거로 참고해. 없는 정보(평점·후기 수 등)를 지어내지 마.',
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
// 주차장 — 공영(전국주차장정보표준데이터, 요금·운영시간) + 민영(카카오 '주차장' 실시간 검색, 저장 안 함)
async function parkingFor(at, kkey) {
  if (!at) return null
  const pub = parkingNear(at, 600).slice(0, 3).map((p) => ({ name: p.name, type: p.type || '공영', dist: Math.round(haversine(at, p)), spaces: p.spaces, fee: p.fee, hours: p.hours, lat: p.lat, lng: p.lng }))
  let priv = []
  if (kkey) {
    try {
      const r = await fetch(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PK6&x=${at.lng}&y=${at.lat}&radius=500&sort=distance&size=8`, { headers: { Authorization: `KakaoAK ${kkey}` } })
      if (r.ok) {
        const pubNames = new Set(pub.map((p) => p.name.replace(/s+/g, '')))
        priv = ((await r.json()).documents || [])
          // 공영은 위에서(요금 있음), "○○ 전용주차장"은 손님·입주자만이라 제외
          .filter((d) => !/공영|전용/.test(d.place_name) && !pubNames.has(d.place_name.replace(/s+/g, '')))
          .slice(0, 3)
          .map((d) => ({ name: d.place_name, type: '민영', dist: Number(d.distance) || null, url: d.place_url, lat: Number(d.y), lng: Number(d.x) }))
      }
    } catch (_) {}
  }
  return [...pub, ...priv]
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
  // 출발점(역·장소) — 런처에서 역을 고르면 옴
  const fx = Number(req.query?.fx), fy = Number(req.query?.fy)
  const car = req.query?.car === '1'
  const from = req.query?.from && Number.isFinite(fx) && Number.isFinite(fy) ? { label: req.query.from.toString().slice(0, 40), lng: fx, lat: fy } : null
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
        try { course = await geminiCourse(cand, key, theme, cluster, from) }
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
      const gkey = googleKey()
      if (gkey) course.stops = await cachedEnrich(course.stops, course.stops.length, (it) => enrichWithGoogle(it, gkey))
    }
    // 중심 관광지 · 주차장(🚗 차로 가요)
    if (cand.anchor) course.anchor = { id: cand.anchor.id, name: cand.anchor.name }
    if (car) course.parking = await parkingFor(cand.anchor || course.stops?.[0], process.env.KAKAO_REST_KEY)
    // 출발점 → 첫 장소 도보
    if (from && course.stops?.length) course.start = { label: from.label, walk: walkLeg(from, course.stops[0]) }
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
