// 큐레이션 시드 — 화제의/검증된 한국 맛집을 손으로 모아두고,
// 카카오로 좌표를 찾고(resolveKakao) 구글로 평점·사진을 붙인다(enrichWithGoogle).
// 이름이 안 맞아 카카오에서 못 찾으면 그냥 빠진다(graceful).
// ⚠️ 시드 목록은 출발점입니다 — 폐업/이전이 있을 수 있어 검증·확장하며 쓰세요.

import { enrichWithGoogle, catFromKakao, ICON_BY_CAT, PALETTE } from './kakao.js'

// tags: 노포 / 미쉐린 / 평냉(평양냉면) / 흑백요리사 등
const CURATION = [
  { name: '우래옥', area: '서울 중구', tags: ['노포', '평냉'] },
  { name: '을밀대', area: '서울 마포', tags: ['노포', '평냉'] },
  { name: '필동면옥', area: '서울 중구', tags: ['노포', '평냉'] },
  { name: '봉피양 방이점', area: '서울 송파', tags: ['평냉', '미쉐린'] },
  { name: '하동관', area: '서울 중구', tags: ['노포', '곰탕'] },
  { name: '잼배옥', area: '서울 중구', tags: ['노포', '설렁탕'] },
  { name: '광화문국밥', area: '서울 중구', tags: ['미쉐린', '국밥'] },
  { name: '진주회관', area: '서울 중구', tags: ['노포', '콩국수'] },
  { name: '오장동흥남집', area: '서울 중구', tags: ['노포', '냉면'] },
  { name: '평래옥', area: '서울 중구', tags: ['노포', '평냉'] },
  { name: '모수 서울', area: '서울 용산', tags: ['미쉐린', '흑백요리사'] },
  { name: '밍글스', area: '서울 강남', tags: ['미쉐린'] },
  { name: '권숙수', area: '서울 강남', tags: ['미쉐린'] },
  { name: '정식당', area: '서울 강남', tags: ['미쉐린'] },
  { name: '쵸이닷', area: '서울 강남', tags: ['흑백요리사'] },
]

async function resolveKakao(item, kkey) {
  try {
    const qs = new URLSearchParams({ query: `${item.name} ${item.area}`, category_group_code: 'FD6', size: '1' })
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${qs.toString()}`, {
      headers: { Authorization: `KakaoAK ${kkey}` },
    })
    if (!r.ok) return null
    const d = await r.json()
    const p = d.documents?.[0]
    if (!p) return null
    const c = catFromKakao(p.category_name)
    return {
      id: 'k_' + p.id,
      name: p.place_name || item.name,
      region: p.road_address_name || p.address_name || '',
      cat: c,
      price: '',
      rating: 0,
      reviews: 0,
      lng: Number(p.x),
      lat: Number(p.y),
      color: PALETTE[0],
      icon: ICON_BY_CAT[c],
      photo: null,
      priceLevel: 0,
      openNow: null,
      reviews_list: [],
      phone: p.phone || '',
      place_url: p.place_url || '',
      gid: null,
      source: 'kakao',
      tags: item.tags,
    }
  } catch (_) {
    return null
  }
}

export default async function handler(req, res) {
  const kkey = process.env.KAKAO_REST_KEY
  const gkey = process.env.GOOGLE_PLACES_API_KEY
  if (!kkey) { res.status(200).json({ places: [], fallback: true }); return }

  const tag = (req.query?.tag || '').toString()
  const list = tag ? CURATION.filter((c) => c.tags.includes(tag)) : CURATION
  try {
    const resolved = (await Promise.all(list.map((c) => resolveKakao(c, kkey)))).filter(Boolean)
    const places = gkey
      ? await Promise.all(resolved.map((it) => enrichWithGoogle(it, gkey).then((e) => ({ ...e, tags: it.tags }))))
      : resolved
    // 색상 인덱스 재배치
    places.forEach((p, i) => { p.color = PALETTE[i % PALETTE.length] })
    res.status(200).json({ places })
  } catch (e) {
    res.status(200).json({ places: [], error: String(e) })
  }
}
