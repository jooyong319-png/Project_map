import { useEffect, useState, useRef } from 'react'
import { PRICE_LABEL } from '../data/countries.js'
import { fmtBlog } from './RestaurantCard.jsx'

const IC = {
  star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z',
  phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  web: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
}
const Icon = ({ d }) => <svg viewBox="0 0 24 24"><path d={d} /></svg>

export default function DetailModal({ data, onClose, onBookmark, bookmarked, sheet = 'half' }) {
  const [det, setDet] = useState(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [lightbox, setLightbox] = useState(null) // 확대해서 볼 이미지 src
  // 갤러리 드래그용 ref (반드시 early-return 위에서 호출 — Hooks 규칙)
  const galRef = useRef(null)
  const drag = useRef({ down: false, x: 0, left: 0, moved: false })
  const [enter, setEnter] = useState(true) // 진입 시 아래에서 슬라이드 업

  useEffect(() => {
    if (!data?.id) return
    setEnter(true)
    const raf = requestAnimationFrame(() => setEnter(false))
    return () => cancelAnimationFrame(raf)
  }, [data?.id])

  useEffect(() => {
    // 구글 상세를 조회할 id: 구글 항목은 자기 id, 카카오는 매칭된 구글 id(gid). 매칭 없으면 생략.
    const gid = data?.source === 'kakao' ? data?.gid : data?.id
    if (!gid) { setDet(null); return }
    setDet(null)
    setLoading(true)
    let active = true
    fetch(`/api/place?id=${encodeURIComponent(gid)}`)
      .then((r) => r.json())
      .then((d) => { if (active) { setDet(d && !d.error ? d : null); setLoading(false) } })
      .catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [data?.id, data?.source, data?.gid])

  if (!data) return null

  const isKakao = data.source === 'kakao'
  const photos = det?.photos?.length ? det.photos : (data.photo ? [data.photo] : [])
  const address = det?.address || data.region || ''
  const phone = det?.phone || data.phone
  const website = det?.website
  const mapsUrl = isKakao
    ? (data.place_url || `https://map.kakao.com/?q=${encodeURIComponent(data.name)}`)
    : (det?.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.name)}`)

  // 갤러리 마우스 드래그 스와이프
  const galDown = (e) => { const el = galRef.current; if (!el) return; drag.current = { down: true, x: e.clientX, left: el.scrollLeft, moved: false, target: e.target }; try { el.setPointerCapture(e.pointerId) } catch (_) {} }
  const galMove = (e) => { if (!drag.current.down || !galRef.current) return; if (Math.abs(e.clientX - drag.current.x) > 4) drag.current.moved = true; galRef.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x) }
  // 탭(드래그 아님)으로 이미지를 누르면 확대 — setPointerCapture 가 click 을 막으므로 pointerup 에서 판정
  const galUp = () => {
    if (drag.current.down && !drag.current.moved) {
      const t = drag.current.target
      if (t && t.tagName === 'IMG' && t.dataset.idx != null) setLightbox(Number(t.dataset.idx))
    }
    drag.current.down = false
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1800) }
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: data.name, url: mapsUrl })
      else { await navigator.clipboard.writeText(mapsUrl); showToast('링크를 복사했어요') }
    } catch (_) {}
  }
  const copyPhone = async () => {
    try { await navigator.clipboard.writeText(phone) } catch (_) {}
    showToast(`전화번호 복사됨 · ${phone}`)
  }

  return (
    <>
    <div className={`detail-panel sheet-${sheet} ${enter ? 'sheet-enter' : ''}`}>
      <button className="detail-close" onClick={onClose} aria-label="닫기">×</button>

      <div className="detail-scroll">
      <div className="detail-head">
        <h2>{data.name}</h2>
        <div className="detail-cat">
          {data.cat}{data.priceLevel ? ` · ${PRICE_LABEL[data.priceLevel]}` : ''}
          {data.rating > 0 ? (
            <> · <span className="detail-star">★ {Number(data.rating).toFixed(1)}</span>
            <span className="detail-rev"> ({Number(data.reviews).toLocaleString()})</span></>
          ) : isKakao ? <span className="detail-rev"> · 카카오맵</span> : null}
          {data.blog > 0 && <span className="detail-rev"> · 📝 블로그 {fmtBlog(data.blog)}</span>}
        </div>
        {data.tags?.length > 0 && (
          <div className="detail-tags">
            {data.tags.map((t) => <span key={t} className="tag-badge">🏅 {t}</span>)}
          </div>
        )}
      </div>

      <div className="detail-actions">
        <button className={`dact dact-save ${bookmarked ? 'on' : ''}`} onClick={() => onBookmark && onBookmark(data)} title="저장">
          <Icon d={IC.star} />
        </button>
        <button className="dact" onClick={share} title="공유">
          <Icon d={IC.share} />
        </button>
        {phone && (
          <button className="dact" onClick={copyPhone} title="전화번호 복사">
            <Icon d={IC.phone} />
          </button>
        )}
        {website && (
          <a className="dact" href={website} target="_blank" rel="noreferrer" title="홈페이지">
            <Icon d={IC.web} />
          </a>
        )}
        <a className="dact" href={mapsUrl} target="_blank" rel="noreferrer" title="지도">
          <Icon d={IC.pin} />
        </a>
      </div>

      {photos.length > 0 && (
        <div
          className="detail-gallery"
          ref={galRef}
          onPointerDown={galDown}
          onPointerMove={galMove}
          onPointerUp={galUp}
          onPointerCancel={galUp}
        >
          {photos.map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy" draggable={false} data-idx={i}
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ))}
        </div>
      )}

      <div className="detail-body">
        <div className="detail-row">
          <span className="detail-ic">📍</span>
          <span>{address}{loading && !det ? ' …' : ''}</span>
        </div>
        {phone && (
          <div className="detail-row">
            <span className="detail-ic">📞</span>
            <a href={`tel:${phone}`}>{phone}</a>
          </div>
        )}
        {det?.hours?.length > 0 && (
          <div className="detail-row">
            <span className="detail-ic">🕒</span>
            <div className="detail-hours">
              {det.hours.map((h, i) => <div key={i}>{h}</div>)}
            </div>
          </div>
        )}
        {isKakao && (
          <a className="kakao-link" href={mapsUrl} target="_blank" rel="noreferrer">
            카카오맵에서 사진·리뷰 보기 →
          </a>
        )}
      </div>
      </div>

      {toast && <div className="detail-toast">{toast}</div>}
    </div>
    {lightbox != null && (
      <Lightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
    )}
    </>
  )
}

// 이미지 확대 보기 — 양쪽 화살표/키보드로 이전·다음, 탭하면 확대(줌) 토글, 확대 시 드래그로 이동
const ZOOM = 2.4
function Lightbox({ photos, index, onIndex, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef({ down: false, x: 0, y: 0, px: 0, py: 0, moved: false })
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }
  // 넘길 땐 확대 배율은 유지, 위치만 가운데로
  const go = (d) => { const n = index + d; if (n >= 0 && n < photos.length) { onIndex(n); setPan({ x: 0, y: 0 }) } }
  useEffect(() => { setPan({ x: 0, y: 0 }) }, [index])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const down = (e) => { drag.current = { down: true, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }; if (zoom > 1) setDragging(true); try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {} }
  const move = (e) => {
    const dr = drag.current; if (!dr.down) return
    const dx = e.clientX - dr.x, dy = e.clientY - dr.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dr.moved = true
    if (zoom > 1) setPan({ x: dr.px + dx, y: dr.py + dy })
  }
  const up = () => {
    const dr = drag.current; if (!dr.down) return
    dr.down = false; setDragging(false)
    if (!dr.moved) { if (zoom > 1) reset(); else setZoom(ZOOM) } // 탭 → 확대/축소 토글
  }
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="닫기">×</button>
      {index > 0 && (
        <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="이전">‹</button>
      )}
      <img
        src={photos[index]} alt="" draggable={false}
        className={`lightbox-img ${zoom > 1 ? 'zoomed' : ''}`}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging ? 'none' : 'transform .18s ease' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      />
      {index < photos.length - 1 && (
        <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="다음">›</button>
      )}
      {photos.length > 1 && <div className="lightbox-count">{index + 1} / {photos.length}</div>}
    </div>
  )
}
