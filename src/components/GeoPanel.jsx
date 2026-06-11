import { useState, useEffect, useRef } from 'react'
import Globe from './Globe.jsx'
import MapView from './MapView.jsx'
import { DEFAULT_REGION } from '../data/countries.js'

// 지구본에서 지역 핀을 클릭하거나 확대하면 그 지역 지도가 열리고(+ 맛집 검색),
// 지도를 충분히 축소하면 다시 지구본으로 돌아온다.
export default function GeoPanel({ items, selected, onSelect, onAreaSearch, onReset, onBounds, onMoving, navTo, loading, limit }) {
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

  // 나라 필터 + 검색 → 그 나라로 이동 (리셋 없이, Home 이 이미 검색 커밋)
  const prevNav = useRef(null)
  useEffect(() => {
    if (navTo && navTo !== prevNav.current) {
      if (view === 'globe') enterWithFly(navTo.center, () => openRegion(navTo))
      else openRegion(navTo)
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
            searching={loading}
            limit={limit}
            initialCenter={mapStart?.center}
            initialZoom={mapStart?.zoom}
          />
        </div>
      )}
    </div>
  )
}
