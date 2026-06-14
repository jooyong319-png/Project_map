import { useState, useEffect, useRef } from 'react'
import Globe from './Globe.jsx'
import MapView from './MapView.jsx'
import { DEFAULT_REGION } from '../data/countries.js'

// 지구본에서 지역 핀을 클릭하거나 확대하면 그 지역 지도가 열리고(+ 맛집 검색),
// 지도를 충분히 축소하면 다시 지구본으로 돌아온다.
export default function GeoPanel({ items, selected, onSelect, onAreaSearch, onReset, onBounds, onMoving, onZoom, navTo, loading, limit, kind, course, courseLoading, onCourse, onClearCourse }) {
  const [view, setView] = useState('globe') // 'globe' | 'map'
  const [globeStart, setGlobeStart] = useState(null) // { center:[lng,lat], scale }
  const [mapStart, setMapStart] = useState(null) // { center:[lat,lng], zoom }
  const [seq, setSeq] = useState(0) // 전환마다 키를 바꿔 강제 리마운트

  const [flyTarget, setFlyTarget] = useState(null) // 지구본이 날아갈 좌표 {lng,lat}
  const pendingOpen = useRef(null)

  // 지구본을 그 좌표로 날린 뒤( onFlyDone ) openFn 실행
  const enterWithFly = (lngLat, openFn) => {
    pendingOpen.current = openFn
    setFlyTarget({ lng: lngLat[0], lat: lngLat[1] })
  }
  const handleFlyDone = () => {
    setFlyTarget(null)
    const fn = pendingOpen.current
    pendingOpen.current = null
    fn && fn()
  }

  // 지역 지도 열기 (리셋/검색은 호출하는 쪽에서 결정)
  const openRegion = (c) => {
    setMapStart({ center: [c.center[1], c.center[0]], zoom: c.zoom })
    setSeq((s) => s + 1)
    setView('map')
  }

  // 핀 클릭/확대 진입 → 리스트 초기화 후 그 지역 지도로 (검색은 안 함)
  const handleCountryClick = (c) => enterWithFly(c.center, () => { onReset && onReset(c.name); openRegion(c) })
  const handleZoomThrough = (c) => { const r = c || DEFAULT_REGION; onReset && onReset(r.name); openRegion(r) }

  // 내 위치 (지구본/지도 어디서든) — 지구본이면 지도로 진입, 지도면 그 좌표로 이동
  const [myLoc, setMyLoc] = useState(null)
  const [locating, setLocating] = useState(false)
  const locateMe = () => {
    if (!navigator.geolocation) { alert('이 브라우저는 위치 정보를 지원하지 않아요.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude
        setMyLoc([lat, lng])
        setLocating(false)
        if (view === 'globe') enterWithFly([lng, lat], () => openRegion({ center: [lng, lat], zoom: 15 }))
        // 지도면 MapView 의 FlyToLoc 가 이동
      },
      () => { setLocating(false); alert('위치를 가져오지 못했어요. 권한을 허용했는지 확인해 주세요.') },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  }

  // 지역 필터 이동: 지구본이면 날아가서 지도 진입, 이미 지도면 부드럽게 flyTo(점프 X)
  const [mapFly, setMapFly] = useState(null)
  const prevNav = useRef(null)
  useEffect(() => {
    if (navTo && navTo !== prevNav.current) {
      if (view === 'globe') enterWithFly(navTo.center, () => openRegion(navTo))
      else setMapFly({ center: navTo.center, zoom: navTo.zoom }) // 도착(moveend) 후 Home 이 검색
    }
    prevNav.current = navTo
  }, [navTo, view])

  // 지도 최소 축소 → 그 좌표로 지구본 복귀
  const handleMapZoomOut = (centerLngLat) => {
    onReset && onReset() // 이탈 시 리스트 초기화
    setGlobeStart({ center: centerLngLat, scale: 480 })
    setSeq((s) => s + 1)
    setView('globe')
  }

  // 지구본 상태에서 리스트/항목이 선택되면 → 그 위치로 날아간 뒤 지도 전환
  const prevSel = useRef(null)
  useEffect(() => {
    if (selected && selected !== prevSel.current && view === 'globe') {
      const d = (items || []).find((x) => x.id === selected)
      if (d && d.lat != null && d.lng != null) {
        enterWithFly([d.lng, d.lat], () => {
          setMapStart({ center: [d.lat, d.lng], zoom: 15 })
          setSeq((s) => s + 1)
          setView('map')
        })
      }
    }
    prevSel.current = selected
  }, [selected, view, items])

  return (
    <div className="mapwrap">
      {view === 'globe' ? (
        <div className="geo-layer" key={`g${seq}`}>
          <Globe
            items={items}
            selected={selected}
            onSelect={onSelect}
            onCountryClick={handleCountryClick}
            onZoomThrough={handleZoomThrough}
            onMoving={onMoving}
            flyTo={flyTarget}
            onFlyDone={handleFlyDone}
            initialCenter={globeStart?.center}
            initialScale={globeStart?.scale}
          />
        </div>
      ) : (
        <div className="geo-layer" key={`m${seq}`}>
          <MapView
            items={items}
            selected={selected}
            onSelect={onSelect}
            onZoomOut={handleMapZoomOut}
            onSearchArea={onAreaSearch}
            onBounds={onBounds}
            onMoving={onMoving}
            onZoom={onZoom}
            myLoc={myLoc}
            flyTarget={mapFly}
            searching={loading}
            kind={kind}
            limit={limit}
            initialCenter={mapStart?.center}
            initialZoom={mapStart?.zoom}
            course={course}
            onCourse={onCourse}
            courseLoading={courseLoading}
          />
        </div>
      )}
      <button className="locate-btn" onClick={locateMe} disabled={locating} title="내 위치" aria-label="내 위치">
        {locating ? <span className="spin dark" /> : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
          </svg>
        )}
      </button>
    </div>
  )
}
