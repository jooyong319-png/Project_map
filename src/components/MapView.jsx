import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import VectorBasemap from './VectorBasemap.jsx'

// 기본: 노란 원 / 저장된 곳: 별 모양 (SVG). i = 등장 순서(스태거 애니메이션용)
function makeIcon(d, i) {
  const saved = !!d.saved
  const shape = saved
    ? `<circle cx="12" cy="12" r="9" fill="#f5a623" stroke="#fff" stroke-width="2"/>` +
      `<path d="M12 6.4l1.6 3.34 3.68.32-2.79 2.43.84 3.6L12 14.2 8.67 16.1l.84-3.6-2.79-2.43 3.68-.32z" fill="#fff"/>`
    : `<circle cx="12" cy="12" r="8.5" fill="#ffce3a" stroke="#fff" stroke-width="2.5"/>`
  return L.divIcon({
    className: 'mk-wrap',
    html: `<div class="mk3" style="animation-delay:${(i || 0) * 55}ms"><svg viewBox="0 0 24 24" width="22" height="22">${shape}</svg></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

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

// 선택(리스트/마커 클릭)이 바뀌면 그 위치로 지도 포커스.
// 왼쪽 리스트/상세 패널에 가려지지 않게, 마커를 오른쪽(보이는 영역)으로 오프셋한다.
const LEFT_PANEL_PX = 726 // 리스트(좌)+상세 패널이 가리는 왼쪽 폭
function FocusOnSelect({ items, selected }) {
  const map = useMap()
  const prev = useRef(null)
  useEffect(() => {
    if (selected && selected !== prev.current) {
      const d = items.find((x) => x.id === selected)
      if (d && d.lat != null && d.lng != null) {
        const z = Math.max(map.getZoom(), 15)
        let center = [d.lat, d.lng]
        // 지도가 충분히 넓을 때만 오프셋(모바일/좁은 화면 제외)
        if (map.getSize().x > 820) {
          const mp = map.project([d.lat, d.lng], z)
          center = map.unproject(L.point(mp.x - LEFT_PANEL_PX / 2, mp.y), z)
        }
        map.flyTo(center, z, { duration: 0.6 })
      }
    }
    prev.current = selected
  }, [selected, items, map])
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
  // 아이콘은 items 가 바뀔 때만 새로 만든다(선택 변화로 깜빡이지 않게). 새 결과마다 스태거 팝 애니메이션.
  const icons = useMemo(() => {
    const m = new Map()
    ;(items || []).filter((d) => d.lat != null && d.lng != null).forEach((d, i) => m.set(d.id, makeIcon(d, i)))
    return m
  }, [items])
  const selItem = valid.find((d) => d.id === selected)

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
      <VectorBasemap />
      <FitBounds points={points} skip={!!initialCenter} />
      <FocusOnSelect items={valid} selected={selected} />
      <ZoomWatcher onZoomOut={onZoomOut} />
      {selItem && (
        <CircleMarker
          center={[selItem.lat, selItem.lng]}
          radius={16}
          pathOptions={{ color: '#f0792e', weight: 3, opacity: 0.95, fillOpacity: 0 }}
        />
      )}
      {valid.map((d) => (
        <Marker
          key={d.id}
          position={[d.lat, d.lng]}
          icon={icons.get(d.id)}
          eventHandlers={{ click: () => onSelect && onSelect(d) }}
        >
          <Tooltip direction="top" offset={[0, -12]}>
            <b>{d.saved ? '⭐ ' : ''}{d.icon} {d.name}</b>
            <br />
            ⭐ {d.rating} · 리뷰 {d.reviews?.toLocaleString?.() ?? d.reviews}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
    {onSearchArea && (
      <button className="area-search" onClick={searchHere} disabled={searching}>
        {searching ? <><span className="spin" />검색 중…</> : '📍 이 지역에서 TOP 10 보기'}
      </button>
    )}
   </>
  )
}
