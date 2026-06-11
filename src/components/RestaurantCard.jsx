export default function RestaurantCard({ rank, data, selected, bookmarked, onOpen, onBookmark }) {
  const medal = rank === 1 ? 'medal-g' : rank === 2 ? 'medal-s' : rank === 3 ? 'medal-b' : ''
  return (
    <div className={`card ${selected ? 'sel' : ''}`} onClick={() => onOpen(data)}>
      <div className="thumb" style={{ background: data.color }}>
        {data.photo
          ? <img className="thumb-img" src={data.photo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          : <span className="thumb-emoji">{data.icon}</span>}
        <span className={`rank-badge ${medal}`}>{rank}</span>
      </div>
      <div className="info">
        <div className="name">{data.name}</div>
        <div className="meta">
          {data.region}{data.cat ? ` · ${data.cat}` : ''}{data.price ? ` · ${data.price}` : ''}
        </div>
        <div className="rating-row">
          {data.rating > 0 ? (
            <>
              <span className="rating-pill">★ {Number(data.rating).toFixed(1)}</span>
              <span className="reviews">리뷰 {Number(data.reviews).toLocaleString()}</span>
            </>
          ) : (
            <span className="src-pill">{data.source === 'kakao' ? '카카오맵' : '정보'}</span>
          )}
        </div>
      </div>
      <button
        className={`bm ${bookmarked ? 'on' : ''}`}
        aria-label={bookmarked ? '저장됨' : '저장'}
        onClick={(e) => { e.stopPropagation(); onBookmark(data) }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      </button>
    </div>
  )
}
