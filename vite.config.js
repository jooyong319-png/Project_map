import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import placesHandler from './api/places.js'
import photoHandler from './api/photo.js'
import placeHandler from './api/place.js'

// 로컬 개발용 /api 미들웨어 플러그인.
// `npm run dev` 에서도 Vercel 함수(api/*.js)를 그대로 실행해
// 실제 Google Places 연동을 테스트할 수 있게 한다.
function apiPlugin(env) {
  // 서버 사이드 핸들러가 읽는 process.env 에 .env 값을 주입
  Object.assign(process.env, env)
  const routes = { '/api/places': placesHandler, '/api/photo': photoHandler, '/api/place': placeHandler }
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const handler = routes[url.pathname]
        if (!handler) return next()
        req.query = Object.fromEntries(url.searchParams)
        // Node res 를 Vercel (res) 시그니처에 맞춰 보강 (json/binary 둘 다 지원)
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res }
        Promise.resolve(handler(req, res)).catch((e) => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), apiPlugin(env)],
  }
})
