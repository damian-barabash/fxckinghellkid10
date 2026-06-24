import { useEffect, useState } from 'react'

// Responsive column count — 3 on desktop, 2 on tablet/phone.
// (Matches the old CSS `column-count` breakpoints.)
function useColumns() {
  const get = () => (typeof window !== 'undefined' && window.innerWidth <= 900 ? 2 : 3)
  const [cols, setCols] = useState(get)
  useEffect(() => {
    const on = () => setCols(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return cols
}

// Row-major masonry: item i goes to column (i % cols). Reading the grid
// left-to-right, top-to-bottom yields 1,2,3,4,5… in the exact stored order,
// so the public site and the admin reorder UI show identical sequences.
// Each column is its own flex stack, so the columns always start level at the
// top (no "second column slides down" gap on mobile).
export default function Masonry({ items, render, className = '' }) {
  const cols = useColumns()
  const buckets = Array.from({ length: cols }, () => [])
  items.forEach((it, i) => buckets[i % cols].push({ it, i }))
  return (
    <div className={`masonry ${className}`}>
      {buckets.map((bucket, c) => (
        <div className="masonry__col" key={c}>
          {bucket.map(({ it, i }) => render(it, i))}
        </div>
      ))}
    </div>
  )
}
