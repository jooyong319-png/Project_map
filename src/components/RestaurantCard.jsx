// 네이버 블로그 개수 표기: 12345 → "1.2만", 5600 → "5,600"
export function fmtBlog(n) {
  if (!n) return ''
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만'
  return Number(n).toLocaleString()
}

// 검색 결과 카드 — 장소 정보는 카카오 실시간(저장 안 함)
export default function RestaurantCard({ rank, data, selected, onOpen }) {
  const medal = rank === 1 ? 'medal-g' : rank === 2 ? 'medal-s' : rank === 3 ? 'medal-b' : ''
  return (
    <div className={`card ${selected ? 'sel' : ''}`} onClick={() => onOpen(data)}>
      <div className="thumb" style={{ background: data.color }}>
        <span className="thumb-emoji">{data.icon}</span>
        <span className={`rank-badge ${medal}`}>{rank}</span>
      </div>
      <div className="info">
        <div className="name">
          {data.name}
          {data.tags?.length > 0 && <span className="tag-badge">🏅 {data.tags[0]}</span>}
        </div>
        <div className="meta">{data.region}{data.cat ? ` · ${data.cat}` : ''}</div>
        <div className="rating-row">
          <span className="src-pill">{data.source === 'kakao' ? '카카오맵' : '정보'}</span>
        </div>
      </div>
    </div>
  )
}
