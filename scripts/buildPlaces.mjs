// L0/L1 base 빌더 — 공공데이터포털(data.go.kr) '지방행정 인허가' CSV 를 읽어 seed(p_*) 로 적재.
//  · 소유권: 공공누리(상업적 이용 가능, 출처표시) → 우리 base 데이터.
//  · 입력: LOCALDATA 표준 CSV = 쉼표 구분, 따옴표로 감싼 필드(주소에 콤마·줄바꿈 포함), EUC-KR 인코딩,
//          좌표 EPSG:5174(TM 중부원점). → csv-parse 로 정확히 파싱(임베디드 콤마·줄바꿈 처리).
//  · 처리: 스트리밍(메모리에 통째로 안 올림) → 영업중 + 지정 지역만 남기고 좌표를 WGS84 로 변환.
//  · 평점/구글 안 부름 → 비용/약관 0. 평점·사진(L3)·네이버 태그(L2)는 이후 배치가 채운다.
//
// 실행:  node scripts/buildPlaces.mjs <csv경로> [food|stay] [지역키워드...]
//   예:  node scripts/buildPlaces.mjs ./일반음식점.csv food 강남구 서초구
//        node scripts/buildPlaces.mjs ./숙박업.csv stay 해운대구
//   지역키워드 생략 시 전체 적재(파일이 크면 수만 건 → 권장 X, 동/구 단위로 좁힐 것).

import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse'
import proj4 from 'proj4'
import { catFromKakao, ICON_BY_CAT } from '../api/kakao.js'
import { seedUpsert } from '../lib/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// EPSG:5174 (Korea Modified Central Belt, Bessel) → WGS84
const EPSG5174 = '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs'

function toSeed(get, kind, regions) {
  const status = get('영업상태명') || ''
  if (!/영업|정상/.test(status) || (get('폐업일자') || '').trim()) return null   // 영업중만
  const name = (get('사업장명') || '').trim()
  const addr = (get('도로명주소') || get('지번주소') || '').trim()
  if (!name || !addr) return null
  if (regions.length && !regions.some((r) => addr.includes(r))) return null      // 지역 필터

  const x = parseFloat(get('좌표정보(X)')), y = parseFloat(get('좌표정보(Y)'))
  let lat = null, lng = null
  if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0) {
    try { const [lo, la] = proj4(EPSG5174, 'WGS84', [x, y]); lng = +lo.toFixed(6); lat = +la.toFixed(6) } catch (_) {}
  }
  const cat = catFromKakao(get('업태구분명') || '')
  const id = `p_${(get('개방자치단체코드') || '').trim()}_${(get('관리번호') || '').trim()}`
  return {
    id, name, region: addr, addr_road: get('도로명주소') || '', addr_jibun: get('지번주소') || '',
    biz_type: get('업태구분명') || '', status, src: 'localdata', kind, cat, icon: ICON_BY_CAT[cat] || '🍽️',
    lat, lng, phone: (get('전화번호') || '').trim(), homepage: (get('홈페이지') || '').trim(),
    licensed: (get('인허가일자') || '').trim(),   // 노포순 재료(YYYY-MM-DD, 오래될수록 노포)
    tags: [], blog: 0, kakao_id: null, gid: null,   // L2/L3 는 이후 배치가 채움
  }
}

async function main() {
  const [csvPath, kindArg = 'food', ...regions] = process.argv.slice(2)
  if (!csvPath) { console.error('사용법: node scripts/buildPlaces.mjs <csv경로> [food|stay] [지역키워드...]'); process.exit(1) }
  const file = path.resolve(ROOT, csvPath)
  if (!fs.existsSync(file)) { console.error(`파일 없음: ${file}`); process.exit(1) }
  const kind = kindArg === 'stay' ? 'stay' : kindArg === 'travel' ? 'travel' : 'food'
  if (!regions.length) console.warn('⚠️ 지역키워드 없음 → 전체 적재. 파일이 크면 동/구 단위로 좁히길 권장.')

  // EUC-KR 바이트 → UTF-8 문자열 (스트리밍 디코드)
  const dec = new TextDecoder('euc-kr')
  const decodeStream = new Transform({
    transform(chunk, _enc, cb) { cb(null, dec.decode(chunk, { stream: true })) },
    flush(cb) { cb(null, dec.decode()) },
  })
  // 따옴표/임베디드 콤마·줄바꿈을 정확히 처리. columns:true → 헤더 이름으로 키된 레코드.
  const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true, trim: true })

  let total = 0, kept = 0, geo = 0
  const out = new Map()
  const pipeline = fs.createReadStream(file).pipe(decodeStream).pipe(parser)
  for await (const rec of pipeline) {
    total++
    const s = toSeed((c) => rec[c] ?? '', kind, regions)
    if (s) { out.set(s.id, s); kept++; if (s.lat != null) geo++ }
  }

  await seedUpsert([...out.values()])
  console.log(`총 ${total}행 스캔 → 적재 ${kept}건(중복제거 ${out.size}), 좌표변환 ${geo}건.`)
  console.log('다음: 네이버 태깅(buildSeed 로직) + 카카오/구글 매칭으로 blog/tags/kakao_id/gid 채우기.')
}

main().catch((e) => { console.error(e); process.exit(1) })
