import { useEffect, useRef } from 'react'
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo'
import { feature } from 'topojson-client'
import worldData from 'world-atlas/countries-110m.json'
import { COUNTRIES } from '../data/countries.js'

const land = feature(worldData, worldData.objects.countries)
const graticule = geoGraticule10()
const IDLE_MS = 3500 // 이 시간 이상 가만두면 자동 회전 재개

export default function Globe({ items, selected, onSelect, onCountryClick, onZoomThrough, onMoving, flyTo, onFlyDone, initialCenter, initialScale }) {
  const canvasRef = useRef(null)
  const propsRef = useRef({})
  propsRef.current = { items, selected, onSelect, onCountryClick, onZoomThrough, onMoving, onFlyDone }
  const stateRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const projection = geoOrthographic()
      .clipAngle(90)
      .rotate(initialCenter ? [-initialCenter[0], -initialCenter[1]] : [-127.5, -36])
    const path = geoPath(projection, ctx)
    const home = projection.rotate() // 한국 중심 홈 회전값(자동 모션이 여기서 멀어지지 않게)

    const st = {
      W: 0, H: 0,
      fit: 200, min: 150, max: 800,
      targetScale: 0,
      vx: 0, vy: 0,            // 드래그 관성 속도(도/프레임)
      dragging: false, moved: false, lastPt: null,
      pointers: new Map(), pinchDist: 0,
      homeLon: home[0], homeLat: home[1], hoverIdx: -1,
      now: 0, lastInteract: initialCenter ? performance.now() : 0,
      transitioned: false, raf: 0, alive: true,
    }
    stateRef.current = st

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const W = Math.max(1, rect.width)
      const H = Math.max(1, rect.height)
      const dpr = window.devicePixelRatio || 1
      st.W = W; st.H = H
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      projection.translate([W / 2, H / 2])
      const fit = Math.min(W, H) * 0.46
      st.fit = fit; st.min = fit * 0.78; st.max = fit * 6
      if (!st.targetScale) {
        const s0 = initialScale ? Math.min(Math.max(initialScale, st.min), st.max) : fit
        st.targetScale = s0
        projection.scale(s0)
      } else {
        st.targetScale = Math.min(Math.max(st.targetScale, st.min), st.max)
      }
    }

    function draw() {
      const W = st.W, H = st.H
      const R = projection.scale()
      const cx = W / 2, cy = H / 2
      ctx.clearRect(0, 0, W, H)

      // 대기광 (구체 바깥 글로우)
      const glow = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.2)
      glow.addColorStop(0, 'rgba(150,200,250,0.45)')
      glow.addColorStop(1, 'rgba(150,200,250,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, 2 * Math.PI); ctx.fill()

      // 바다(구체) — 밝은 지도 느낌의 연한 하늘색 + 입체감
      const ocean = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R)
      ocean.addColorStop(0, '#dcefff')
      ocean.addColorStop(0.55, '#aedcf3')
      ocean.addColorStop(1, '#8ec6e6')
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI)
      ctx.fillStyle = ocean; ctx.fill()

      // 위경도 그리드
      ctx.beginPath(); path(graticule)
      ctx.strokeStyle = 'rgba(90,140,180,0.18)'; ctx.lineWidth = 0.5; ctx.stroke()

      // 육지 — 밝은 지도 느낌의 베이지
      ctx.beginPath(); path(land)
      ctx.fillStyle = '#f4efe2'; ctx.fill()
      ctx.strokeStyle = '#d8ccb2'; ctx.lineWidth = 0.5; ctx.stroke()

      // 입체 음영 (좌상단 하이라이트, 우하단 살짝 그림자 — 밝게 유지)
      const shade = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.2, cx, cy, R)
      shade.addColorStop(0, 'rgba(255,255,255,0.30)')
      shade.addColorStop(0.55, 'rgba(255,255,255,0)')
      shade.addColorStop(1, 'rgba(40,70,100,0.22)')
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI)
      ctx.fillStyle = shade; ctx.fill()

      const rot = projection.rotate()
      const center = [-rot[0], -rot[1]]

      // (지구본 상태에선 개별 맛집 위치는 표시하지 않음 — 지도로 들어가면 마커로 보임)

      // 지역 핀 (맥동 링 + 라벨)
      const pulse = (Math.sin(st.now / 450) + 1) / 2 // 0..1
      ctx.textAlign = 'center'
      ctx.font = '700 13px system-ui, sans-serif'
      ctx.lineJoin = 'round'
      for (let i = 0; i < COUNTRIES.length; i++) {
        const c = COUNTRIES[i]
        if (geoDistance(c.center, center) >= Math.PI / 2) continue
        const p = projection(c.center); if (!p) continue
        const x = p[0], y = p[1]
        const hovered = i === st.hoverIdx
        // 호버 시 클릭될 곳임을 강조 (흰 글로우 링)
        if (hovered) {
          ctx.beginPath(); ctx.arc(x, y, 16, 0, 2 * Math.PI)
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill()
        }
        ctx.beginPath(); ctx.arc(x, y, 11 + pulse * 13, 0, 2 * Math.PI)
        ctx.fillStyle = `rgba(240,121,46,${0.28 * (1 - pulse)})`; ctx.fill()
        ctx.beginPath(); ctx.arc(x, y, hovered ? 11 : 9, 0, 2 * Math.PI)
        ctx.fillStyle = '#f0792e'; ctx.fill()
        ctx.lineWidth = hovered ? 3 : 2; ctx.strokeStyle = '#fff'; ctx.stroke()
        ctx.font = hovered ? '800 14px system-ui, sans-serif' : '700 13px system-ui, sans-serif'
        ctx.lineWidth = 3.5; ctx.strokeStyle = '#0a1428'; ctx.strokeText(c.name, x, y - 18)
        ctx.fillStyle = '#fff'; ctx.fillText(c.name, x, y - 18)
      }
    }
    st.draw = draw

    // 클릭/호버 인식 반경: 지구본 배율에 비례(축소될수록 작게)
    function hitR() { return Math.max(12, Math.min(45, 24 * projection.scale() / st.fit)) }

    function handleTap(clientX, clientY) {
      const rect = canvas.getBoundingClientRect()
      const mx = clientX - rect.left, my = clientY - rect.top
      // 구체(글로브) 밖 클릭(우주)은 무시
      const R = projection.scale()
      const cx = st.W / 2, cy = st.H / 2
      if ((mx - cx) ** 2 + (my - cy) ** 2 > R * R) return
      const rot = projection.rotate()
      const center = [-rot[0], -rot[1]]
      // 앞면 핀 중 클릭 지점에서 가장 가까운 것. 단 핀 근처(70px)를 눌렀을 때만 진입.
      let best = null, bestD = Infinity
      for (let i = 0; i < COUNTRIES.length; i++) {
        const c = COUNTRIES[i]
        if (geoDistance(c.center, center) >= Math.PI / 2) continue
        const p = projection(c.center); if (!p) continue
        const d = (p[0] - mx) ** 2 + (p[1] - 8 - my) ** 2
        if (d < bestD) { bestD = d; best = c }
      }
      const hr = hitR()
      if (best && bestD <= hr * hr) propsRef.current.onCountryClick && propsRef.current.onCountryClick(best)
    }

    function zoomBy(factor) {
      if (st.transitioned) return
      st.lastInteract = st.now || performance.now()
      // 이미 최대치인데 더 확대 → 보고 있는 중심에서 가장 가까운 나라 지도로 전환
      if (factor > 1 && st.targetScale >= st.max - 0.5) {
        st.transitioned = true
        const rot = projection.rotate()
        const center = [-rot[0], -rot[1]]
        let best = COUNTRIES[0], bestD = Infinity
        for (const c of COUNTRIES) {
          const d = geoDistance(c.center, center)
          if (d < bestD) { bestD = d; best = c }
        }
        propsRef.current.onZoomThrough && propsRef.current.onZoomThrough(best)
        return
      }
      st.targetScale = Math.min(Math.max(st.targetScale * factor, st.min), st.max)
    }
    st.zoomBy = zoomBy

    function onDown(e) {
      st.pointers.set(e.pointerId, [e.clientX, e.clientY])
      st.lastInteract = st.now
      st.vx = st.vy = 0
      st.hoverIdx = -1 // 드래그 시작하면 호버 해제
      propsRef.current.onMoving && propsRef.current.onMoving(true) // 조작 중 → 패널 반투명
      if (st.pointers.size === 1) {
        st.dragging = true; st.moved = false; st.lastPt = [e.clientX, e.clientY]; st.downPt = [e.clientX, e.clientY]
      } else if (st.pointers.size === 2) {
        st.dragging = false
        const v = [...st.pointers.values()]
        st.pinchDist = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1])
      }
      try { canvas.setPointerCapture(e.pointerId) } catch (_) {}
    }
    // 호버: 커서 근처(35px) 핀을 찾아 하이라이트 + 커서 변경 + 자전 일시정지
    function updateHover(clientX, clientY) {
      const rect = canvas.getBoundingClientRect()
      const mx = clientX - rect.left, my = clientY - rect.top
      const R = projection.scale()
      const cx = st.W / 2, cy = st.H / 2
      let idx = -1
      if ((mx - cx) ** 2 + (my - cy) ** 2 <= R * R) {
        const rot = projection.rotate()
        const center = [-rot[0], -rot[1]]
        const hr = hitR()
        let bestD = hr * hr
        for (let i = 0; i < COUNTRIES.length; i++) {
          const c = COUNTRIES[i]
          if (geoDistance(c.center, center) >= Math.PI / 2) continue
          const p = projection(c.center); if (!p) continue
          const d = (p[0] - mx) ** 2 + (p[1] - 8 - my) ** 2
          if (d <= bestD) { bestD = d; idx = i }
        }
      }
      if (idx !== st.hoverIdx) {
        st.hoverIdx = idx
        canvas.style.cursor = idx >= 0 ? 'pointer' : ''
      }
      if (idx >= 0) st.lastInteract = st.now // 핀 조준 중엔 자전 멈춤
    }
    function onMove(e) {
      if (!st.pointers.has(e.pointerId)) { updateHover(e.clientX, e.clientY); return }
      st.pointers.set(e.pointerId, [e.clientX, e.clientY])
      st.lastInteract = st.now
      // 두 손가락 → 핀치 줌
      if (st.pointers.size >= 2) {
        const v = [...st.pointers.values()]
        const dist = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1])
        if (st.pinchDist) zoomBy(dist / st.pinchDist)
        st.pinchDist = dist
        return
      }
      if (!st.dragging) return
      const dx = e.clientX - st.lastPt[0]
      const dy = e.clientY - st.lastPt[1]
      if (Math.abs(dx) + Math.abs(dy) > 3) st.moved = true
      const k = 0.4 * (st.fit / projection.scale()) // 확대할수록 천천히
      const r = projection.rotate()
      projection.rotate([r[0] + dx * k, Math.max(-90, Math.min(90, r[1] - dy * k))])
      st.vx = dx * k; st.vy = -dy * k // 관성용
      st.lastPt = [e.clientX, e.clientY]
    }
    function onUp(e) {
      if (!st.pointers.has(e.pointerId)) return
      st.pointers.delete(e.pointerId)
      try { canvas.releasePointerCapture(e.pointerId) } catch (_) {}
      if (st.pointers.size < 2) st.pinchDist = 0
      if (st.pointers.size === 0) {
        st.dragging = false
        st.lastInteract = st.now
        if (!st.moved) st.vx = st.vy = 0 // 탭이면 관성 제거
        propsRef.current.onMoving && propsRef.current.onMoving(false)
      }
    }
    // 탭은 네이티브 click 으로 처리. 누른 곳과 뗀 곳 거리가 작으면(손떨림 허용) 탭으로 간주.
    function onClick(e) {
      const dp = st.downPt
      if (dp) {
        const dx = e.clientX - dp[0], dy = e.clientY - dp[1]
        if (dx * dx + dy * dy > 12 * 12) return
      }
      handleTap(e.clientX, e.clientY)
    }
    function onWheel(e) {
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.12 : 0.89)
      propsRef.current.onMoving && propsRef.current.onMoving(true)
      clearTimeout(st.wheelT)
      st.wheelT = setTimeout(() => { propsRef.current.onMoving && propsRef.current.onMoving(false) }, 220)
    }

    function onLeave() { if (st.hoverIdx !== -1) { st.hoverIdx = -1; canvas.style.cursor = '' } }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // 특정 좌표로 회전+확대해 날아가기 (클릭 진입 연출)
    st.startFly = (lng, lat) => {
      const r = projection.rotate()
      let dLon = ((-lng - r[0] + 540) % 360) - 180 // 최단 경로
      st.fly = { r0: r[0], r1: r[1], toLon: r[0] + dLon, toLat: -lat, s0: projection.scale(), s1: st.max, t0: performance.now(), done: false }
    }

    function frame(now) {
      if (!st.alive) return
      st.now = now
      // 진입 연출 중이면 회전+확대만 보간하고 나머진 스킵
      if (st.fly && !st.fly.done) {
        const f = st.fly
        const p = Math.min(1, (now - f.t0) / 850)
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2 // easeInOutCubic
        projection.rotate([f.r0 + (f.toLon - f.r0) * e, f.r1 + (f.toLat - f.r1) * e])
        projection.scale(f.s0 + (f.s1 - f.s0) * e)
        draw()
        if (p >= 1) { f.done = true; propsRef.current.onFlyDone && propsRef.current.onFlyDone() }
        st.raf = requestAnimationFrame(frame)
        return
      }
      // 줌 이징
      const cur = projection.scale()
      if (Math.abs(st.targetScale - cur) > 0.05) projection.scale(cur + (st.targetScale - cur) * 0.18)
      // 관성 / 자동 회전 (손 뗀 상태에서만)
      if (!st.dragging && st.pointers.size === 0) {
        if (Math.abs(st.vx) > 0.02 || Math.abs(st.vy) > 0.02) {
          const r = projection.rotate()
          projection.rotate([r[0] + st.vx, Math.max(-90, Math.min(90, r[1] + st.vy))])
          st.vx *= 0.92; st.vy *= 0.92
        } else {
          st.vx = st.vy = 0
          // 가만두면 천천히 자전 (여러 나라가 돌아가며 앞면에 보이게)
          if (now - st.lastInteract > IDLE_MS && st.targetScale <= st.fit * 1.05 && !st.transitioned) {
            const r = projection.rotate()
            projection.rotate([r[0] + 0.06, r[1] + (st.homeLat - r[1]) * 0.01])
          }
        }
      }
      draw()
      st.raf = requestAnimationFrame(frame)
    }
    st.raf = requestAnimationFrame(frame)

    return () => {
      st.alive = false
      cancelAnimationFrame(st.raf)
      clearTimeout(st.wheelT)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // flyTo 가 지정되면 그 좌표로 날아가는 연출 시작
  useEffect(() => {
    const st = stateRef.current
    if (st && st.startFly && flyTo) st.startFly(flyTo.lng, flyTo.lat)
  }, [flyTo])

  const zoom = (factor) => { stateRef.current && stateRef.current.zoomBy(factor) }

  return (
    <>
      <canvas ref={canvasRef} className="globe-canvas" />
      <div className="globe-hint">지구본을 돌려 나라를 클릭하면 지도로 들어가요 📍</div>
      <div className="zoom">
        <div onClick={() => zoom(1.25)}>＋</div>
        <div onClick={() => zoom(0.8)}>－</div>
      </div>
    </>
  )
}
