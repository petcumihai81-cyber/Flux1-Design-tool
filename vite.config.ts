import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // căi relative, ca aplicația să meargă și pe GitHub Pages (subfolder)
  base: './',
  plugins: [react()],
})
