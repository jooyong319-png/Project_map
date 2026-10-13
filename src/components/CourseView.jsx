// AI 코스 결과 — 시간대별 타임라인 + 오늘의 중심 + 구간 이동 + 주차장 + [다른 코스][길찾기]
// 시안: 콕콕콕 코스 퍼스트 시안(Artifact) ②/④

// 분 → "1시간 5분" / "30분"
function fmtMin(m) {
  if (!m || m < 1) return ''
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}
// 관광공사 이용시간 원문("[평일] / - 11:00~20:30 / - 준비시간 …")을 한 줄로
function shortHours(s = '') {
  const t = s.replace(/\s*\/\s*/g, ' ').replace(/(^|\s)-\s+/g, '$1').replace(/※.*$/, '').replace(/\s+/g, ' ').trim()
  return t.length > 44 ? t.slice(0, 43) + '…' : t
}
// 장소 성격 → 색·이름 (식사=주황, 카페=갈색, 구경=초록)
function roleOf(s) {
  if (s.kind === 'travel') return { key: 'sight', word: '구경', color: '#2F7D55', text: '#2E6B48' }
  if (s.cat === '카페') return { key: 'cafe', word: '카페', color: '#7A5232', text: '#7A5232' }
  const h = parseInt((s.time || '12').split(':')[0], 10)
  const word = h >= 17 || h < 5 ? '저녁' : h >= 15 ? '간식' : '점심'
  return { key: 'meal', word, color: '#C4561E', text: '#A3461A' }
}

function Leg({ leg, car }) {
  if (!leg) return null
  const { walk, transit } = leg
  const drive = leg.car
  return (
    <div className="cf-leg">
      <span>도보 {fmtMin(walk?.min)}</span>
      {car && drive && <span> · 차 {fmtMin(drive.min)}</span>}
      {transit?.min > 0 && <span> · 대중교통 {fmtMin(transit.min)}</span>}
    </div>
  )
}

export default function CourseView({ course, loading, selected, onSelectStop, onBack, onReroll, summaryLabel, car }) {
  if (loading || !course) {
    return (
      <div className="cf-course">
        <button type="button" className="cf-back" onClick={onBack}>‹ {summaryLabel || '다시 고르기'}</button>
        <div className="cf-loading"><span className="spin dark" /> 동선을 짜고 있어요…</div>
      </div>
    )
  }
  const first = course.stops[0]
  const routeUrl = first ? `https://map.kakao.com/link/to/${encodeURIComponent(first.name)},${first.lat},${first.lng}` : ''
  return (
    <div className="cf-course">
      <div className="cf-course-head">
        <button type="button" className="cf-back" onClick={onBack}>‹ {summaryLabel || '다시 고르기'}</button>
        <div className="cf-kicker">AI 추천 {course.evening ? '저녁' : '하루'} 코스 · {course.stops.length}곳</div>
        <h2 className="cf-title">{course.title}</h2>
        {course.summary && <p className="cf-summary">{course.summary}</p>}
        {course.anchor && <div className="cf-anchor">오늘의 중심 <b>{course.anchor.name}</b> · 주변 1km 안에서 골랐어요</div>}
        {course.start && <div className="cf-start-line">🚉 {course.start.label}에서 출발 · 첫 장소까지 도보 {fmtMin(course.start.walk?.min)}</div>}
      </div>

      <ol className="cf-timeline">
        {course.stops.map((s, i) => {
          const r = roleOf(s)
          const isAnchor = course.anchor?.id === s.id
          return (
            <li key={s.id} className="cf-stop">
              <div className="cf-rail">
                <span className={`cf-num ${isAnchor ? 'anchor' : ''}`} style={{ background: r.color }}>{s.order}</span>
                {i < course.stops.length - 1 && <span className="cf-line" />}
              </div>
              <div className="cf-body">
                <button type="button" className={`cf-stop-btn ${selected === s.id ? 'on' : ''}`} onClick={() => onSelectStop && onSelectStop(s)}>
                  <span className="cf-when" style={{ color: r.text }}>{s.time} {r.word}{isAnchor ? ' · 오늘의 중심' : ''}</span>
                  <span className="cf-name">{s.name}</span>
                  {(s.hours?.use || s.hours?.rest) && (
                    <span className="cf-hours">
                      {shortHours(s.hours.use) || '시간 정보 없음'}
                      {s.hours.rest ? <> · 휴무 {shortHours(s.hours.rest)}</> : null}
                    </span>
                  )}
                  {s.timeOk === false && <span className="cf-warn">이 시간엔 문을 닫았을 수 있어요 · 출발 전 확인</span>}
                  {s.reason && <span className="cf-reason">{s.reason}</span>}
                </button>
                {i < course.stops.length - 1 && <Leg leg={course.legs?.[i]} car={car} />}
              </div>
            </li>
          )
        })}
      </ol>

      {course.parking?.length > 0 && (
        <div className="cf-parking">
          <div className="cf-parking-title">🅿️ {course.anchor?.name || '코스'} 근처 주차장</div>
          {course.parking.map((p) => (
            <div key={p.name} className="cf-parking-row">
              <span><b>{p.name}</b> <em className={p.type === '공영' ? 'pub' : ''}>{p.type}</em></span>
              <span className="cf-parking-meta">
                {p.dist != null && `${p.dist}m`}
                {p.fee ? ` · ${p.fee}` : ''}
                {p.type !== '공영' && p.url && <> · <a href={p.url} target="_blank" rel="noreferrer">요금은 카카오맵</a></>}
              </span>
            </div>
          ))}
          <div className="cf-parking-src">공영: 전국주차장정보표준데이터 · 민영: 카카오 · 요금·운영시간은 바뀔 수 있어요</div>
        </div>
      )}
      {course.note === 'auto' && <div className="cf-note">※ AI 응답이 늦어 자동으로 구성했어요</div>}

      <div className="cf-actions">
        <button type="button" className="cf-btn" onClick={onReroll}>다른 코스</button>
        {routeUrl && <a className="cf-btn primary" href={routeUrl} target="_blank" rel="noreferrer">첫 장소 길찾기</a>}
      </div>
    </div>
  )
}
