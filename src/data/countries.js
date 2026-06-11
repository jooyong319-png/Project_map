// 지구본에 핀으로 표시할 지역. 한국 + 큼지막한 대표 국가들.
// center 는 [경도, 위도], zoom 은 지도 진입 줌, bbox 는 검색 영역 [서, 남, 동, 북].
// 여기에 항목을 추가하면 지구본에 자동으로 핀이 생긴다.
// 진입 줌은 MAP_MIN_ZOOM(5)보다 커야 함(안 그러면 들어가자마자 지구본 복귀).
// 큰 나라(중·미·호)는 대표 도시 중심으로 진입.
export const COUNTRIES = [
  { name: '대한민국', query: '맛집', center: [127.0, 37.55], zoom: 7, bbox: [125.5, 33.0, 130.0, 38.7] },   // 서울
  { name: '일본', query: '맛집', center: [139.7, 35.68], zoom: 7, bbox: [129.4, 31.0, 145.6, 45.6] },       // 도쿄
  { name: '중국', query: '맛집', center: [116.4, 39.9], zoom: 7, bbox: [73.7, 18.2, 135.0, 53.5] },         // 베이징
  { name: '미국', query: '맛집', center: [-74.0, 40.7], zoom: 7, bbox: [-125.0, 24.5, -66.9, 49.4] },       // 뉴욕
  { name: '프랑스', query: '맛집', center: [2.35, 48.86], zoom: 7, bbox: [-5.2, 41.3, 9.6, 51.1] },          // 파리
  { name: '이탈리아', query: '맛집', center: [12.5, 41.9], zoom: 7, bbox: [6.6, 36.6, 18.5, 47.1] },         // 로마
  { name: '영국', query: '맛집', center: [-0.12, 51.51], zoom: 7, bbox: [-8.6, 49.9, 1.8, 58.7] },           // 런던
  { name: '스페인', query: '맛집', center: [-3.7, 40.42], zoom: 7, bbox: [-9.4, 36.0, 3.3, 43.8] },          // 마드리드
  { name: '태국', query: '맛집', center: [100.5, 13.74], zoom: 7, bbox: [97.3, 5.6, 105.6, 20.5] },          // 방콕
  { name: '베트남', query: '맛집', center: [105.85, 21.03], zoom: 7, bbox: [102.1, 8.5, 109.5, 23.4] },      // 하노이
  { name: '호주', query: '맛집', center: [151.2, -33.87], zoom: 7, bbox: [113.0, -39.0, 154.0, -10.0] },     // 시드니
]

// 지구본을 확대해 진입할 때 기본 지역
export const DEFAULT_REGION = COUNTRIES[0]

// 나라별 검색 키워드(필터 칩). 선택하면 그 키워드로 검색.
export const KEYWORDS = {
  대한민국: ['고기', '횟집', '국밥', '국수', '분식', '카페', '디저트', '술집', '파스타', '치킨', '일식', '중식'],
  일본: ['グルメ', 'レストラン', '居酒屋', 'おすすめ'],
  중국: ['美食', '餐厅', '必吃', '探店'],
  미국: ['must eat', 'top rated', 'Eater', 'best restaurant'],
  프랑스: ['bistro', 'michelin bib gourmand', 'traditional french'],
  이탈리아: ['trattoria', 'osteria', 'ristorante'],
  영국: ['traditional british food', 'pub food', 'restaurant'],
  스페인: ['tapas', 'restaurante', 'best restaurant'],
  태국: ['street food', 'local food', 'restaurant'],
  베트남: ['street food', 'local food', 'restaurant'],
  호주: ['brunch', 'cafe', 'restaurant'],
}

// 가격 등급(priceLevel 1~4) → 1인 기준 대략 금액대 라벨(근사치)
export const PRICE_LABEL = { 1: '~1만원', 2: '1~3만원', 3: '3~5만원', 4: '5만원+' }

// 나라 → 도시 → 동네. 칩 클릭 시 그 좌표/줌으로 지도 이동. (한국·일본은 동네까지)
// center = [경도, 위도]
export const CITIES = {
  대한민국: [
    { name: '서울', center: [126.99, 37.55], zoom: 11, areas: [
      { name: '강남', center: [127.028, 37.498], zoom: 14 },
      { name: '홍대', center: [126.923, 37.556], zoom: 14 },
      { name: '성수', center: [127.056, 37.544], zoom: 14 },
      { name: '이태원', center: [126.994, 37.534], zoom: 14 },
      { name: '종로', center: [126.991, 37.572], zoom: 14 },
      { name: '명동', center: [126.985, 37.563], zoom: 15 },
      { name: '여의도', center: [126.924, 37.521], zoom: 14 },
      { name: '잠실', center: [127.100, 37.513], zoom: 14 },
      { name: '연남', center: [126.925, 37.561], zoom: 15 },
      { name: '망원', center: [126.905, 37.556], zoom: 15 },
    ] },
    { name: '부산', center: [129.07, 35.18], zoom: 11, areas: [
      { name: '서면', center: [129.060, 35.158], zoom: 14 },
      { name: '해운대', center: [129.160, 35.163], zoom: 14 },
      { name: '광안리', center: [129.118, 35.153], zoom: 14 },
      { name: '남포동', center: [129.034, 35.098], zoom: 14 },
      { name: '전포', center: [129.066, 35.153], zoom: 15 },
    ] },
    { name: '제주', center: [126.53, 33.50], zoom: 10, areas: [
      { name: '제주시', center: [126.523, 33.511], zoom: 13 },
      { name: '서귀포', center: [126.560, 33.253], zoom: 13 },
      { name: '애월', center: [126.330, 33.463], zoom: 13 },
    ] },
    { name: '대구', center: [128.60, 35.87], zoom: 11 },
    { name: '인천', center: [126.70, 37.46], zoom: 11 },
    { name: '대전', center: [127.38, 36.35], zoom: 11 },
    { name: '광주', center: [126.85, 35.16], zoom: 11 },
    { name: '수원', center: [127.029, 37.263], zoom: 12 },
    { name: '전주', center: [127.148, 35.824], zoom: 12 },
    { name: '강릉', center: [128.90, 37.755], zoom: 12 },
    { name: '경주', center: [129.225, 35.842], zoom: 12 },
  ],
  일본: [
    { name: '도쿄', center: [139.70, 35.68], zoom: 11, areas: [
      { name: '신주쿠', center: [139.700, 35.690], zoom: 14 },
      { name: '시부야', center: [139.701, 35.658], zoom: 14 },
      { name: '긴자', center: [139.764, 35.671], zoom: 14 },
      { name: '아사쿠사', center: [139.796, 35.711], zoom: 14 },
      { name: '우에노', center: [139.777, 35.713], zoom: 14 },
    ] },
    { name: '오사카', center: [135.50, 34.69], zoom: 11, areas: [
      { name: '난바', center: [135.502, 34.665], zoom: 14 },
      { name: '우메다', center: [135.498, 34.705], zoom: 14 },
      { name: '도톤보리', center: [135.501, 34.669], zoom: 15 },
    ] },
    { name: '교토', center: [135.768, 35.011], zoom: 12 },
    { name: '후쿠오카', center: [130.401, 33.590], zoom: 12 },
    { name: '삿포로', center: [141.350, 43.062], zoom: 12 },
  ],
  중국: [
    { name: '베이징', center: [116.40, 39.90], zoom: 11 },
    { name: '상하이', center: [121.47, 31.23], zoom: 11 },
    { name: '청두', center: [104.07, 30.57], zoom: 11 },
  ],
  미국: [
    { name: '뉴욕', center: [-74.00, 40.71], zoom: 12 },
    { name: 'LA', center: [-118.24, 34.05], zoom: 11 },
    { name: '샌프란시스코', center: [-122.42, 37.77], zoom: 12 },
  ],
  프랑스: [{ name: '파리', center: [2.35, 48.86], zoom: 12 }, { name: '니스', center: [7.266, 43.703], zoom: 13 }],
  이탈리아: [{ name: '로마', center: [12.50, 41.90], zoom: 12 }, { name: '밀라노', center: [9.190, 45.464], zoom: 12 }],
  영국: [{ name: '런던', center: [-0.12, 51.51], zoom: 12 }],
  스페인: [{ name: '마드리드', center: [-3.70, 40.42], zoom: 12 }, { name: '바르셀로나', center: [2.173, 41.385], zoom: 12 }],
  태국: [{ name: '방콕', center: [100.50, 13.74], zoom: 12 }, { name: '치앙마이', center: [98.999, 18.788], zoom: 13 }],
  베트남: [{ name: '하노이', center: [105.85, 21.03], zoom: 12 }, { name: '호치민', center: [106.700, 10.776], zoom: 12 }, { name: '다낭', center: [108.221, 16.060], zoom: 13 }],
  호주: [{ name: '시드니', center: [151.21, -33.87], zoom: 12 }, { name: '멜버른', center: [144.963, -37.814], zoom: 12 }],
}
