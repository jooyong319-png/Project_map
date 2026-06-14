// AI 코스 짜기 — 현재 지도 영역의 '저장된 곳'(숙소·맛집·관광지)에서 하루 동선을 만든다.
//  · 핵심: AI 가 좌표를 지어내지 않게, 우리 seed DB 에 실재하는 곳만 후보로 주고
//    Gemini 는 그중에서 '고르고 · 순서 잡고 · 이유 쓰기'만 한다(환각 방지).
//  · GEMINI_API_KEY 가 없으면 휴리스틱(블로그수 + 최근접 순서)으로 폴백 — 키 없이도 동작.
// 호출:  GET /api/course?bbox=서,남,동,북
// 환경변수: GEMINI_API_KEY (없으면 폴백), GEMINI_MODEL(선택, 기본 gemini-2.5-flash)

import { seedAll } from './store.js'
import { cachedEnrich } from './gcache.js'
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

// Gemini: 후보 목록을 주고 동선(고르기+순서+이유)을 JSON 으로 받는다. theme=사용자 희망 테마(선택).
async function geminiCourse(cand, key, theme) {
  const byId = new Map()
  const flat = []
  for (const k of ['stay', 'food', 'travel']) {
    for (const p of cand[k]) {
      byId.set(p.id, p)
      flat.push({ id: p.id, name: p.name, kind: p.kind || k, region: p.region || '', tags: p.tags || [], blog: p.blog || 0 })
    }
  }
  const th = (theme || '').trim()
  const prompt = [
    '너는 한국 여행 동선을 짜는 큐레이터야. 아래 "후보" 목록(JSON)에서만 골라서 하루 코스를 만들어.',
    '규칙:',
    '- 후보에 있는 id 만 사용 (목록에 없는 곳은 절대 만들지 마).',
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

export default async function handler(req, res) {
  const bbox = (req.query?.bbox || '').toString().split(',').map(Number)
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) { res.status(200).json({ course: null, error: 'bbox 필요' }); return }
  const theme = (req.query?.theme || '').toString().slice(0, 80)
  try {
    const cand = await gatherCandidates(bbox)
    const total = cand.food.length + cand.travel.length + cand.stay.length
    if (total < 2) { res.status(200).json({ course: null, reason: 'empty' }); return }
    const key = process.env.GEMINI_API_KEY
    let course
    if (key) {
      try { course = await geminiCourse(cand, key, theme) }
      catch (_) { course = heuristicCourse(cand); if (course) course.note = 'auto' } // AI 실패 → 자동 구성
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
    res.status(200).json({ course })
  } catch (e) {
    res.status(200).json({ course: null, error: String(e) })
  }
}
