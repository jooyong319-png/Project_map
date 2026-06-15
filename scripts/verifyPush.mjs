// prod Supabase 적재 검증(읽기 전용). 총/베이스/맛집 수 + 강남 맛집 인기순 샘플.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m) env[m[1]] = m[2].trim()
}
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function count(qs) {
  const r = await fetch(`${URL}/rest/v1/seed?${qs}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return r.headers.get('content-range')?.split('/')[1] ?? '?'
}
console.log('총 seed:', await count('select=id'))
console.log('베이스(p_*):', await count('select=id&id=like.p_*'))
console.log('베이스 blog>0:', await count('select=id&id=like.p_*&blog=gt.0'))
console.log('베이스 licensed 있음:', await count('select=id&id=like.p_*&licensed=not.is.null'))
const r = await fetch(`${URL}/rest/v1/seed?select=name,blog,licensed&id=like.p_*&order=blog.desc.nullslast&limit=5`, { headers: H })
const rows = await r.json()
console.log('p_* 인기순 top5:', Array.isArray(rows) ? rows.map((x) => `${x.blog} ${x.name}`).join(' | ') : JSON.stringify(rows))
