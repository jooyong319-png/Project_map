import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FilterBar from '../components/FilterBar.jsx'
import RestaurantList from '../components/RestaurantList.jsx'
import GeoPanel from '../components/GeoPanel.jsx'
import DetailModal from '../components/DetailModal.jsx'
import StartPanel from '../components/StartPanel.jsx'
import CourseView from '../components/CourseView.jsx'
import { getRestaurants, getCourse } from '../lib/places.js'

const REGION_FOCUS_BOOST = 1.5 // 지역 선택 후 이동 시 추가로 줌인하는 양

// AI 코스: 기기별 하루 AI_PER_DAY 회. 오늘 날짜+횟수를 localStorage에 기록. (서버 쪽 제한은 2단계에서)
const AI_PER_DAY = 5
const AI_KEY = 'ai_free_v2'
const aiToday = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` } // 기기 로컬 날짜(KST 자정 초기화)
function aiCount() { try { const v = JSON.parse(localStorage.getItem(AI_KEY) || '{}'); return v.d === aiToday() ? v.n || 0 : 0 } catch { return 0 } }
function aiUsedUp() { return aiCount() >= AI_PER_DAY }
function markAiUsed() { try { localStorage.setItem(AI_KEY, JSON.stringify({ d: aiToday(), n: aiCount() + 1 })) } catch {} }

const NOUN = { all: '장소', food: '맛집', travel: '관광지', stay: '숙소' }

export default function Home() {
  const [kind, setKind] = useState('food') // 검색 종류: food/travel/stay
  const [headerSlot, setHeaderSlot] = useState(null) // 헤더의 검색바 포털 위치
  useEffect(() => { setHeaderSlot(document.getElementById('header-search-slot')) }, [])
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState([]) // 검색바 자동완성(가게)
  const pickedRef = useRef(false) // 자동완성 선택 직후 재조회 방지
  const suppressSuggestRef = useRef(false) // 검색 직후 디바운스 타이머가 자동완성 다시 띄우는 것 방지
  const [limit, setLimit] = useState(50) // 보여줄 개수 50/100/200
  const [items, setItems] = useState([])
  const [search, setSearch] = useState({ q: '', bbox: null, lim: 50, tick: 0 }) // 커밋된 검색 조건
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const [listOpen, setListOpen] = useState(true) // 왼쪽 패널 접기/펼치기
  const [filtersOpen, setFiltersOpen] = useState(false) // 검색·필터 패널
  const [peek, setPeek] = useState(false) // 검색 시 잠깐 패널 반투명(지도 들여다보기)
  const [mapMoving, setMapMoving] = useState(false) // 지도 이동/줌 중 → 리스트·상세 반투명

  const [notice, setNotice] = useState('') // 잠깐 뜨는 안내(브라우저 alert 대신)
  const peekTimer = useRef(null)
  const mapBoundsRef = useRef(null) // 현재 지도 영역(검색 기준)
  const pendingSearchRef = useRef(null) // 지역 이동 후 자동 검색 예약 {q}
  const pendingSelectRef = useRef(null) // 검색으로 고른 가게 id — 결과 로드되면 선택+상세
  // 모바일 바텀시트 드래그 스냅 ('full' | 'half' | 'collapsed')
  const [sheet, setSheet] = useState('half')
  const sheetRef = useRef(null)
  const sdrag = useRef({ down: false, y: 0, start: 0, h: 0 })
  const [sheetEnter, setSheetEnter] = useState(true) // 첫 진입 시 아래에서 슬라이드 업
  // 필터
  const [keyword, setKeyword] = useState('') // 키워드 칩 ('' = 전체)
  const [navTo, setNavTo] = useState(null) // 지도 이동 신호
  const [regionTarget, setRegionTarget] = useState(null) // 선택한 지역 {center,zoom} ('필터 적용' 시 이동+검색)
  const [pickedLabel, setPickedLabel] = useState('') // 고른 지역 라벨
  const [course, setCourse] = useState(null) // AI 코스(동선)
  const [courseLoading, setCourseLoading] = useState(false)
  // 화면 모드: 'start'(어디서 데이트해요?) → 'course'(타임라인) / 'browse'(예전 장소 검색)
  const [mode, setMode] = useState('start')
  const [lastReq, setLastReq] = useState(null) // 마지막 코스 조건 — '다른 코스'·뒤로가기 때 폼 복원
  const pendingCourseRef = useRef(null) // 지역 이동 후 도착하면 그 bbox 로 코스 생성

  const say = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 2600) }

  // 데이터 로드 — 커밋된 검색(search)이 바뀔 때만. 진입(tick 0) 시엔 검색하지 않는다.
  // 최소 로딩 시간을 둬서 "검색 중" 표시가 살짝 보이게.
  useEffect(() => {
    if (search.tick === 0) return
    let active = true
    setLoading(true)
    const start = Date.now()
    getRestaurants(search.q, { bbox: search.bbox, regionTerm: search.regionTerm, limit: search.lim, kind: search.kind }).then(({ items, source, center }) => {
      const wait = Math.max(0, 900 - (Date.now() - start))
      setTimeout(() => {
        if (!active) return
        setItems(items)
        setSource(source)
        setLoading(false)
        // 검색어에 지역명이 있어 그 동네로 이동한 경우(예 "개봉 전집") → 지도도 그쪽으로.
        if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
          setNavTo({ center: [center.lng, center.lat], zoom: 14 })
        } else if (search.global && items.length) {
          // 전국 이름 검색은 지도가 결과 위치로 따라가게
          const hit = items.find((i) => Number.isFinite(i.lng) && Number.isFinite(i.lat))
          if (hit) setNavTo({ center: [hit.lng, hit.lat], zoom: 14 })
        }
      }, wait)
    })
    return () => { active = false }
  }, [search])

  // 검색으로 고른 가게가 결과에 있으면 선택 + 상세 열기
  useEffect(() => {
    if (!pendingSelectRef.current || !items.length) return
    const hit = items.find((x) => x.id === pendingSelectRef.current)
    pendingSelectRef.current = null
    if (hit) { setSelectedId(hit.id); setOpenItem(hit) }
  }, [items])

  // 모바일 바텀시트: 시작 화면은 꽉 채우고, 코스·둘러보기는 지도와 같이 보이게 중간
  useEffect(() => { setSheet(mode === 'start' ? 'full' : 'half') }, [mode])
  // 화면이 바뀌면 패널 스크롤을 맨 위로 — 시작 폼에서 내려간 위치가 코스 화면에 남지 않게
  useEffect(() => { sheetRef.current?.scrollTo?.(0, 0) }, [mode, course])

  // 리스트 시트 첫 진입 슬라이드 업
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSheetEnter(false))
    return () => cancelAnimationFrame(raf)
  }, [])

  const visible = useMemo(() => items.slice(0, search.lim), [items, search.lim])

  // 상황에 맞춰 바뀌는 리스트 제목
  const title = useMemo(() => {
    if (course || courseLoading) return { prefix: '🧭 AI 추천 코스', suffix: '' }
    if (search.tick === 0) return { prefix: '주변 맛집 둘러보기', suffix: '' }
    if (search.q) return { prefix: `'${search.q}'`, suffix: '검색결과' }
    return { prefix: NOUN[search.kind] || '장소', suffix: `${search.lim}곳` }
  }, [search, course, courseLoading])

  // 클릭: 선택 + 지도 포커스 + 상세 패널
  const onPick = (d) => { setSelectedId(d.id); setOpenItem(d) }
  const onBoundsChange = (b) => {
    mapBoundsRef.current = b
    // 지역 이동 후 도착하면(지도가 영역 보고) 그때 AI 코스 / 일반 검색
    if (pendingCourseRef.current) {
      const { bbox, theme, from, car, time, fixed } = pendingCourseRef.current
      pendingCourseRef.current = null
      onCourse(bbox, theme, from, car, time, fixed)
      return
    }
    if (pendingSearchRef.current) {
      const p = pendingSearchRef.current
      pendingSearchRef.current = null
      commitSearch(b, p.q)
    }
  }

  // 모바일 바텀시트: 핸들을 위/아래로 끌면 가까운 스냅 지점에 달라붙음
  const sheetY = (state, h) => (state === 'full' ? 0 : state === 'half' ? h * 0.5 : Math.max(0, h - 60))
  const onSheetDown = (e) => {
    const el = sheetRef.current; if (!el) return
    const h = el.offsetHeight
    sdrag.current = { down: true, y: e.clientY, start: sheetY(sheet, h), h }
    el.style.transition = 'none'
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
  }
  const onSheetMove = (e) => {
    const d = sdrag.current; if (!d.down) return
    const el = sheetRef.current; if (!el) return
    const ty = Math.max(0, Math.min(d.h - 60, d.start + (e.clientY - d.y)))
    el.style.transform = `translateY(${ty}px)`
  }
  const onSheetUp = () => {
    const d = sdrag.current; if (!d.down) return
    d.down = false
    const el = sheetRef.current; if (!el) return
    const m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform)
    const ty = m ? parseFloat(m[1]) : d.start
    const pts = [['full', 0], ['half', d.h * 0.5], ['collapsed', Math.max(0, d.h - 60)]]
    let best = 'half', bd = Infinity
    for (const [name, p] of pts) { const dd = Math.abs(p - ty); if (dd < bd) { bd = dd; best = name } }
    el.style.transition = ''
    el.style.transform = ''
    setSheet(best)
  }

  // 검색 시 패널을 잠깐 반투명화 (지도 결과 들여다보기)
  const triggerPeek = () => {
    setPeek(true)
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(false), 2200)
  }
  // 검색 커밋 (현재 검색어/필터 + bbox 로). 이걸 호출할 때만 실제 검색이 일어난다.
  const commitSearch = (bbox = null, qOverride, global = false, regionTerm = '') => {
    triggerPeek()
    setSearch((s) => ({ q: qOverride ?? query.trim(), bbox, global, regionTerm, lim: limit, kind, tick: s.tick + 1 }))
  }

  // 카테고리 전환(음식/여행지/숙소) — 검색어 초기화. 실제 검색은 '필터 적용'/검색 때.
  const onKind = (k) => {
    if (k === kind) return
    setKind(k); setKeyword(''); setQuery(''); setSuggests([])
  }

  // 지도 카테고리 버튼(음식/여행지/숙소) → 그 카테고리로 전환 + 현재 영역 검색 (1탭)
  const onAreaSearch = (bbox, k = kind) => {
    if (k !== kind) { setKind(k); setKeyword(''); setQuery('') }
    triggerPeek()
    setSearch((s) => ({ q: '', bbox, lim: limit, kind: k, tick: s.tick + 1 }))
  }

  // 🧭 AI 코스 짜기 — 지역 + 테마(선택) + 출발점(역) + 차
  const onCourse = async (bbox, theme = '', from = null, car = false, time = 'day', fixed = null, exclude = []) => {
    setCourseLoading(true)
    setCourse(null)
    try {
      const c = await getCourse(bbox, theme, from, car, time, fixed, exclude)
      if (c?.limited) {
        setCourse(null)
        setMode('start')
        say('요청이 너무 많아요. 잠시 후 다시 시도해 주세요 🙏')
        return null
      }
      if (!c || !c.stops?.length) {
        setCourse(null)
        setMode('start')
        say('이 동네는 아직 코스 데이터가 준비 중이에요 🙏 성수·용산·종로·이태원·천안에서 먼저 써 보세요')
        return null
      }
      setCourse(c)
      markAiUsed()
      return c
    } finally {
      setCourseLoading(false)
    }
  }
  // 코스 요청(시작 폼 값) → 실제 요청 조건으로. spot(역·장소)은 그 지점 걸어서 다닐 범위(±약 1.2km) + 출발점(from)
  const reqOf = (r) => {
    const d = r.spot || r.nearFixed ? 0.012 : 0.02 // 역·정해 둔 곳 ≈1.2km / 동네 ≈2km 박스
    const c = r.center
    return { bbox: [c[0] - d, c[1] - d, c[0] + d, c[1] + d], theme: r.theme, car: r.car, time: r.time, from: r.spot ? { label: r.label, lng: c[0], lat: c[1] } : null, fixed: r.fixed || null }
  }
  // 시작 폼 제출 → 그 동네로 날아가 도착하면 코스 생성(onBoundsChange 에서 트리거)
  const startCourse = (r) => {
    if (aiUsedUp()) { say(`오늘 AI 코스는 ${AI_PER_DAY}번까지예요. 내일 다시 만나요 🧭`); return }
    setLastReq(r)
    setPickedLabel(r.label || '')
    setMode('course')
    setCourse(null)
    setCourseLoading(true)
    setOpenItem(null)
    pendingCourseRef.current = reqOf(r)
    setNavTo({ center: r.center, zoom: 15 })
    // 이미 그 자리에 있으면 지도가 '도착(moveend)'을 안 보낼 수 있다 → 잠시 뒤에도 남아 있으면 바로 요청
    setTimeout(() => {
      const p = pendingCourseRef.current
      if (!p) return
      pendingCourseRef.current = null
      onCourse(p.bbox, p.theme, p.from, p.car, p.time, p.fixed)
    }, 1600)
  }
  // 다른 코스 — 같은 조건으로 바로 다시(지도는 그대로)
  const reroll = () => {
    if (!lastReq) return
    if (aiUsedUp()) { say(`오늘 AI 코스는 ${AI_PER_DAY}번까지예요. 내일 다시 만나요 🧭`); return }
    const q = reqOf(lastReq)
    const prev = (course?.stops || []).map((s) => s.id) // 직전 코스 장소는 빼고
    setOpenItem(null)
    onCourse(q.bbox, q.theme, q.from, q.car, q.time, q.fixed, prev)
  }
  const backToStart = () => { setCourse(null); setCourseLoading(false); setOpenItem(null); setMode('start') }
  const summaryLabel = lastReq ? [lastReq.nearFixed ? null : lastReq.label, lastReq.fixed ? `${lastReq.fixed.time} ${lastReq.fixed.label} 전` : lastReq.time === 'evening' ? '저녁' : '낮', lastReq.mood && ({ cafe: '감성 카페', food: '맛집 투어', walk: '산책', art: '전시·구경', hanok: '한옥·골목' })[lastReq.mood]].filter(Boolean).join(' · ') : ''

  // 검색바 자동완성: 타이핑하면 전국 가게를 카카오로 제안
  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; setSuggests([]); return }
    suppressSuggestRef.current = false // 새로 타이핑하면 자동완성 다시 허용
    const q = query.trim()
    if (q.length < 1) { setSuggests([]); return }
    const t = setTimeout(async () => {
      if (suppressSuggestRef.current) return // 검색 눌렀으면 결과를 안 띄움
      try {
        const b = mapBoundsRef.current
        const bb = Array.isArray(b) ? `&bbox=${b.join(',')}` : ''
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}&kind=${kind}${bb}`)
        const d = await r.json()
        if (!suppressSuggestRef.current) setSuggests(Array.isArray(d.results) ? d.results : [])
      } catch (_) { setSuggests([]) }
    }, 220)
    return () => clearTimeout(t)
  }, [query, kind])

  // 자동완성에서 가게 선택 → 그 위치로 날아가 그 동네 검색 + '그 가게'를 선택/상세 오픈
  const pickSuggest = (s) => {
    pickedRef.current = true
    setQuery(s.name)
    setSuggests([])
    pendingSearchRef.current = { q: '' } // 도착 후 그 동네 검색
    pendingSelectRef.current = s.id // 결과 로드되면 이 가게 선택+상세
    setNavTo({ center: [s.lng, s.lat], zoom: 16 })
  }

  // 검색 버튼/Enter → 카카오 키워드검색(결과 리스트)
  const runTextSearch = async () => {
    const q = query.trim()
    suppressSuggestRef.current = true // 검색 후 자동완성(미리보기) 안 뜨게
    setSuggests([])
    if (!q) { const b = mapBoundsRef.current; if (b) commitSearch(b, ''); return } // 빈 검색 → 현재 영역

    const tokens = q.split(/\s+/).filter(Boolean)
    // ① "근처/주변 + 키워드" → 지금 보는 지도 영역에서 그 키워드 검색
    const NEAR = /^(근처|주변|내\s*근처|이\s*근처|가까운|가까이)\s*/
    if (NEAR.test(q)) {
      const kw = q.replace(NEAR, '').trim()
      const b = mapBoundsRef.current
      if (b) { commitSearch(b, kw); return }
    }
    // ② "지역 + 키워드" → 지역이 지오코딩되면 그 동네로 날아가 그 영역에서 검색
    if (tokens.length >= 2) {
      for (let i = tokens.length - 1; i >= Math.max(1, tokens.length - 3); i--) {
        const region = tokens.slice(0, i).join(' ')
        const kw = tokens.slice(i).join(' ')
        try {
          const r = await fetch(`/api/geocode?q=${encodeURIComponent(region)}`)
          const hit = (await r.json()).results?.[0]
          if (hit) {
            // 지도 줌(좁음)에 안 갇히게, 지역 크기에 맞춘 넉넉한 박스로 검색
            const pad = hit.zoom >= 15 ? 0.025 : hit.zoom >= 13 ? 0.06 : 0.12
            const sb = [hit.lng - pad, hit.lat - pad, hit.lng + pad, hit.lat + pad]
            setNavTo({ center: [hit.lng, hit.lat], zoom: Math.max(12, hit.zoom - 2) })
            commitSearch(sb, kw, false, tokens[i - 1]) // 그 영역 검색 + 그 지역명(개봉) 주소필터
            return
          }
        } catch (_) {}
      }
    }
    // ③ 그 외(가게 이름/브랜드 등) → 전국 카카오 키워드검색
    commitSearch(null, q, true)
  }
  // 필터 패널의 '필터 적용' → 선택 지역으로 이동 + 그 지역에서 검색 + 패널 닫기
  const applyFilters = () => {
    setFiltersOpen(false)
    if (regionTarget) {
      setQuery('')
      pendingSearchRef.current = { q: keyword } // 지도 도착 후 검색 예약
      setNavTo({ center: regionTarget.center, zoom: regionTarget.zoom + REGION_FOCUS_BOOST })
    } else {
      runTextSearch() // 지역 선택 없으면 현재 보는 영역에서 검색
    }
  }
  // 동·구·역 검색으로 지역 선택 (카카오 좌표)
  const onRegionPick = (s) => {
    setPickedLabel(s.label)
    setRegionTarget({ center: [s.lng, s.lat], zoom: s.zoom })
  }

  // 헤더 슬롯 — 시작·코스 화면: '주변 맛집 둘러보기' 링크 / 둘러보기: 검색바 + 코스 짜기 + 필터
  const headerLink = (
    <div className="header-search-wrap cf-header-link">
      <button type="button" className="cf-link" onClick={() => { setMode('browse'); setOpenItem(null) }}>주변 맛집 둘러보기</button>
    </div>
  )
  const searchBar = (
    <div className="header-search-wrap">
      <form className="search" onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector('input')?.blur(); runTextSearch() }}>
        <svg className="search-ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setSuggests([]), 150)}
          placeholder="맛집·여행지·숙소, 콕 찍어 검색"
        />
        <button type="submit" className="search-go">검색</button>
        {suggests.length > 0 && (
          <div className="search-suggests">
            {suggests.map((s) => (
              <button key={s.id} type="button" className="search-suggest" onMouseDown={() => pickSuggest(s)}>
                <span className="ss-ic">{s.icon || '🍽️'}</span>
                <span className="ss-name">{s.name}</span>
                <span className="ss-region">{s.region}</span>
              </button>
            ))}
          </div>
        )}
      </form>
      <div className="hdr-ai-wrap">
        <button
          className="hdr-ai"
          onClick={() => { setMode('start'); setOpenItem(null) }}
          title="AI 코스 짜기"
        >
          <span className="hdr-ai-ic">🧭</span>
          <span className="hdr-ai-label">AI 코스</span>
          <span className="hdr-ai-mini">AI</span>
        </button>
      </div>
      <button
        className={`hdr-filter ${filtersOpen ? 'on' : ''}`}
        onClick={() => setFiltersOpen((o) => !o)}
        aria-expanded={filtersOpen}
        title="필터" aria-label="필터"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
      </button>
    </div>
  )

  return (
    <>
      {headerSlot && createPortal(mode === 'browse' ? searchBar : headerLink, headerSlot)}

      {filtersOpen && <div className="filter-backdrop" onClick={() => setFiltersOpen(false)} />}
      <div className={`filterpanel ${filtersOpen ? 'open' : ''}`}>
        <div className="sheet-handle" onClick={() => setFiltersOpen(false)}><span className="sheet-grip" /></div>
        <button className="filterpanel-close" onClick={() => setFiltersOpen(false)} aria-label="닫기">×</button>
        <div className="filter-scroll">
          <FilterBar
            kind={kind} onKind={onKind}
            limit={limit} onLimit={setLimit}
            keyword={keyword} onKeyword={setKeyword}
            onRegionPick={onRegionPick} pickedLabel={pickedLabel}
          />
        </div>
        <div className="filter-apply-wrap">
          <button className="filter-apply" onClick={applyFilters} disabled={!regionTarget}>
            {regionTarget ? '필터 적용' : '지역을 먼저 선택하세요'}
          </button>
        </div>
      </div>

      {mode === 'browse' && (
        <div className="count">
          <span className="count-title">
            {title.prefix}{title.suffix && <> <b>{title.suffix}</b></>}
          </span>
        </div>
      )}

      <div className={`wrap ${mode !== 'browse' ? 'cf' : ''} ${listOpen ? '' : 'collapsed'} ${peek ? 'peeking' : ''} ${openItem ? 'detail-open' : ''} ${mapMoving ? 'mapmoving' : ''}`}>
        <button
          className="collapse-btn list-toggle"
          onClick={() => setListOpen((o) => !o)}
          aria-label={listOpen ? '목록 접기' : '목록 펼치기'}
          title={listOpen ? '목록 접기' : '목록 펼치기'}
        >
          {listOpen ? '«' : '»'}
        </button>
        <div className={`results sheet-${sheet} ${sheetEnter ? 'sheet-enter' : ''}`} ref={sheetRef}>
          <div
            className="sheet-handle"
            onPointerDown={onSheetDown}
            onPointerMove={onSheetMove}
            onPointerUp={onSheetUp}
            onPointerCancel={onSheetUp}
          >
            <span className="sheet-grip" />
          </div>
          {mode === 'start' ? (
            <StartPanel onSubmit={startCourse} onBrowse={() => setMode('browse')} remaining={Math.max(0, AI_PER_DAY - aiCount())} initial={lastReq && { label: lastReq.nearFixed ? '' : lastReq.label, loc: lastReq.nearFixed ? null : { center: lastReq.center, label: lastReq.label, spot: lastReq.spot }, fixed: lastReq.fixed, time: lastReq.time, mood: lastReq.mood, car: lastReq.car }} />
          ) : mode === 'course' ? (
            <CourseView
              course={course}
              loading={courseLoading}
              selected={selectedId}
              onSelectStop={onPick}
              onBack={backToStart}
              onReroll={reroll}
              summaryLabel={summaryLabel}
              car={!!lastReq?.car}
            />
          ) : search.tick === 0 ? (
            <div className="empty">
              검색창에 가게·동네를 입력하거나<br />지도를 움직여 <b>이 지역 찾기</b>를 눌러 보세요.
            </div>
          ) : (
            <>
              <RestaurantList
                items={visible}
                selected={selectedId}
                loading={loading}
                onOpen={onPick}
                emptyText={
                  source === 'overseas'
                    ? '해외 장소는 준비 중이에요 🌏 지금은 국내만 찾을 수 있어요'
                    : source === 'error'
                    ? '불러오지 못했어요. 잠시 후 다시 시도해 주세요 🙏'
                    : `이 지역에 표시할 ${NOUN[kind] || '장소'}이 없어요 🥲`
                }
              />
              <div className="results-foot">장소 정보 © 카카오</div>
            </>
          )}
        </div>
        <GeoPanel items={mode === 'browse' ? visible : []} selected={selectedId} onSelect={onPick} onAreaSearch={onAreaSearch} onBounds={onBoundsChange} onMoving={setMapMoving} navTo={navTo} loading={loading} limit={limit} kind={kind} course={mode === 'course' ? course : null} courseLoading={courseLoading} />
        <DetailModal data={openItem} onClose={() => setOpenItem(null)} sheet="half" />
      </div>
      {notice && <div className="detail-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 3000 }}>{notice}</div>}
    </>
  )
}
