import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'

// maplibre-gl-leaflet 플러그인은 전역 maplibregl 을 참조한다
if (typeof window !== 'undefined') window.maplibregl = maplibregl

// 무료·키 불필요 벡터 타일 (OpenFreeMap). bright = 밝고 컬러풀, 정보 풍부.
const STYLE = 'https://tiles.openfreemap.org/styles/bright'

// 라벨 한국어화 + 불필요 레이어 숨김
//  - 바다 이름(water_name), 도로명·고속도로 표지(transportation_name) 라벨
//  - 행정 경계선(boundary) + 페리 항로(ferry) → 바다 위 선 제거
const HIDE_SOURCE_LAYERS = ['water_name', 'transportation_name', 'boundary']
const HIDE_IDS = ['ferry']
function localizeKorean(glMap) {
  const layers = (glMap.getStyle()?.layers) || []
  for (const ly of layers) {
    if (HIDE_SOURCE_LAYERS.includes(ly['source-layer'] || '') || HIDE_IDS.includes(ly.id)) {
      try { glMap.setLayoutProperty(ly.id, 'visibility', 'none') } catch (_) {}
      continue
    }
    if (ly.type === 'symbol' && ly.layout && ly.layout['text-field'] !== undefined) {
      try {
        glMap.setLayoutProperty(ly.id, 'text-field', ['coalesce', ['get', 'name:ko'], ['get', 'name']])
      } catch (_) {}
    }
  }
}

export default function VectorBasemap() {
  const map = useMap()
  useEffect(() => {
    const gl = L.maplibreGL({
      style: STYLE,
      attribution: '© <a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles © OSM',
    })
    gl.addTo(map)
    const glMap = gl.getMaplibreMap()
    // 스타일 로드/변경마다 한글화 + 바다 라벨 숨김 적용 (setLayoutProperty 는 레이어 없으면 try/catch 로 무시)
    const apply = () => localizeKorean(glMap)
    glMap.on('load', apply)
    glMap.on('styledata', apply)
    apply()
    return () => {
      try { glMap.off('load', apply); glMap.off('styledata', apply) } catch (_) {}
      try { map.removeLayer(gl) } catch (_) {}
    }
  }, [map])
  return null
}
