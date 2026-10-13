import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Home from './pages/Home.jsx'
import Privacy from './pages/Privacy.jsx'
import AccountDelete from './pages/AccountDelete.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Home />} />
        </Route>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/account-delete" element={<AccountDelete />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
