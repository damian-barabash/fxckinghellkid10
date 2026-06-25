import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset URLs relative so the build works both at the repo
// subpath (https://user.github.io/fxckinghellkid10/) and on a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
  // pre-bundle the ffmpeg fallback so dev doesn't reload mid-upload when it's
  // first imported (production builds bundle it regardless).
  optimizeDeps: { include: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
})
