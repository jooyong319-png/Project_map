// AI 픽 — 동네의 '데이트로 알려진 곳'을 Gemini 일반 지식으로 떠올리게 한 뒤, 공공데이터(인허가·관광공사)와 이름으로 맞춘다.
//  · 공공데이터엔 인기 신호가 없다(네이버·카카오 수치는 약관상 저장·AI 입력 불가) → 모델이 원래 아는 지식을 쓴다.
//  · ⚠️ 가게 목록을 먼저 보여주면 그럴듯한 이름을 '안다'고 과장한다(2026-10-13 실측: 용산 1,605곳 중 373곳 '앎').
//    그래서 목록 없이 먼저 '기억으로 이름을 대게' 하고(recall), 그 이름이 실제 영업 중인 가게와 맞을 때만 채택(match).
//    → 실재(공공데이터) + 모델이 스스로 떠올림, 두 조건을 다 만족하는 곳만 남는다.
//  · 원칙 "생성은 자동, 발행은 수동": 결과는 src/data/places/<slug>.picks.json (reviewed:false) → 사람이 검수 후 커밋.
//
// 실행:  node scripts/aiPick.mjs yongsan

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MODEL = 'gemini-2.5-flash'

// 모델에게 줄 동네 설명(어느 골목인지) — 동네 추가 시 한 줄
const HINTS = {
  seongsu: '서울 성동구 성수동 (성수동 카페거리, 연무장길, 서울숲길, 아뜰리에길, 뚝섬역~성수역 일대)',
  yongsan: '서울 용산구 용산·남영 (용리단길=한강로2가, 삼각지역, 남영동, 신용산역, 숙대입구역 일대)',
  jongno3: '서울 종로구 종로3가 (익선동 한옥거리, 서순라길, 낙원동, 인사동, 종로3가역 일대)',
  itaewon: '서울 용산구 이태원·한남 (이태원역·한강진역 일대, 경리단길, 해방촌, 한남동 카페거리)',
  cheonan_buldang: '충남 천안시 서북구 불당동 (불당동 카페거리·먹자골목, 불당 신도시 일대)',
  cheonan_sinbu: '충남 천안시 동남구 신부동 (천안종합터미널·신세계백화점 주변 번화가, 신부동 먹자골목)',
}

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

async function gemini(key, prompt, schema, temperature) {
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema } }
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (r.ok) {
      const t = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text
      try { return JSON.parse(t || '[]') } catch (_) {}
    }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)))
  }
  return []
}

// 1) recall — 목록 없이 기억으로
async function recall(key, hint) {
  const prompt = [
    `${hint}에서 데이트 장소로 잘 알려진 식당·와인바·이자카야·바·카페·디저트 가게를 네 기억으로 최대 60곳 떠올려.`,
    '규칙:',
    '- 실제로 있다고 확실히 아는 가게만. 지어내거나 추측하지 마. 모르면 적게 말해도 돼.',
    '- 체인·프랜차이즈 제외. 관광지·공원 제외(가게만).',
    '- name 은 간판에 쓰인 가게 이름 그대로(지점명 빼고). type 은 식당/바/카페/디저트 중 하나.',
    '- why 는 왜 데이트로 좋은지 한국어 한 문장(네가 아는 사실만, 과장 금지).',
  ].join('\n')
  const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, type: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['name', 'type', 'why'] } }
  return gemini(key, prompt, schema, 0.3)
}

// 이름 정규화: 괄호(영문 병기 등)·공백·지점 꼬리 제거, 소문자
const norm = (s = '') => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s+(\d+호점|[가-힣a-z]+점|본관|본점)$/i, '').replace(/[^0-9a-z가-힣]/g, '')
// 괄호 속 영문명도 따로 매칭 후보로
const alts = (s = '') => [norm(s), ...[...s.matchAll(/\(([^)]+)\)/g)].map((m) => norm(m[1]))].filter((x) => x.length >= 2)

// 2) match — 실제 영업 중인 가게와 이름으로
function match(name, places) {
  const q = norm(name)
  if (q.length < 2) return null
  const exact = places.filter((p) => alts(p.name).includes(q))
  if (exact.length) return exact[0]
  if (q.length < 3) return null // 2글자는 정확히 같을 때만 (오매칭 방지)
  // "용산 쌤쌤쌤"·"미미옥신용산점"처럼 앞뒤에 지역·지점이 붙은 경우 → 포함 관계로
  const part = places.filter((p) => alts(p.name).some((a) => a.length >= 3 && (a.includes(q) || q.includes(a))))
  return part.length === 1 ? part[0] : null // 애매하면(여러 곳) 버림
}

async function main() {
  const slug = process.argv[2]
  const file = path.join(ROOT, 'src', 'data', 'places', `${slug}.json`)
  if (!slug || !fs.existsSync(file) || !HINTS[slug]) { console.error('사용법: node scripts/aiPick.mjs <slug> (buildArea 먼저, HINTS 에 동네 설명 필요)'); process.exit(1) }
  const key = loadEnv().GEMINI_API_KEY
  const area = JSON.parse(fs.readFileSync(file, 'utf8'))
  const food = area.places.filter((p) => p.kind === 'food')

  // 두 번 떠올려 합친다(한 번에 다 못 떠올림)
  const recalled = new Map()
  for (let i = 0; i < 2; i++) for (const r of await recall(key, HINTS[slug])) if (!recalled.has(norm(r.name))) recalled.set(norm(r.name), r)

  const picks = [], miss = []
  const seen = new Set()
  for (const r of recalled.values()) {
    const p = match(r.name, food)
    if (p && !seen.has(p.id)) { seen.add(p.id); picks.push({ id: p.id, name: p.name, said: r.name, type: r.type, cat: p.cat, why: r.why }) }
    else if (!p) miss.push(r.name)
  }
  const out = path.join(ROOT, 'src', 'data', 'places', `${slug}.picks.json`)
  fs.writeFileSync(out, JSON.stringify({ slug, model: MODEL, made: new Date().toISOString().slice(0, 10), reviewed: false, recalled: recalled.size, picks, unmatched: miss }, null, 1) + '\n', 'utf8')
  console.log(`${slug}: 떠올림 ${recalled.size}곳 → 영업 중 가게와 일치 ${picks.length}곳 (불일치 ${miss.length}: 폐업·다른 동네·오기억 가능)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
