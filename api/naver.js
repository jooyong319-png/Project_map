// 네이버 블로그 검색량으로 가게 태그를 판정한다 (구글 리뷰 안 씀).
//  - 블로그 개수(base)        → 인기(맛집) 신호
//  - "이름 노포" 비율          → 노포
//  - "이름 웨이팅" 비율        → 핫플(SNS 핫)
//  - "이름 혼밥" 비율          → 혼밥
// 네이버 검색 API: GET /v1/search/blog.json (헤더에 Client-Id/Secret). 무료(일 25,000건).

const ENDPOINT = 'https://openapi.naver.com/v1/search/blog.json'

const MIN_BUZZ = 200       // "이름 맛집" 블로그가 이보다 적으면 태그 안 매김(표본 부족)
const NOPO_PCT = 0.05      // "노포" 비율 ≥ 5%
const HOT_PCT = 0.35       // "웨이팅" 비율 ≥ 35% → 핫플
const SOLO_PCT = 0.06      // "혼밥" 비율 ≥ 6%
// 맛집 = 절대값이 아니라 '그 지역 내 블로그 상위 30%'(단 최소 버즈 이상). 상한 초과는 일반어 충돌로 제외.
const MATJIP_TOP_PCT = 0.3
const MATJIP_FLOOR = 1000
export const MATJIP_CEILING = 500000 // "이름 맛집"이 이보다 크면 일반어 충돌(예: 정돈) → 맛집 제외
// 블로그 수 배열 → 맛집 컷오프(상위 PCT 값, 단 FLOOR 이상). 상한 초과값은 무시하고 계산.
export function matjipCutoff(blogs) {
  const s = blogs.filter((b) => b > 0 && b <= MATJIP_CEILING).sort((a, b) => b - a)
  if (!s.length) return Infinity
  const idx = Math.max(0, Math.ceil(s.length * MATJIP_TOP_PCT) - 1)
  return Math.max(MATJIP_FLOOR, s[idx])
}
// 맛집 자격: 컷오프 이상 & 상한 이하
export function isMatjip(blog, cutoff) { return blog >= cutoff && blog <= MATJIP_CEILING }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 가게명 정규화: 지점/본점/직영점/N호점 꼬리 제거 (블로그 검색 매칭률↑)
export function normName(n = '') {
  return n.replace(/\s*(\d+호점|[가-힣]+점|본관)$/, '').trim() || n
}

async function totalCount(q, id, secret) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${ENDPOINT}?query=${encodeURIComponent(q)}&display=1`, {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      })
      if (r.status === 200) { const d = await r.json(); return d.total || 0 }
      if (r.status === 429) { await sleep(300 + i * 200); continue } // 레이트리밋 → 쉬고 재시도
      return -1
    } catch (_) { await sleep(200) }
  }
  return -1
}

// 가게 하나의 태그 판정. { tags, blog, ok }
export async function naverTags(name, id, secret) {
  if (!id || !secret) return { tags: [], blog: 0, ok: false }
  const n = normName(name)
  const base = await totalCount(`${n} 맛집`, id, secret) // 맥락어 '맛집'으로 일반어 충돌 완화
  if (base < 0) return { tags: [], blog: 0, ok: false } // API 실패
  if (base < MIN_BUZZ) return { tags: [], blog: base, ok: true } // 버즈 부족 → 태그 없음
  const [nopo, wait, solo] = await Promise.all([
    totalCount(`${n} 노포`, id, secret),
    totalCount(`${n} 웨이팅`, id, secret),
    totalCount(`${n} 혼밥`, id, secret),
  ])
  // 맛집은 여기서 안 매김 — 지역 내 상대순위라 호출하는 쪽(배치)에서 matjipCutoff 로 부여
  const tags = []
  if (nopo > 0 && nopo / base >= NOPO_PCT) tags.push('노포')
  if (wait > 0 && wait / base >= HOT_PCT) tags.push('핫플')
  if (solo > 0 && solo / base >= SOLO_PCT) tags.push('혼밥')
  return { tags, blog: base, ok: true }
}

export const ALL_TAGS = ['맛집', '노포', '혼밥', '핫플']
export const TAG_LABEL = { 맛집: '블로그에서 인기', 노포: '오래된 가게', 혼밥: '혼밥 친화', 핫플: 'SNS에서 핫한' }
