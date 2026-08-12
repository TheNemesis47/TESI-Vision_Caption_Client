import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const keyPath = resolve(__dirname, 'certs/key.pem')
const certificatePath = resolve(__dirname, 'certs/cert.pem')
const localHttps =
  existsSync(keyPath) && existsSync(certificatePath)
    ? {
        key: readFileSync(keyPath),
        cert: readFileSync(certificatePath),
      }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: localHttps,
  },
})
