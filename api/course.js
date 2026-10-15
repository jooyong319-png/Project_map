// AI 코스 짜기 — 현재 지도 영역의 '저장된 곳'(숙소·맛집·관광지)에서 하루 동선을 만든다.
//  · 핵심: AI 가 좌표를 지어내지 않게, 동네 데이터(공공데이터, lib/areas.js)에 실재하는 곳만 후보로 주고
//    Gemini 는 그중에서 '고르고 · 순서 잡고 · 이유 쓰기'만 한다(환각 방지).
//  · GEMINI_API_KEY 가 없으면 휴리스틱(영업 연수·태그 + 최근접 순서)으로 폴백 — 키 없이도 동작.
// 호출:  GET /api/course?bbox=서,남,동,북
// 환경변수: GEMINI_API_KEY (없으면 폴백), GEMINI_MODEL(선택, 기본 gemini-2.5-flash)

import { placesIn, parkingNear } from '../lib/areas.js'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

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

// 영역 안 후보를 모은다 — 정적 동네 데이터(공공데이터). 준비 안 된 동네는 빈 후보
// 중심 관광지 점수 — 데이트 적합도(fit 0~5, AI 상식 판정)가 가장 크고, 티맵 연관 인기(pop)·관광공사 소개가 보탠다.
//  fit 0(체육시설·기념비·음식 골목 등)은 중심 후보에서 제외. 사람이 동네마다 고르지 않게 (scripts/enrichArea.mjs)
//  저녁 코스는 밤 적합도(night) 60% + 낮 적합도(fit) 40% — 실내 전시·궁궐처럼 밤에 닫는 곳이 중심이 되지 않게.
//  night 만 쓰지 않는 이유: 항목이 많은 동네(성수 80곳)에선 모델이 매장까지 night 5를 주는 등 과대평가 → fit 으로 눌러 준다
const anchorScore = (p, evening = false) => (evening ? (p.night ?? 2) * 6 + (p.fit ?? 2) * 4 : (p.fit ?? 2) * 10) + Math.min(p.pop || 0, 30) / 3 + (curated(p) ? 2 : 0)
const anchorOk = (p, evening) => p.fit !== 0 && !(evening && p.night === 0)
// 이용시간에 적힌 마감이 19시 전이면 저녁엔 제외("11:00~18:00" 등). 시간 정보가 없으면 판단하지 않는다
const closesEarly = (p) => {
  const ends = [...String(p.hours?.use || '').matchAll(/~\s*(\d{1,2}):\d{2}/g)].map((m) => +m[1])
  const last = ends.length ? Math.max(...ends) : null
  return last !== null && last >= 6 && last < 19
}
const ANCHOR_RADIUS = 1000 // 중심 관광지에서 이 거리(m) 안의 맛집·카페만

// 예상 시각(time "HH:MM")이 이용시간 안인지 — true/false, 시간 정보가 없거나 못 읽으면 null
//  "11:30~21:00", "매일 11:00 - 21:00", "17:00~02:00"(자정 넘김) 처럼 적힌 구간을 모두 본다
const toMin = (h, m) => (+h) * 60 + (+m)
function openAt(use, time) {
  const t = /^(\d{1,2}):(\d{2})$/.exec(time || '')
  if (!t || !use) return null
  const ranges = [...String(use).matchAll(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g)]
  if (!ranges.length) return null
  const at = toMin(t[1], t[2])
  return ranges.some((m) => {
    const a = toMin(m[1], m[2]); let b = toMin(m[3], m[4])
    if (b <= a) b += 24 * 60 // 자정 넘김
    return (at >= a && at <= b) || (at + 24 * 60 >= a && at + 24 * 60 <= b)
  })
}
// 시각 채우기 + 검사: AI 가 빠뜨렸거나 폴백 코스면 시작 시각부터 90분 간격
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
function fillTimes(stops, evening, startMin = null) {
  let cur = startMin ?? (evening ? toMin(18, 30) : toMin(12, 0))
  for (const s of stops || []) {
    if (!s.time) s.time = `${String(Math.floor(cur / 60) % 24).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`
    const [h, m] = s.time.split(':'); cur = toMin(h, m) + 90
    s.timeOk = openAt(s.hours?.use, s.time)
  }
}

async function gatherCandidates(bbox, evening = false) {
  const local = placesIn(bbox).map((p) => ({ ...p, region: p.region || p.addr || '' })).filter((p) => !(evening && closesEarly(p)))
  if (local.length) {
    // ① 중심 관광지: 최고점대에서 무작위(다시 짜면 다른 중심) → ② 그 1km 안에서 맛집·카페·다른 구경거리
    const sights = local.filter((p) => p.kind === 'travel' && anchorOk(p, evening)).sort((a, b) => anchorScore(b, evening) - anchorScore(a, evening))
    // 1등 근처 점수대(-5점 이내)에서 고르게 무작위 — 동점이 많을 때 앞쪽만 뽑히지 않게
    const best = sights.length ? anchorScore(sights[0], evening) : 0
    const anchor = sights.length ? shuffle(sights.filter((p) => anchorScore(p, evening) >= best - 5))[0] : null
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
  return { food: [], travel: [], stay: [] } // 데이터가 준비되지 않은 동네
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

// Gemini: 후보 목록을 주고 동선(고르기+순서+이유)을 JSON 으로 받는다. theme=테마, from=출발점(역)
// fixed = { label, time, start } — 사용자가 정해 둔 일정(그 시각에 그곳). 코스는 그 전을 채우고 근처에서 끝난다
async function geminiCourse(cand, key, theme, from = null, evening = isEvening(theme), fixed = null) {
  const anchor = cand.anchor
  const byId = new Map()
  const flat = []
  for (const k of ['stay', 'food', 'travel']) {
    for (const p of cand[k]) {
      byId.set(p.id, p)
      flat.push({ id: p.id, name: p.name, kind: p.kind || k, region: p.region || '', cat: p.cat || '', tags: p.tags || [], since: sinceYear(p) || undefined, menu: p.menu || p.price || undefined, use: p.hours?.use || undefined, rest: p.hours?.rest || undefined, note: p.pick || undefined, toFixed: fixed ? Math.round(haversine(p, fixed)) : undefined })
    }
  }
  const th = (theme || '').trim()
  const prompt = [
    '너는 한국 여행 동선을 짜는 큐레이터야. 아래 "후보" 목록(JSON)에서만 골라서 하루 코스를 만들어.',
    '규칙:',
    '- 후보에 있는 id 만 사용 (목록에 없는 곳은 절대 만들지 마).',
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
    fixed ? `- 중요: 사용자는 ${fixed.time}에 "${fixed.label}"에 가기로 이미 정해 뒀어(후보 목록에 없는 곳, 코스에 넣지 마). 코스는 ${fixed.start}쯤 시작해서 ${fixed.time} 10분 전까지 끝나야 하고, 마지막 장소는 toFixed(그곳까지 거리, m)가 700 이하인 후보로 골라(꼭 지켜). 그곳이 식당·술집이면 앞 코스에선 식사 대신 카페·디저트·구경·산책 위주로 구성해. 2~4곳. summary 에 "${fixed.time} ${fixed.label} 가기 전"을 자연스럽게 넣어.` : '',
    `- 각 stop 에 time(도착 예상 시각, 24시간제 "HH:MM")을 넣어. ${fixed ? `${fixed.start} 전후` : evening ? '18:30 전후' : '12:00 전후'}에 시작하고, 식사·카페는 약 1시간, 구경은 1~1.5시간 머문다고 보고 이동 시간을 더해. use(이용시간)가 있으면 그 안에 들어오게 순서와 시각을 맞춰.`,
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
              properties: { id: { type: 'STRING' }, reason: { type: 'STRING' }, time: { type: 'STRING' } },
              required: ['id', 'reason', 'time'],
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
    .map((s) => { const p = byId.get(s.id); return p ? { ...p, reason: s.reason, time: /^\d{1,2}:\d{2}$/.test(s.time || '') ? s.time.padStart(5, '0') : undefined } : null })
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
        const pubNames = new Set(pub.map((p) => p.name.replace(/\s+/g, '')))
        priv = ((await r.json()).documents || [])
          // 공영은 위에서(요금 있음), "○○ 전용주차장"은 손님·입주자만이라 제외
          .filter((d) => !/공영|전용/.test(d.place_name) && !pubNames.has(d.place_name.replace(/\s+/g, '')))
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

// 좌표 배열 파싱 (문자열 "w,s,e,n" → [.. ] 또는 null)
function parseBbox(v) {
  const a = (v || '').toString().split(',').map(Number)
  return a.length === 4 && a.every(Number.isFinite) ? a : null
}

// ===== 호출 제한 (Gemini 비용 보호) =====
//  화면의 '기기당 하루 5회'는 브라우저 저장소라 API 를 직접 부르면 못 막는다 → 서버에서도 센다.
//  ⚠️ DB 가 없어 서버 메모리 기준: Vercel 은 인스턴스가 여러 개·재시작되므로 '대부분의 남용'만 막는다.
//     확실한 상한은 Gemini API 키의 사용량·결제 한도(콘솔)로 건다 (wiki/브리프.md 🛑 항목).
const HOUR = 60 * 60 * 1000
const PER_IP_HOUR = 10   // IP 하나가 1시간에
const ALL_HOUR = 300     // 이 인스턴스 전체가 1시간에
const hits = new Map()   // ip → [시각…]
let allHits = []
function ipOf(req) {
  const h = req.headers || {}
  return String(h['x-forwarded-for'] || h['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
}
function overLimit(ip) {
  const now = Date.now()
  allHits = allHits.filter((t) => now - t < HOUR)
  const mine = (hits.get(ip) || []).filter((t) => now - t < HOUR)
  if (mine.length >= PER_IP_HOUR || allHits.length >= ALL_HOUR) { hits.set(ip, mine); return true }
  mine.push(now); allHits.push(now); hits.set(ip, mine)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR)) hits.delete(k) // 메모리 정리
  return false
}

export default async function handler(req, res) {
  if (overLimit(ipOf(req))) {
    res.status(429).json({ course: null, error: 'rate', reason: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' })
    return
  }
  const theme = (req.query?.theme || '').toString().slice(0, 80)
  // 출발점(역·장소) — 런처에서 역을 고르면 옴
  const fx = Number(req.query?.fx), fy = Number(req.query?.fy)
  const car = req.query?.car === '1'
  const from = req.query?.from && Number.isFinite(fx) && Number.isFinite(fy) ? { label: req.query.from.toString().slice(0, 40), lng: fx, lat: fy } : null
  const bbox = parseBbox(req.query?.bbox)
  // 정해 둔 일정(그 시각에 그곳) — fixed=이름, kx·ky=좌표, kt=시각 "HH:MM". 코스는 3시간 전쯤 시작해 그 근처에서 끝난다.
  //  위치는 화면이 카카오 검색으로 그 자리에서 찾은 값(저장 안 함). AI 에는 이름과 시각만 넘긴다.
  const kx = Number(req.query?.kx), ky = Number(req.query?.ky)
  const kt = /^\d{1,2}:\d{2}$/.test(req.query?.kt || '') ? req.query.kt.padStart(5, '0') : null
  const fixedAt = req.query?.fixed && kt && Number.isFinite(kx) && Number.isFinite(ky) ? { label: req.query.fixed.toString().slice(0, 40), lng: kx, lat: ky, time: kt } : null
  const fixedStart = fixedAt ? Math.max(toMin(10, 0), toMin(...fixedAt.time.split(':')) - 180) : null
  if (fixedAt) fixedAt.start = hhmm(fixedStart)
  try {
    if (!bbox) { res.status(200).json({ course: null, error: 'bbox 필요' }); return }
    // 낮/저녁: 화면의 '언제' 버튼(time=evening) 또는 테마 글자(저녁·밤·야경…). 정해 둔 일정이 있으면 시작 시각으로
    const evening = fixedAt ? fixedStart >= toMin(17, 0) : (req.query?.time === 'evening' || isEvening(theme))
    const cand = await gatherCandidates(bbox, evening)
    const total = cand.food.length + cand.travel.length + cand.stay.length
    if (total < 2) { res.status(200).json({ course: null, reason: 'empty' }); return }
    const key = process.env.GEMINI_API_KEY
    let course
    if (key) {
      // 일시적 실패(혼잡/타임아웃) 대비 최대 3회 재시도 후에만 휴리스틱 폴백
      for (let i = 0; i < 3 && !course; i++) {
        try { course = await geminiCourse(cand, key, theme, from, evening, fixedAt) }
        catch (_) { if (i < 2) await new Promise((r) => setTimeout(r, 400 * (i + 1))) }
      }
      if (!course) { course = heuristicCourse(cand); if (course) course.note = 'auto' } // 3회 다 실패 → 자동 구성
    } else {
      course = heuristicCourse(cand)
    }
    if (!course) { res.status(200).json({ course: null, reason: 'empty' }); return }
    course.evening = evening
    // 정해 둔 일정: AI 가 '마지막은 가까운 곳'을 어기면(900m 초과) 가장 가까운 장소를 맨 뒤로 옮기고 시각은 다시 계산
    if (fixedAt && course.stops?.length > 1) {
      const dist = (s) => haversine(s, fixedAt)
      const last = course.stops[course.stops.length - 1]
      if (dist(last) > 900) {
        const near = course.stops.reduce((a, b) => (dist(b) < dist(a) ? b : a))
        if (near !== last) {
          course.stops = [...course.stops.filter((s) => s !== near), near].map((s, i) => ({ ...s, order: i + 1, time: undefined }))
          course.reordered = true
        }
      }
    }
    fillTimes(course.stops, evening, fixedStart) // 예상 시각 채우기 + 이용시간 안인지(timeOk)
    // 정해 둔 일정: 마지막 장소 → 그곳 도보, 늦지 않는지(마지막 장소에 최소 30분 머문다고 보고)
    if (fixedAt && course.stops?.length) {
      const last = course.stops[course.stops.length - 1]
      const walk = walkLeg(last, fixedAt)
      const [h, m] = (last.time || '00:00').split(':')
      course.fixed = { label: fixedAt.label, time: fixedAt.time, walk, late: toMin(h, m) + 30 + walk.min > toMin(...fixedAt.time.split(':')) }
    }
    // 중심 관광지 · 주차장(🚗 차로 가요)
    if (cand.anchor) course.anchor = { id: cand.anchor.id, name: cand.anchor.name }
    if (car) course.parking = await parkingFor(cand.anchor || course.stops?.[0], process.env.KAKAO_REST_KEY)
    // 출발점 → 첫 장소 도보
    if (from && course.stops?.length) course.start = { label: from.label, walk: walkLeg(from, course.stops[0]) }
    // 구간별 이동시간(차/대중교통/도보)
    if (course.stops?.length > 1) course.legs = await buildLegs(course.stops, process.env.KAKAO_REST_KEY, process.env.ODSAY_API_KEY)
    res.status(200).json({ course })
  } catch (e) {
    res.status(200).json({ course: null, error: String(e) })
  }
}
