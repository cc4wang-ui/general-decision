import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({base:'./',plugins:[react()],build:{outDir:'design-dist',rollupOptions:{input:'design.html'}}})
