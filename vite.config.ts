import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiServer = `http://127.0.0.1:${process.env.PORT ?? 8766}`

// The server builds the Saxo redirect URL from the Host header, so the proxy keeps the browser's host.
const proxy = { target: apiServer, changeOrigin: false }

export default defineConfig({
   plugins: [react(), tailwindcss()],
   resolve: {
      alias: {
         '@': resolve(import.meta.dirname, 'src/web'),
      },
   },
   server: {
      proxy: {
         '/api': proxy,
         '/callback': proxy,
      },
   },
})
