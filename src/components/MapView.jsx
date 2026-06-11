import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import VectorBasemap from './VectorBasemap.jsx'

const AREA_MIN_ZOOM = 12 // 이보다 멀면(축소) 검색 비활성 — 동네 단위로 확대해야 검색

// 기본: 노란 원 / 저장된 곳: 별 모양 (SVG). i = 등장 순서(스태거 애니메이션용)
// animate=false 면 팝 애니메이션 없이 즉시 표시(이미 떠 있던 마커 → 재검색 시 다시 안 튕김)
function makeIcon(d, i, animate = true) {
  const saved = !!d.saved
  const shape = saved
    ? `<circle cx="12" cy="12" r="9" fill="#f5a623" stroke="#fff" stroke-width="2"/>` +
      `<path d="M12 6.4l1.6 3.34 3.68.32-2.79 2.43.84 3.6L12 14.2 8.67 16.1l.84-3.6-2.79-2.43 3.68-.32z" fill="#fff"/>`
    : `<circle cx="12" cy="12" r="8.5" fill="#ffce3a" stroke="#fff" stroke-width="2.5"/>`
  const inner = animate
    ? `<div class="mk3" style="animation-delay:${(i || 0) * 55}ms">`
    : `<div class="mk-static">`
  return L.divIcon({
    className: 'mk-wrap',
    html: `${inner}<svg viewBox="0 0 24 24" width="22" height="22">${shape}</svg></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

const KR_CENTER = [36.2, 127.8] // 대한민국 중앙 부근
const KR_ZOOM = 7
const MAP_MIN_ZOOM = 6.5 // 진입 줌(7)에서 한 단계만 축소해도 지구본으로 복귀

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
        const size = map.getSize()
        const mp = map.project([d.lat, d.lng], z)
        let center = [d.lat, d.lng]
        if (size.x > 820) {
          // 데스크탑: 왼쪽 리스트/상세 패널을 피해 오른쪽으로
          center = map.unproject(L.point(mp.x - LEFT_PANEL_PX / 2, mp.y), z)
        } else {
          // 모바일: 아래 바텀시트에 가리지 않게 마커를 화면 위쪽(약 28%)으로
          center = map.unproject(L.point(mp.x, mp.y + size.y * 0.22), z)
        }
        map.flyTo(center, z, { duration: 0.6 })
      }
    }
    prev.current = selected
  }, [selected, items, map])
  return null
}

// 줌/이동 감시: 현재 줌·영역 보고 + 너무 축소하면 지구본으로 복귀
function ZoomWatcher({ onZoomOut, onZoom, onBounds, onMoving }) {
  const report = (map) => {
    if (!onBounds) return
    const b = map.getBounds()
    onBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
  }
  const map = useMapEvents({
    movestart() { onMoving && onMoving(true) },
    zoomstart() { onMoving && onMoving(true) },
    zoomend() {
      const z = map.getZoom()
      onZoom && onZoom(z)
      report(map)
      onMoving && onMoving(false)
      if (z <= MAP_MIN_ZOOM) {
        const c = map.getCenter()
        onZoomOut && onZoomOut([c.lng, c.lat]) // [lng, lat]
      }
    },
    moveend() { report(map); onMoving && onMoving(false) },
  })
  useEffect(() => { report(map) }, []) // 최초 1회
  return null
}

export default function MapView({ items, selected, onSelect, onZoomOut, onSearchArea, onBounds, onMoving, searching, limit = 10, initialCenter, initialZoom }) {
  const valid = (items || []).filter((d) => d.lat != null && d.lng != null)
  const points = valid.map((d) => [d.lat, d.lng])
  const mapRef = useRef(null)
  const [zoom, setZoom] = useState(initialZoom || KR_ZOOM)
  const canSearch = zoom >= AREA_MIN_ZOOM
  // 아이콘은 items 가 바뀔 때만 새로 만든다(선택 변화로 깜빡이지 않게).
  // 새로 등장한 마커만 팝 애니메이션(이미 떠 있던 마커는 재검색 시 다시 안 튕김 → "검색 2번" 버그 방지).
  const seenRef = useRef(new Set())
  const icons = useMemo(() => {
    const m = new Map()
    ;(items || []).filter((d) => d.lat != null && d.lng != null).forEach((d, i) => {
      m.set(d.id, makeIcon(d, i, !seenRef.current.has(d.id)))
    })
    return m
  }, [items])
  useEffect(() => {
    ;(items || []).forEach((d) => { if (d.id != null) seenRef.current.add(d.id) })
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
      minZoom={6.5}
      zoomSnap={0.5}
      zoomDelta={0.5}
      scrollWheelZoom
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <VectorBasemap />
      <FitBounds points={points} skip={!!initialCenter} />
      <FocusOnSelect items={valid} selected={selected} />
      <ZoomWatcher onZoomOut={onZoomOut} onZoom={setZoom} onBounds={onBounds} onMoving={onMoving} />
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
      canSearch ? (
        <button className="area-search" onClick={searchHere} disabled={searching}>
          {searching ? <><span className="spin" />검색 중…</> : `📍 이 지역에서 TOP ${limit} 보기`}
        </button>
      ) : (
        <div className="area-search hint">
          🔍 더 확대하면 이 지역 TOP {limit}을 볼 수 있어요
        </div>
      )
    )}
   </>
  )
}
