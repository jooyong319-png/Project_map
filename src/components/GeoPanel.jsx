import { useState } from 'react'
import Globe from './Globe.jsx'
import MapView from './MapView.jsx'
import { DEFAULT_REGION } from '../data/countries.js'

// 지구본에서 지역 핀을 클릭하거나 확대하면 그 지역 지도가 열리고(+ 맛집 검색),
// 지도를 충분히 축소하면 다시 지구본으로 돌아온다.
export default function GeoPanel({ items, selected, onSelect, onCountrySearch, onAreaSearch, loading }) {
  const [view, setView] = useState('globe') // 'globe' | 'map'
  const [globeStart, setGlobeStart] = useState(null) // { center:[lng,lat], scale }
  const [mapStart, setMapStart] = useState(null) // { center:[lat,lng], zoom }
  const [seq, setSeq] = useState(0) // 전환마다 키를 바꿔 강제 리마운트

  // 지역 지도 열기 + 맛집 검색
  const openRegion = (c) => {
    setMapStart({ center: [c.center[1], c.center[0]], zoom: c.zoom })
    setSeq((s) => s + 1)
    setView('map')
    onCountrySearch && onCountrySearch(c)
  }

  // 핀 클릭 → 그 지역 / 어디서 확대하든 → 기본 지역(한국)
  const handleCountryClick = (c) => openRegion(c)
  const handleZoomThrough = () => openRegion(DEFAULT_REGION)

  // 지도 최소 축소 → 그 좌표로 지구본 복귀
  const handleMapZoomOut = (centerLngLat) => {
    setGlobeStart({ center: centerLngLat, scale: 480 })
    setSeq((s) => s + 1)
    setView('globe')
  }

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
            searching={loading}
            initialCenter={mapStart?.center}
            initialZoom={mapStart?.zoom}
          />
        </div>
      )}
    </div>
  )
}
