import { Outlet } from 'react-router-dom'
import Header from './components/Header.jsx'

export default function App() {
  return (
    <>
      <Header />
      <Outlet />
      <footer className="footnote">
        장소 정보 © 카카오 · 블로그 수 © 네이버
      </footer>
    </>
  )
}
