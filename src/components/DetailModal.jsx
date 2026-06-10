export default function DetailModal({ data, onClose }) {
  if (!data) return null
  return (
    <div className="overlay show" onClick={(e) => { if (e.target.classList.contains('overlay')) onClose() }}>
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        <div className="modal-hero" style={{ background: data.color }}>{data.icon}</div>
        <div className="modal-body">
          <h2>{data.name}</h2>
          <div className="meta">
            {data.region}{data.cat ? ` · ${data.cat}` : ''}{data.price ? ` · ${data.price}` : ''}
          </div>
          <div className="rating" style={{ marginBottom: 14 }}>
            ★ {Number(data.rating).toFixed(1)}{' '}
            <span style={{ color: '#aaa', fontWeight: 400 }}>
              ({Number(data.reviews).toLocaleString()}개 리뷰)
            </span>
          </div>
          {data.reviews_list && data.reviews_list.length > 0 ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>리뷰</div>
              {data.reviews_list.map((r, i) => (
                <div className="review" key={i}>
                  <div className="who">{r.who}</div>
                  <div className="txt">{r.t}</div>
                </div>
              ))}
            </>
          ) : (
            <div className="review" style={{ color: '#999' }}>
              개별 리뷰 텍스트는 Google Place Details API로 확장할 수 있어요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
