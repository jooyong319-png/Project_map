import { Fragment } from 'react'

// AI 코스 결과 — 동선(번호·이름·이유) + 구간별 이동시간(차/대중교통/도보).
const KIND_LABEL = { food: '맛집', travel: '관광지', stay: '숙소' }
const KIND_COLOR = { food: '#f0792e', travel: '#2ea36b', stay: '#7c5cff' }

// 분 → "1시간 5분" / "30분"
function fmtMin(m) {
  if (!m || m < 1) return ''
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}

// 두 장소 사이 이동수단 줄
function CourseLeg({ leg }) {
  if (!leg) return null
  const { car, transit, walk } = leg
  const lines = transit ? [...(transit.subways || []), ...(transit.buses || [])] : []
  return (
    <div className="course-leg">
      {car && <div className="course-leg-row"><span className="course-leg-ic">🚗</span>차 {fmtMin(car.min)}</div>}
      {transit && transit.min > 0 && (
        <div className="course-leg-row">
          <span className="course-leg-ic">🚌</span>대중교통 {fmtMin(transit.min)}
          {lines.length > 0 && <span className="course-leg-lines"> · {lines.slice(0, 4).join(', ')}</span>}
        </div>
      )}
      {walk && <div className="course-leg-row"><span className="course-leg-ic">🚶</span>도보 {fmtMin(walk.min)}</div>}
    </div>
  )
}

export default function CoursePanel({ course, loading, selected, onSelectStop, onClose }) {
  if (!loading && !course) return null
  return (
    <div className="course-panel">
      <div className="course-head">
        <div className="course-title">
          <span className="course-ai">🧭 AI 코스</span>
          {course && <b>{course.title}</b>}
        </div>
        <button className="course-close" onClick={onClose} aria-label="닫기">×</button>
      </div>

      {loading ? (
        <div className="course-loading"><span className="spin dark" /> 동선을 짜고 있어요…</div>
      ) : (
        <>
          {course.summary && <div className="course-summary">{course.summary}</div>}
          <div className="course-stops">
            {course.stops.map((s, i) => (
              <Fragment key={s.id}>
                <button
                  className={`course-stop ${selected === s.id ? 'on' : ''}`}
                  onClick={() => onSelectStop && onSelectStop(s)}
                >
                  <span className="course-num" style={{ background: KIND_COLOR[s.kind] || '#f0792e' }}>{s.order}</span>
                  <span className="course-info">
                    <span className="course-name">{s.name}</span>
                    <span className="course-sub">
                      <span className="course-kind" style={{ color: KIND_COLOR[s.kind] }}>{KIND_LABEL[s.kind] || ''}</span>
                      {s.rating > 0 && <span className="course-rate">★ {Number(s.rating).toFixed(1)}</span>}
                    </span>
                    <span className="course-meta">{s.reason}</span>
                  </span>
                  {s.photo && <img className="course-thumb" src={s.photo} alt="" loading="lazy" />}
                </button>
                {i < course.stops.length - 1 && <CourseLeg leg={course.legs?.[i]} />}
              </Fragment>
            ))}
          </div>
          {course.lodging && (
            <a
              className="course-lodging"
              href={course.lodging.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                margin: '12px 0 4px', padding: '12px', borderRadius: 12, fontWeight: 700,
                background: '#7c5cff', color: '#fff', textDecoration: 'none',
              }}
            >
              🏨 {course.lodging.label}
            </a>
          )}
          {course.note === 'auto' && <div className="course-note">※ AI 응답이 늦어 자동으로 구성했어요</div>}
        </>
      )}
    </div>
  )
}
