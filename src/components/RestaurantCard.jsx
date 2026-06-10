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
          <span className="rating-pill">★ {Number(data.rating).toFixed(1)}</span>
          <span className="reviews">리뷰 {Number(data.reviews).toLocaleString()}</span>
        </div>
      </div>
      <button
        className={`bm ${bookmarked ? 'on' : ''}`}
        aria-label="저장"
        onClick={(e) => { e.stopPropagation(); onBookmark(data.id) }}
      >
        {bookmarked ? '🔖' : '📑'}
      </button>
    </div>
  )
}
