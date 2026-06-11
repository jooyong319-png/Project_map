// 네이버 블로그 검색량으로 가게 태그를 판정한다 (구글 리뷰 안 씀). 전부 '동+이름' 기준.
//  - 표시·맛집순위: "동 이름"(지역 한정) 블로그 개수 → 현실적 인기 신호
//  - 비율 태그(노포/핫플/혼밥): 따옴표로 묶은 정확매칭 "동 이름" 대비 그 안의 노포/웨이팅/혼밥 비율
//    (따옴표 없이 동+이름+태그를 넣으면 네이버가 느슨히 매칭해 비율>100%로 깨짐 → 정확매칭으로 고정)
// 네이버 검색 API: GET /v1/search/blog.json (헤더에 Client-Id/Secret). 무료(일 25,000건).

const ENDPOINT = 'https://openapi.naver.com/v1/search/blog.json'

const MIN_REGION = 30      // "동 이름" 블로그가 이보다 적으면 태그 안 매김(그 동네에서 존재감 없음)
const MIN_RATIO = 10       // 정확매칭 base 가 이보다 적으면 비율 신뢰 불가 → 비율 태그 스킵
const NOPO_PCT = 0.06      // "동 이름" 노포 비율 ≥ 6%
const HOT_PCT = 0.35       // "동 이름" 웨이팅 비율 ≥ 35% → 핫플
const SOLO_PCT = 0.08      // "동 이름" 혼밥 비율 ≥ 8%
// 맛집 = '그 지역 내 (동+이름) 블로그 상위 30%'. 단 중앙값의 OUTLIER배 초과는 일반어 충돌로 제외.
const MATJIP_TOP_PCT = 0.3
const MATJIP_FLOOR = 500 // 동네 상위 30%여도 블로그가 이보다 적으면 맛집 아님(작은 스캔 방어)
const OUTLIER = 10
// 블로그 수 배열 → { cutoff, cap }. cap = 중앙값×OUTLIER(일반어 충돌 컷). 상위 30% & cap 이하가 맛집.
export function matjipCutoff(blogs) {
  const s = blogs.filter((b) => b > 0).sort((a, b) => b - a)
  if (!s.length) return { cutoff: Infinity, cap: Infinity }
  const median = s[Math.floor(s.length / 2)] || 1
  const cap = Math.max(5000, median * OUTLIER)
  const valid = s.filter((b) => b <= cap)
  const idx = Math.max(0, Math.ceil(valid.length * MATJIP_TOP_PCT) - 1)
  return { cutoff: Math.max(MATJIP_FLOOR, valid[idx] ?? Infinity), cap }
}
// 맛집 자격: 컷오프 이상 & 일반어 컷(cap) 이하
export function isMatjip(blog, stats) { return blog >= stats.cutoff && blog <= stats.cap }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 가게명 정규화: 지점/본점/직영점/N호점 꼬리 제거 (블로그 검색 매칭률↑)
export function normName(n = '') {
  return n.replace(/\s*(\d+호점|[가-힣]+점|본관)$/, '').trim() || n
}

// 지번주소에서 동/읍/면 추출 ("서울 강남구 역삼동 718" → "역삼동")
export function dongOf(addr = '') {
  const m = addr.match(/([가-힣]+[0-9]*(?:동|읍|면))(?:\s|$)/)
  return m ? m[1] : ''
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

// 가게 하나의 태그 판정. area = 동 이름. { tags, blog, ok }  — 전부 '동+이름' 기준
export async function naverTags(name, area, id, secret) {
  if (!id || !secret) return { tags: [], blog: 0, ok: false }
  const n = normName(name)
  const anchor = area ? `"${area} ${n}"` : `"${n}"` // 정확매칭 앵커(동+이름)
  // 표시·맛집용 '동 이름'(느슨, 큰 수) + 비율 분모용 정확매칭(작지만 정확)
  const [regionBase, qBase] = await Promise.all([
    area ? totalCount(`${area} ${n}`, id, secret) : totalCount(anchor, id, secret),
    totalCount(anchor, id, secret),
  ])
  if (regionBase < 0 && qBase < 0) return { tags: [], blog: 0, ok: false } // API 실패
  const blog = regionBase > 0 ? regionBase : Math.max(qBase, 0)
  if (blog < MIN_REGION) return { tags: [], blog, ok: true } // 그 동네 존재감 부족 → 태그 없음
  const tags = []
  if (qBase >= MIN_RATIO) {
    const [nopo, wait, solo] = await Promise.all([
      totalCount(`${anchor} 노포`, id, secret),
      totalCount(`${anchor} 웨이팅`, id, secret),
      totalCount(`${anchor} 혼밥`, id, secret),
    ])
    if (nopo > 0 && nopo / qBase >= NOPO_PCT) tags.push('노포')
    if (wait > 0 && wait / qBase >= HOT_PCT) tags.push('핫플')
    if (solo > 0 && solo / qBase >= SOLO_PCT) tags.push('혼밥')
  }
  // 맛집은 호출하는 쪽(배치)에서 matjipCutoff(지역 상대순위)로 부여
  return { tags, blog, ok: true }
}

export const ALL_TAGS = ['맛집', '노포', '혼밥', '핫플']
export const TAG_LABEL = { 맛집: '블로그에서 인기', 노포: '오래된 가게', 혼밥: '혼밥 친화', 핫플: 'SNS에서 핫한' }
