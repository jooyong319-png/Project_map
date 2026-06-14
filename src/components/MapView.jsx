import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import VectorBasemap from './VectorBasemap.jsx'
import { KINDS } from '../data/kinds.js'

const AREA_MIN_ZOOM = 12 // 이보다 멀면(축소) 검색 비활성 — 동네 단위로 확대해야 검색

// 현재 위치 마커(파란 점 + 펄스)
const LOC_ICON = L.divIcon({
  className: 'mk-wrap',
  html: '<div class="myloc"><span class="myloc-pulse"></span></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

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

// AI 코스 번호 핀 (종류별 색)
const COURSE_COLOR = { food: '#f0792e', travel: '#2ea36b', stay: '#7c5cff' }
function courseIcon(order, kind, active) {
  const c = COURSE_COLOR[kind] || '#f0792e'
  return L.divIcon({
    className: 'mk-wrap',
    html: `<div class="course-pin${active ? ' on' : ''}" style="background:${c}">${order}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  })
}

// 코스가 정해지면 그 동선 전체가 보이게 영역 맞춤
function FitCourse({ stops }) {
  const map = useMap()
  const ref = useRef(null)
  useEffect(() => {
    if (!stops?.length) return
    const key = stops.map((s) => s.id).join(',')
    if (key === ref.current) return
    ref.current = key
    const pts = stops.map((s) => [s.lat, s.lng])
    if (pts.length === 1) map.setView(pts[0], 15)
    else map.fitBounds(pts, { padding: [70, 70], maxZoom: 16 })
  }, [stops, map])
  return null
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
  useEffect(() => { report(map); onZoom && onZoom(map.getZoom()) }, []) // 최초 1회(줌·영역 보고)
  return null
}

// 내 위치가 바뀌면 그 좌표로 부드럽게 이동
// (마운트 시엔 안 움직이게 prev 를 현재 loc 으로 초기화 — 나라 이동 등으로 리마운트돼도 내 위치로 안 튐)
function FlyToLoc({ loc }) {
  const map = useMap()
  const prev = useRef(loc)
  useEffect(() => {
    if (loc && loc !== prev.current) {
      map.flyTo(loc, Math.max(map.getZoom(), 15), { duration: 0.8 })
    }
    prev.current = loc
  }, [loc, map])
  return null
}

// 지역(필터) 이동 — 그 좌표/줌으로 부드럽게 flyTo. 도착(moveend) 후 검색이 트리거됨.
function FlyToRegion({ target }) {
  const map = useMap()
  const prev = useRef(target)
  useEffect(() => {
    if (target && target !== prev.current) {
      map.flyTo([target.center[1], target.center[0]], target.zoom, { duration: 0.9 })
    }
    prev.current = target
  }, [target, map])
  return null
}

export default function MapView({ items, selected, onSelect, onZoomOut, onSearchArea, onBounds, onMoving, myLoc, flyTarget, searching, kind = 'food', limit = 10, initialCenter, initialZoom, course, onZoom }) {
  const courseStops = course?.stops || []
  const hasCourse = courseStops.length > 0
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

  // 지금 보고 있는 지도 영역(bbox)으로 그 카테고리 재검색
  const searchHere = (k) => {
    const map = mapRef.current
    if (!map || !onSearchArea) return
    const b = map.getBounds()
    onSearchArea([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], k)
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
      <ZoomWatcher onZoomOut={onZoomOut} onZoom={(z) => { setZoom(z); onZoom && onZoom(z) }} onBounds={onBounds} onMoving={onMoving} />
      <FlyToLoc loc={myLoc} />
      <FlyToRegion target={flyTarget} />
      <FitCourse stops={courseStops} />
      {hasCourse && (
        <>
          <Polyline
            positions={courseStops.map((s) => [s.lat, s.lng])}
            pathOptions={{ color: '#f0792e', weight: 3, opacity: 0.7, dashArray: '6 8' }}
          />
          {courseStops.map((s) => (
            <Marker
              key={`c_${s.id}`}
              position={[s.lat, s.lng]}
              icon={courseIcon(s.order, s.kind, selected === s.id)}
              eventHandlers={{ click: () => onSelect && onSelect(s) }}
              zIndexOffset={1000}
            >
              <Tooltip direction="top" offset={[0, -28]}>
                <b>{s.order}. {s.name}</b>
              </Tooltip>
            </Marker>
          ))}
        </>
      )}
      {selItem && !hasCourse && (
        <CircleMarker
          center={[selItem.lat, selItem.lng]}
          radius={16}
          pathOptions={{ color: '#f0792e', weight: 3, opacity: 0.95, fillOpacity: 0 }}
        />
      )}
      {myLoc && <Marker position={myLoc} icon={LOC_ICON} interactive={false} keyboard={false} />}
      {!hasCourse && valid.map((d) => (
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
    {onSearchArea && canSearch && (
      <div className="area-search-wrap">
        <div className="area-bubble">{searching ? '검색 중…' : '📍 이 지역에서 찾기'}</div>
        <div className="area-search-seg">
          {KINDS.map((k) => (
            <button
              key={k.key}
              className={`area-seg-btn ${kind === k.key ? 'on' : ''}`}
              onClick={() => searchHere(k.key)}
              disabled={searching}
            >
              <span className="area-seg-ic">{k.icon}</span>{k.label}
            </button>
          ))}
        </div>
      </div>
    )}
   </>
  )
}
