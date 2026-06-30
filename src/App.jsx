import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Preloader from './components/Preloader.jsx'
import Home from './pages/Home.jsx'
import Category from './pages/Category.jsx'
import Contact from './pages/Contact.jsx'
import { prefetchAllThumbs } from './lib/prefetch.js'

// Admin (and its heavy pdf-lib dependency) is split out of the public bundle.
const Admin = lazy(() => import('./pages/admin/Admin.jsx'))

export default function App() {
  const loc = useLocation()
  // Nav is mounted once (outside the routed pages) so the sliding green
  // indicator survives navigation and animates between any two tabs.
  const showNav = !loc.pathname.startsWith('/admin')

  // Once, on a public page, warm every category's grid thumbnails in the
  // background so the first visit to each tab is already cached (see prefetch.js).
  useEffect(() => {
    if (!loc.pathname.startsWith('/admin')) prefetchAllThumbs()
  }, [loc.pathname])

  return (
    <>
      <Preloader />
      {showNav && <Nav />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/c/:slug" element={<Category />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/admin/*" element={
          <Suspense fallback={<div className="center">…</div>}><Admin /></Suspense>
        } />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  )
}
