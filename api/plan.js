// 한 문장 → 코스 조건 — "밤 8시에 올댓재즈 갈 건데 1시쯤 만나서 점심부터" 같은 말을 첫 화면 폼 값으로 바꾼다.
//  · AI 에 넣는 건 사용자가 직접 쓴 문장뿐(카카오·네이버 결과는 넣지 않음). 장소 이름은 화면이 카카오 검색으로 찾는다.
//  · 가벼운 모델(flash-lite) + 생각 최소 → 입력 ~460·출력 ~70토큰, 1회 약 0.5원(2026-10 요금). 코스 짜기(api/course.js)와 따로 센다.
// GET /api/plan?q=문장 → { plan: { where, start, first, fixedName, fixedTime, mood, car, wish } }
// 환경변수: GEMINI_API_KEY, GEMINI_PARSE_MODEL(선택, 기본 gemini-3.5-flash-lite)

const MODEL = process.env.GEMINI_PARSE_MODEL || 'gemini-3.5-flash-lite'
const MOODS = ['cafe', 'food', 'walk', 'art', 'hanok']

// 호출 제한 — 서버 메모리 기준(api/course.js 와 같은 방식). 해석은 싸서 넉넉히
const HOUR = 60 * 60 * 1000
const PER_IP_HOUR = 30
const hits = new Map()
function overLimit(req) {
  const h = req.headers || {}
  const ip = String(h['x-forwarded-for'] || h['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const mine = (hits.get(ip) || []).filter((t) => now - t < HOUR)
  if (mine.length >= PER_IP_HOUR) { hits.set(ip, mine); return true }
  mine.push(now); hits.set(ip, mine)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR)) hits.delete(k)
  return false
}

const HHMM = /^\d{1,2}:\d{2}$/
const time = (v) => (HHMM.test(v || '') ? v.padStart(5, '0') : '')

export function promptOf(q) {
  return [
    '데이트·나들이 계획을 말한 한 문장에서 코스 조건을 뽑아 JSON 으로만 답해. 문장에 없는 건 빈 값.',
    '- where: 만나거나 놀 동네·역·장소 이름, 문장에 쓴 그대로(예 "이태원역", "천안 불당동"). 정해 둔 가게 이름은 여기 넣지 마.',
    '- start: 만나는(코스 시작) 시각 "HH:MM" 24시간제. "1시쯤 만나서 점심" → "13:00", "오후 3시" → "15:00", "저녁 6시" → "18:00". 오전이라고 안 했으면 1~9시는 오후로.',
    '- first: 첫 순서가 "점심" | "저녁" | "카페" | "구경" 중 무엇인지. 말 안 했으면 "".',
    '- fixedName: 이미 그 시각에 가기로 정한 가게·장소 이름(예약한 식당, 공연장, 약속 장소). "7시에 노가리골목에서 친구 만나" → "노가리골목". "여기"·"거기"처럼 이름이 없으면 "".',
    '- fixedTime: 그 정해 둔 곳에 가는 시각 "HH:MM". "밤 8시" → "20:00".',
    `- mood: ${MOODS.join(' | ')} 중 하나(cafe=감성 카페, food=맛집, walk=산책, art=전시·구경, hanok=한옥·골목) 또는 "". 분위기를 직접 말했을 때만(가게 종류로 짐작하지 마).`,
    '- car: 차로 간다고 했으면 true.',
    '- wish: 위 항목으로 못 담은 요청만 짧게(예 "저녁은 가볍게", "많이 안 걷고", "2시간 정도"). 시각·첫 순서·장소·분위기를 되풀이한 말이면 반드시 "".',
    `문장: ${JSON.stringify(q)}`,
  ].join('\n')
}

export function clean(o = {}) {
  return {
    where: String(o.where || '').slice(0, 40),
    start: time(o.start),
    first: ['점심', '저녁', '카페', '구경'].includes(o.first) ? o.first : '',
    fixedName: String(o.fixedName || '').replace(/^(여기|거기|저기)$/, '').slice(0, 40),
    fixedTime: time(o.fixedTime),
    mood: MOODS.includes(o.mood) ? o.mood : '',
    car: o.car === true,
    wish: String(o.wish || '').slice(0, 80),
  }
}

export default async function handler(req, res) {
  if (overLimit(req)) { res.status(429).json({ plan: null, error: 'rate' }); return }
  const q = (req.query?.q || '').toString().trim().slice(0, 200)
  const key = process.env.GEMINI_API_KEY
  if (!q || !key) { res.status(200).json({ plan: null, error: q ? 'no key' : 'q 필요' }); return }
  const S = { type: 'STRING' }
  const body = {
    contents: [{ parts: [{ text: promptOf(q) }] }],
    generationConfig: {
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'minimal' },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { where: S, start: S, first: S, fixedName: S, fixedTime: S, mood: S, car: { type: 'BOOLEAN' }, wish: S },
        required: ['where', 'start', 'first', 'fixedName', 'fixedTime', 'mood', 'car', 'wish'],
      },
    },
  }
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`gemini ${r.status}`)
    const txt = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text
    res.status(200).json({ plan: clean(JSON.parse(txt || '{}')) })
  } catch (e) {
    res.status(200).json({ plan: null, error: String(e) })
  }
}
