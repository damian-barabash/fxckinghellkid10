// Coordinates the initial preloader with the first page's above-the-fold images.
// markReady() fires the 'app-ready' event exactly once (the first page to load
// wins); later calls are no-ops, so navigation never re-triggers the preloader.

let fired = false

export function preloadImages(urls, timeout = 2500) {
  const loaders = urls.filter(Boolean).map(
    (u) =>
      new Promise((res) => {
        const img = new Image()
        img.onload = img.onerror = () => res()
        img.src = u
      })
  )
  return Promise.race([
    Promise.all(loaders),
    new Promise((res) => setTimeout(res, timeout)),
  ])
}

export async function markReady(urls = []) {
  if (fired) return
  fired = true
  if (urls.length) await preloadImages(urls)
  window.dispatchEvent(new Event('app-ready'))
}
