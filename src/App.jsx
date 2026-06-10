import { Outlet } from 'react-router-dom'
import Header from './components/Header.jsx'

export default function App() {
  return (
    <>
      <Header />
      <Outlet />
      <footer className="footnote">
        평점·리뷰 수는 Google Places API 기준입니다. 키 미설정 시 데모용 샘플 데이터가 표시됩니다.
      </footer>
    </>
  )
}
