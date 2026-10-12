// 네이버 블로그 검색 — 상세 화면 '실시간 표시' 전용.
// ⚠️ 네이버 검색 API 개별 특약(2026-09-07 시행) 때문에 아래를 지킨다 (wiki/브리프.md "약관 확인 결과"):
//   · 결과(가공·파생물 포함)를 DB·파일에 저장하지 않는다. CDN 캐시도 금지 → 응답은 private, 짧게.
//   · AI(Gemini) 입력에 넣지 않는다. 코스 후보 선정에도 쓰지 않는다.
//   · 출처(네이버)와 원문 링크를 함께 보여준다. 이 값이 보이는 화면엔 광고를 붙이지 않는다.

const ENDPOINT = 'https://openapi.naver.com/v1/search/blog.json'

// 가게명 정규화: 지점/본점/직영점/N호점 꼬리 제거 (검색 매칭률↑)
export function normName(n = '') {
  return n.replace(/\s*(\d+호점|[가-힣]+점|본관)$/, '').trim() || n
}

// 지번주소에서 동/읍/면 추출 ("서울 강남구 역삼동 718" → "역삼동")
export function dongOf(addr = '') {
  const m = addr.match(/([가-힣]+[0-9]*(?:동|읍|면))(?:\s|$)/)
  return m ? m[1] : ''
}

// "동 이름" 검색어 — 화면의 '네이버에서 보기' 링크와 같은 검색어를 쓴다
export function blogQuery(name, addr) {
  const dong = dongOf(addr || '')
  return dong ? `${dong} ${normName(name)}` : normName(name)
}

// 블로그 글 수(실시간 1회 호출). 실패 시 -1.
export async function blogCount(query, id, secret) {
  if (!id || !secret || !query) return -1
  try {
    const r = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}&display=1`, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
    })
    if (!r.ok) return -1
    return (await r.json()).total || 0
  } catch (_) {
    return -1
  }
}
