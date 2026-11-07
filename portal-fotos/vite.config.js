import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const logoSource = resolve(projectRoot, 'assets/logo.png')
const publicAssets = resolve(projectRoot, 'public/assets')
mkdirSync(publicAssets, { recursive: true })
copyFileSync(logoSource, resolve(publicAssets, 'logo.png'))

export default defineConfig({ plugins: [react()] })
