// 검색 종류: 음식 / 여행지 / 숙소. 기본은 음식.
// tags = 그 종류에서 보여줄 태그 칩(첫 번째가 '인기/맛집' = 블로그 상위, 나머지는 비율 태그).
export const KINDS = [
  { key: 'all', label: '전체', icon: '🧭', tags: [], placeholder: '맛집·여행지·숙소, 콕 찍어 검색' },
  { key: 'food', label: '음식', icon: '🍴', tags: ['맛집', '노포', '혼밥', '핫플'], placeholder: '가게 이름 검색 (예: 우래옥)' },
  { key: 'travel', label: '관광지', icon: '🗺️', tags: ['저렴한', '인생샷', 'SNS 핫플', '랜드마크', '박물관', '공원'], placeholder: '관광지 검색 (예: 경복궁)' },
  { key: 'stay', label: '숙소', icon: '🛏️', tags: ['휴양지', '가성비', '애견동반', '호캉스', '럭셔리'], placeholder: '숙소 검색 (예: 신라스테이)' },
]
export const KIND_KEYS = KINDS.map((k) => k.key)
export function kindOf(key) { return KINDS.find((k) => k.key === key) || KINDS[0] }
