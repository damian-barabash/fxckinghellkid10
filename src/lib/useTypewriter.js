import { useEffect, useRef, useState } from 'react'

// Types `target` out character-by-character. When `target` changes it first
// backspaces the current text, then types the new one — a classic typewriter.
export function useTypewriter(target, { typeMs = 45, eraseMs = 24 } = {}) {
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(true)
  const textRef = useRef('')
  textRef.current = text

  useEffect(() => {
    let cancelled = false
    let to
    setTyping(true)
    const full = target || ''

    const erase = () => {
      if (cancelled) return
      const cur = textRef.current
      if (cur.length > 0) {
        setText(cur.slice(0, -1))
        to = setTimeout(erase, eraseMs)
      } else {
        type(0)
      }
    }
    const type = (i) => {
      if (cancelled) return
      if (i <= full.length) {
        setText(full.slice(0, i))
        to = setTimeout(() => type(i + 1), typeMs)
      } else {
        setTyping(false)
      }
    }
    erase()
    return () => { cancelled = true; clearTimeout(to) }
  }, [target])

  return { text, typing }
}
