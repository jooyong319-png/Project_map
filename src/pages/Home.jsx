import { useEffect, useMemo, useRef, useState } from 'react'
import FilterBar from '../components/FilterBar.jsx'
import RestaurantList from '../components/RestaurantList.jsx'
import GeoPanel from '../components/GeoPanel.jsx'
import DetailModal from '../components/DetailModal.jsx'
import { getRestaurants, getCuration } from '../lib/places.js'
import { getBookmarks, toggleBookmark, getSavedItems } from '../lib/supabase.js'
import { COUNTRIES } from '../data/countries.js'

const REGION_FOCUS_BOOST = 1.5 // 지역 선택 후 이동 시 추가로 줌인하는 양

export default function Home() {
  const [query, setQuery] = useState('')
  const [suggests, setSuggests] = useState([]) // 검색바 자동완성(가게)
  const pickedRef = useRef(false) // 자동완성 선택 직후 재조회 방지
  const [sort, setSort] = useState('reviews')
  const [limit, setLimit] = useState(50) // 보여줄 개수 50/100/200
  const [items, setItems] = useState([])
  const [search, setSearch] = useState({ q: '', bbox: null, sort: 'reviews', lim: 50, price: 0, tick: 0 }) // 커밋된 검색 조건
  const [source, setSource] = useState('mock')
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [savedItems, setSavedItems] = useState([]) // 저장한 맛집 전체 데이터(지도에 항상 표시)
  const [listOpen, setListOpen] = useState(true) // 왼쪽 TOP 10 패널 접기/펼치기
  const [filtersOpen, setFiltersOpen] = useState(false) // 모바일: 검색·필터 전체 접기/펼치기
  const [peek, setPeek] = useState(false) // 검색 시 잠깐 패널 반투명(지도 들여다보기)
  const [mapMoving, setMapMoving] = useState(false) // 지도 이동/줌 중 → 리스트·상세 반투명
  const peekTimer = useRef(null)
  const mapBoundsRef = useRef(null) // 현재 지도 영역(검색 기준)
  const pendingSearchRef = useRef(null) // 지역 이동 후 자동 검색 예약 {q}
  // 모바일 바텀시트 드래그 스냅 ('full' | 'half' | 'collapsed')
  const [sheet, setSheet] = useState('half')
  const sheetRef = useRef(null)
  const sdrag = useRef({ down: false, y: 0, start: 0, h: 0 })
  const [sheetEnter, setSheetEnter] = useState(true) // 첫 진입 시 아래에서 슬라이드 업
  // 필터
  const [country, setCountry] = useState('') // 지구본 상태에선 선택 없음
  const [city, setCity] = useState('') // 도시
  const [area, setArea] = useState('') // 동네
  const [keyword, setKeyword] = useState('') // 나라별 키워드 ('' = 전체)
  const [price, setPrice] = useState(0) // 가격대 0=전체, 1~4 = ₩~₩₩₩₩ (priceLevel)
  const [tags, setTags] = useState([]) // 태그 필터(맛집/노포/혼밥) — 한국 한정, 시드에서 검색
  const toggleTag = (t) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))
  const [bookmarkOnly, setBookmarkOnly] = useState(false)
  const [navTo, setNavTo] = useState(null) // 나라 필터 검색 시 지도 이동 신호
  const [regionTarget, setRegionTarget] = useState(null) // 선택한 지역 {center,zoom} ('필터 적용' 시 이동+검색)
  const [pickedLabel, setPickedLabel] = useState('') // 주소검색으로 고른 지역 라벨

  // 데이터 로드 — 커밋된 검색(search)이 바뀔 때만. 진입(tick 0) 시엔 검색 안 하고 저장된 곳만 표시.
  // 최소 로딩 시간을 둬서 "검색 중" 표시가 살짝 보이게(천천히 검색되는 느낌).
  useEffect(() => {
    if (search.tick === 0) return
    let active = true
    setLoading(true)
    const start = Date.now()
    const fetcher = search.curation
      ? getCuration()
      : getRestaurants(search.q, { bbox: search.bbox, global: search.global, limit: search.lim, tags: search.tags })
    fetcher.then(({ items, source }) => {
      const wait = Math.max(0, 900 - (Date.now() - start))
      setTimeout(() => {
        if (!active) return
        setItems(items)
        setSource(source)
        setLoading(false)
      }, wait)
    })
    return () => { active = false }
  }, [search])

  // 북마크/저장맛집 로드
  useEffect(() => {
    getBookmarks().then(setBookmarks)
    getSavedItems().then(setSavedItems)
  }, [])

  // 리스트 시트 첫 진입 슬라이드 업
  useEffect(() => {
    const raf = requestAnimationFrame(() => setSheetEnter(false))
    return () => cancelAnimationFrame(raf)
  }, [])

  // 진입(아직 검색 안 함) 또는 저장 필터 ON → 저장한 곳을 보여준다.
  const showingSaved = bookmarkOnly || search.tick === 0
  const visible = useMemo(() => {
    let r = showingSaved ? savedItems : items
    if (search.sort === 'rating') r = [...r].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    else r = [...r].sort((a, b) => b.reviews - a.reviews) // 기본: 리뷰 많은순
    if (search.price) r = r.filter((d) => d.priceLevel === search.price) // 가격대 필터(가격 미상은 제외)
    return r.slice(0, search.lim)
  }, [items, savedItems, showingSaved, search.sort, search.lim, search.price])

  // 지도 마커 = TOP10 + 저장한 맛집(검색에 없어도 항상 표시). 저장된 건 saved 표시.
  const mapItems = useMemo(() => {
    const savedIds = new Set(savedItems.map((d) => d.id))
    const byId = new Map()
    for (const d of visible) byId.set(d.id, d)
    for (const s of savedItems) if (!byId.has(s.id)) byId.set(s.id, s)
    return [...byId.values()].map((d) => (savedIds.has(d.id) ? { ...d, saved: true } : d))
  }, [visible, savedItems])

  // 상황에 맞춰 바뀌는 리스트 제목
  const title = useMemo(() => {
    if (showingSaved) return { prefix: '⭐ 저장한 맛집', suffix: '' }
    if (search.curation) return { prefix: '🏆 화제의 맛집', suffix: '' }
    if (search.q) return { prefix: `'${search.q}'`, suffix: '검색결과' } // 키워드 검색
    return { prefix: '인기 맛집', suffix: `TOP ${search.lim}` }
  }, [showingSaved, search])

  const onBookmark = async (data) => {
    await toggleBookmark(data)
    setBookmarks(await getBookmarks())
    setSavedItems(await getSavedItems())
  }
  // 클릭: 선택 + 지도 포커스 + 상세 패널(왼쪽)
  const onPick = (d) => { setSelectedId(d.id); setOpenItem(d) }
  const onBoundsChange = (b) => {
    mapBoundsRef.current = b
    // 지역 이동 후 도착하면(지도가 영역 보고) 그때 검색
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
  const commitSearch = (bbox = null, qOverride, global = false) => {
    triggerPeek()
    setSearch((s) => ({ q: qOverride ?? query.trim(), bbox, global, sort, lim: limit, price, tags, tick: s.tick + 1 }))
  }

  // 지도 "이 지역 TOP N" → 현재 영역에서 (선택 키워드로) 검색
  const onAreaSearch = (bbox) => commitSearch(bbox, keyword)
  // 검색바 자동완성: 타이핑하면 전국 가게를 카카오로 제안
  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; setSuggests([]); return }
    const q = query.trim()
    if (q.length < 1) { setSuggests([]); return }
    const t = setTimeout(async () => {
      try {
        const b = mapBoundsRef.current
        const bb = Array.isArray(b) ? `&bbox=${b.join(',')}` : ''
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}${bb}`)
        const d = await r.json()
        setSuggests(Array.isArray(d.results) ? d.results : [])
      } catch (_) { setSuggests([]) }
    }, 220)
    return () => clearTimeout(t)
  }, [query])

  // 자동완성에서 가게 선택 → 그 위치로 날아가서 그 지역 검색
  const pickSuggest = (s) => {
    pickedRef.current = true
    setQuery(s.name)
    setSuggests([])
    pendingSearchRef.current = { q: '' } // 도착 후 그 동네 검색
    setNavTo({ center: [s.lng, s.lat], zoom: 16 })
  }

  // 검색 버튼/Enter → 현재 보고 있는 지도 영역에서 검색 (텍스트 우선, 없으면 키워드 칩)
  const runTextSearch = () => {
    const q = query.trim() || keyword
    const b = mapBoundsRef.current
    if (b) commitSearch(b, q)             // 지도: 현재 보고 있는 영역
    else { if (!q) return; commitSearch(null, q, true) } // 지구본: 전세계 검색
  }
  // 필터 패널의 '필터 적용' → 선택 지역으로 이동 + 그 지역에서 검색 + 패널 닫기
  const applyFilters = () => {
    setFiltersOpen(false)
    if (regionTarget) {
      setQuery('')
      pendingSearchRef.current = { q: keyword } // 지도 도착 후 검색 예약
      setNavTo({ center: regionTarget.center, zoom: regionTarget.zoom + REGION_FOCUS_BOOST }) // 포커스 더 들어가게
    } else {
      runTextSearch() // 지역 선택 없으면 현재 보는 영역에서 검색
    }
  }

  // 🏆 화제의 맛집(큐레이션) 불러오기 — 어디서든
  const loadCuration = () => {
    triggerPeek()
    setQuery('')
    setBookmarkOnly(false)
    setSearch((s) => ({ q: '', bbox: null, sort, lim: limit, tick: s.tick + 1, curation: true }))
  }

  // 지역 칩은 '선택'만 — 지도 이동/검색은 '필터 적용' 누를 때
  const onCountry = (name) => {
    const c = COUNTRIES.find((x) => x.name === name)
    if (!c) return
    setCountry(name); setCity(''); setArea(''); setKeyword(''); setPickedLabel('')
    setRegionTarget({ center: c.center, zoom: c.zoom })
  }
  const onCity = (c) => { setCity(c.name); setArea(''); setPickedLabel(''); setRegionTarget({ center: c.center, zoom: c.zoom }) }
  const onArea = (a) => { setArea(a.name); setPickedLabel(''); setRegionTarget({ center: a.center, zoom: a.zoom }) }
  // 주소검색으로 지역 선택 (카카오 좌표). 나라/도시/동네 칩 선택은 해제.
  const onRegionPick = (s) => {
    setCountry(''); setCity(''); setArea('')
    setPickedLabel(s.label)
    setRegionTarget({ center: [s.lng, s.lat], zoom: s.zoom })
  }
  // 지역 진입/이탈 시 리스트 초기화(기본=저장 뷰) + 선택 해제
  const onReset = (countryName) => {
    setQuery('')
    setKeyword('')
    setPrice(0)
    setTags([])
    setBookmarkOnly(false)
    setCountry(countryName || '') // 지구본 복귀 시 선택 해제
    setCity('')
    setArea('')
    setPickedLabel('')
    setRegionTarget(null)
    setSort('reviews')
    setLimit(50)
    setSearch({ q: '', bbox: null, sort: 'reviews', lim: 50, price: 0, tick: 0 })
    setSelectedId(null)
    setOpenItem(null)
    mapBoundsRef.current = null
  }

  return (
    <>
      {/* 상단: 키워드 검색은 항상 보임 + 작은 '필터' 버튼 */}
      <div className="filters">
        <form className="search" onSubmit={(e) => { e.preventDefault(); runTextSearch() }}>
          <svg className="search-ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => setSuggests([]), 150)}
            placeholder="가게 이름 검색 (예: 우래옥)"
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
        <button
          className={`save-toggle top ${bookmarkOnly ? 'on' : ''}`}
          onClick={() => setBookmarkOnly((o) => !o)}
          title="저장한 곳만 보기"
          aria-label="저장한 곳만 보기"
          aria-pressed={bookmarkOnly}
        >
          <svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
        </button>
        <button
          className="filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          ⚙ 필터
        </button>
      </div>

      {filtersOpen && <div className="filter-backdrop" onClick={() => setFiltersOpen(false)} />}
      <div className={`filterpanel ${filtersOpen ? 'open' : ''}`}>
        <div className="sheet-handle" onClick={() => setFiltersOpen(false)}><span className="sheet-grip" /></div>
        <button className="filterpanel-close" onClick={() => setFiltersOpen(false)} aria-label="닫기">×</button>
        <div className="filter-scroll">
        <div className="filter-controls">
          <select className="sortsel" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="reviews">리뷰 많은순</option>
            <option value="rating">평점 높은순</option>
          </select>
          <select className="sortsel" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={50}>50개</option>
            <option value={100}>100개</option>
            <option value={200}>200개</option>
          </select>
        </div>
        <FilterBar
          country={country} onCountry={onCountry}
          city={city} onCity={onCity}
          area={area} onArea={onArea}
          keyword={keyword} onKeyword={setKeyword}
          price={price} onPrice={setPrice}
          tags={tags} onToggleTag={toggleTag}
          onRegionPick={onRegionPick} pickedLabel={pickedLabel}
        />
        </div>
        <div className="filter-apply-wrap">
          <button className="filter-apply" onClick={applyFilters}>필터 적용</button>
        </div>
      </div>

      <div className="count">
        <span>{title.prefix}{title.suffix && <> <b>{title.suffix}</b></>}</span>
        {source === 'mock' && !showingSaved && <span className="badge-mock">샘플 데이터</span>}
      </div>

      <div className={`wrap ${listOpen ? '' : 'collapsed'} ${peek ? 'peeking' : ''} ${openItem ? 'detail-open' : ''} ${mapMoving ? 'mapmoving' : ''}`}>
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
          <RestaurantList
            items={visible}
            selected={selectedId}
            bookmarks={bookmarks}
            loading={loading}
            onOpen={onPick}
            onBookmark={onBookmark}
            emptyText={showingSaved ? '저장한 맛집이 없어요 🔖' : '구글에 등록된 식당이 없어요 🥲'}
          />
          <div className="results-foot">평점·리뷰 수는 Google Places API 기준입니다.</div>
        </div>
        <GeoPanel items={mapItems} selected={selectedId} onSelect={onPick} onAreaSearch={onAreaSearch} onReset={onReset} onBounds={onBoundsChange} onMoving={setMapMoving} navTo={navTo} loading={loading} limit={limit} />
        <DetailModal data={openItem} onClose={() => setOpenItem(null)} onBookmark={onBookmark} bookmarked={openItem ? bookmarks.includes(openItem.id) : false} sheet="half" />
      </div>
    </>
  )
}
