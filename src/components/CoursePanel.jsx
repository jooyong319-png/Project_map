// AI 코스 결과 카드 — 지도 위에 떠서 동선(번호·이름·이유)을 보여준다.
const KIND_LABEL = { food: '맛집', travel: '관광지', stay: '숙소' }
const KIND_COLOR = { food: '#f0792e', travel: '#2ea36b', stay: '#7c5cff' }

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
            {course.stops.map((s) => (
              <button
                key={s.id}
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
            ))}
          </div>
          {course.note === 'auto' && <div className="course-note">※ AI 응답이 늦어 자동으로 구성했어요</div>}
        </>
      )}
    </div>
  )
}
