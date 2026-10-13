import { useEffect, useState } from 'react'
import { fmtBlog } from './RestaurantCard.jsx'

const IC = {
  share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z',
  phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
}
const Icon = ({ d }) => <svg viewBox="0 0 24 24"><path d={d} /></svg>

// 장소 상세 — 카카오 검색 결과 또는 코스 장소(동네 데이터: 영업시간·휴무·대표메뉴·공공 타이틀).
//  · 네이버 블로그 후기 수는 열 때마다 실시간 조회(저장 안 함). ⚠️ 이 화면엔 광고를 붙이지 않는다(네이버 검색 API 특약).
export default function DetailModal({ data, onClose, sheet = 'half' }) {
  const [toast, setToast] = useState('')
  const [enter, setEnter] = useState(true) // 진입 시 아래에서 슬라이드 업
  const [blog, setBlog] = useState(null) // { total, url }

  useEffect(() => {
    if (!data?.id) return
    setEnter(true)
    const raf = requestAnimationFrame(() => setEnter(false))
    return () => cancelAnimationFrame(raf)
  }, [data?.id])

  useEffect(() => {
    setBlog(null)
    if (!data?.name) return
    let active = true
    fetch(`/api/place?blog=1&name=${encodeURIComponent(data.name)}&addr=${encodeURIComponent(data.region || data.addr || '')}`)
      .then((r) => r.json())
      .then((d) => { if (active && d?.url) setBlog(d) })
      .catch(() => {})
    return () => { active = false }
  }, [data?.id, data?.name, data?.region, data?.addr])

  if (!data) return null

  const address = data.region || data.addr || ''
  const phone = data.phone
  const mapsUrl = data.place_url || `https://map.kakao.com/?q=${encodeURIComponent(`${data.name} ${address.split(' ').slice(0, 3).join(' ')}`)}`

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
    <div className={`detail-panel sheet-${sheet} ${enter ? 'sheet-enter' : ''}`}>
      <button className="detail-close" onClick={onClose} aria-label="닫기">×</button>

      <div className="detail-scroll">
        <div className="detail-head">
          <h2>{data.name}</h2>
          <div className="detail-cat">{data.cat}{data.licensed ? <span className="detail-rev"> · {String(data.licensed).slice(0, 4)}년부터</span> : null}</div>
          {data.tags?.length > 0 && (
            <div className="detail-tags">
              {data.tags.map((t) => <span key={t} className="tag-badge">🏅 {t}</span>)}
            </div>
          )}
        </div>

        <div className="detail-actions">
          <button className="dact" onClick={share} title="공유"><Icon d={IC.share} /></button>
          {phone && <button className="dact" onClick={copyPhone} title="전화번호 복사"><Icon d={IC.phone} /></button>}
          <a className="dact" href={mapsUrl} target="_blank" rel="noreferrer" title="카카오맵"><Icon d={IC.pin} /></a>
        </div>

        <div className="detail-body">
          <div className="detail-row"><span className="detail-ic">📍</span><span>{address}</span></div>
          {phone && (
            <div className="detail-row"><span className="detail-ic">📞</span><a href={`tel:${phone}`}>{phone}</a></div>
          )}
          {(data.hours?.use || data.hours?.rest) && (
            <div className="detail-row">
              <span className="detail-ic">🕒</span>
              <div className="detail-hours">
                {data.hours.use && <div>{data.hours.use}</div>}
                {data.hours.rest && <div>휴무 · {data.hours.rest}</div>}
              </div>
            </div>
          )}
          {(data.menu || data.price) && (
            <div className="detail-row"><span className="detail-ic">🍽️</span><span>{data.menu || data.price}</span></div>
          )}
          {data.pick && (
            <div className="detail-row"><span className="detail-ic">🤖</span><span>{data.pick}</span></div>
          )}
          <a className="kakao-link" href={mapsUrl} target="_blank" rel="noreferrer">카카오맵에서 사진·리뷰 보기 →</a>
          {blog && (
            <a className="kakao-link" href={blog.url} target="_blank" rel="noreferrer">
              📝 네이버 블로그 후기{blog.total > 0 ? ` ${fmtBlog(blog.total)}건` : ''} 보기 →
            </a>
          )}
        </div>
      </div>

      {toast && <div className="detail-toast">{toast}</div>}
    </div>
  )
}
