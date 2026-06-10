import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const KR_CENTER = [36.2, 127.8] // 대한민국 중앙 부근
const KR_ZOOM = 7
const MAP_MIN_ZOOM = 5 // 이보다 더 축소하면 지구본으로 복귀

// items 가 바뀌면 마커들이 보이도록 지도 영역을 맞춘다.
// (지구본에서 전환되어 들어온 경우 initialCenter 가 있으므로 자동 맞춤은 생략)
function FitBounds({ points, skip }) {
  const map = useMap()
  useEffect(() => {
    if (skip || !points.length) return
    if (points.length === 1) map.setView(points[0], 14)
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
  }, [points, skip, map])
  return null
}

// 너무 축소하면 지구본으로 복귀
function ZoomWatcher({ onZoomOut }) {
  const map = useMapEvents({
    zoomend() {
      if (map.getZoom() <= MAP_MIN_ZOOM) {
        const c = map.getCenter()
        onZoomOut && onZoomOut([c.lng, c.lat]) // [lng, lat]
      }
    },
  })
  return null
}

export default function MapView({ items, selected, onSelect, onZoomOut, onSearchArea, searching, initialCenter, initialZoom }) {
  const valid = (items || []).filter((d) => d.lat != null && d.lng != null)
  const points = valid.map((d) => [d.lat, d.lng])
  const mapRef = useRef(null)

  // 지금 보고 있는 지도 영역(bbox)으로 TOP 10 재검색
  const searchHere = () => {
    const map = mapRef.current
    if (!map || !onSearchArea) return
    const b = map.getBounds()
    onSearchArea([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
  }

  return (
   <>
    <MapContainer
      ref={mapRef}
      center={initialCenter || KR_CENTER}
      zoom={initialZoom || KR_ZOOM}
      minZoom={3}
      zoomSnap={0.5}
      zoomDelta={0.5}
      scrollWheelZoom
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <FitBounds points={points} skip={!!initialCenter} />
      <ZoomWatcher onZoomOut={onZoomOut} />
      {valid.map((d) => {
        const sel = selected === d.id
        return (
          <CircleMarker
            key={d.id}
            center={[d.lat, d.lng]}
            radius={sel ? 10 : 7}
            pathOptions={{
              color: sel ? '#f0792e' : '#fff',
              weight: sel ? 3 : 1.6,
              fillColor: sel ? '#fff' : d.color,
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect && onSelect(d) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <b>{d.icon} {d.name}</b>
              <br />
              ⭐ {d.rating} · 리뷰 {d.reviews?.toLocaleString?.() ?? d.reviews}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
    {onSearchArea && (
      <button className="area-search" onClick={searchHere} disabled={searching}>
        {searching ? '검색 중…' : '📍 이 지역에서 TOP 10 보기'}
      </button>
    )}
   </>
  )
}
