// 기본으로 보여줄 주요 맛집 큐레이션.
// 전체 데이터를 담아서, 검색에 안 잡혀도 저장 목록 등에 항상 표시된다.
// 사진은 place id 기반(/api/photo?place=...)이라 레퍼런스 만료 걱정이 없다.
export const FEATURED = [
  {
    id: 'ChIJeauX-JLXejUROlA0FtrmFko',
    name: '뚜쥬루 빵돌가마마을',
    region: '충청남도 천안시 동남구 풍세로 706',
    cat: '카페', price: '₩₩₩', priceLevel: 3,
    rating: 4.4, reviews: 4180,
    lat: 36.7733173, lng: 127.1392119,
    color: '#e0a35c', icon: '🥐',
    photo: '/api/photo?place=ChIJeauX-JLXejUROlA0FtrmFko&w=300',
    openNow: null, reviews_list: [],
  },
]

export const FEATURED_IDS = FEATURED.map((f) => f.id)
