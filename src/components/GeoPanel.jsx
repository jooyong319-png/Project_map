import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import MapView from './MapView.jsx'

// 위치 획득 — 앱은 Capacitor 플러그인(런타임 권한 요청 포함), 웹은 navigator.geolocation
function getPosition() {
  const opts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  if (Capacitor.isNativePlatform()) {
    return (async () => {
      const perm = await Geolocation.requestPermissions()
      if (perm.location === 'denied' && perm.coarseLocation === 'denied') throw new Error('permission denied')
      return Geolocation.getCurrentPosition(opts) // { coords:{latitude,longitude} }
    })()
  }
  if (!navigator.geolocation) return Promise.reject(new Error('unsupported'))
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts))
}

// 지도 패널 — 처음부터 한국 지도. (예전 지구본은 2026-10 정리 때 제거: 해외는 데이터가 없음)
export default function GeoPanel({ items, selected, onSelect, onAreaSearch, onBounds, onMoving, onZoom, navTo, loading, limit, kind, course, courseLoading, onCourse }) {
  const [myLoc, setMyLoc] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locErr, setLocErr] = useState('')
  const locateMe = () => {
    setLocating(true)
    setLocErr('')
    getPosition().then(
      (pos) => { setLocating(false); setMyLoc([pos.coords.latitude, pos.coords.longitude]) },
      () => { setLocating(false); setLocErr('위치를 가져오지 못했어요. 권한을 확인해 주세요.'); setTimeout(() => setLocErr(''), 2500) },
    )
  }

  // 지역 이동 신호(navTo) → 지도 flyTo (도착(moveend) 후 Home 이 검색·코스)
  const [mapFly, setMapFly] = useState(null)
  const prevNav = useRef(null)
  useEffect(() => {
    if (navTo && navTo !== prevNav.current) setMapFly({ center: navTo.center, zoom: navTo.zoom })
    prevNav.current = navTo
  }, [navTo])

  return (
    <div className="mapwrap">
      <div className="geo-layer">
        <MapView
          items={items}
          selected={selected}
          onSelect={onSelect}
          onSearchArea={onAreaSearch}
          onBounds={onBounds}
          onMoving={onMoving}
          onZoom={onZoom}
          myLoc={myLoc}
          flyTarget={mapFly}
          searching={loading}
          kind={kind}
          limit={limit}
          course={course}
          onCourse={onCourse}
          courseLoading={courseLoading}
        />
      </div>
      <button className="locate-btn" onClick={locateMe} disabled={locating} title="내 위치" aria-label="내 위치">
        {locating ? <span className="spin dark" /> : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
          </svg>
        )}
      </button>
      {locErr && <div className="detail-toast" style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)' }}>{locErr}</div>}
    </div>
  )
}
