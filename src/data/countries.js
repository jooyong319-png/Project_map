// 지구본에 핫스팟으로 표시할 지역. 지금은 한국만.
// center 는 [경도, 위도], zoom 은 지도 진입 시 줌 레벨,
// bbox 는 검색 영역 제한용 [서, 남, 동, 북].
// 나중에 부산·제주 등 국내 지역이나 다른 나라를 여기에 추가하면 자동으로 핀이 생긴다.
export const COUNTRIES = [
  { name: '대한민국', query: '전국 맛집', center: [127.8, 36.3], zoom: 6.5, bbox: [125.5, 33.0, 130.0, 38.7] },
]

// 지구본을 어디서 확대하든 기본으로 진입할 지역 (지금은 한국)
export const DEFAULT_REGION = COUNTRIES[0]
