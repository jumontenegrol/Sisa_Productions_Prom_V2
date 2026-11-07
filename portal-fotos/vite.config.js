import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const logoSource = resolve(projectRoot, 'assets/logo.png')
const faviconSource = resolve(projectRoot, 'assets/favicon.png')
const publicAssets = resolve(projectRoot, 'public/assets')
mkdirSync(publicAssets, { recursive: true })
copyFileSync(logoSource, resolve(publicAssets, 'logo.png'))
copyFileSync(faviconSource, resolve(publicAssets, 'favicon.png'))
const faviconData = readFileSync(faviconSource).toString('base64')
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="130 178 328 151" width="64" height="64"><rect x="130" y="178" width="328" height="151" fill="#101114"/><image href="data:image/png;base64,${faviconData}" x="0" y="0" width="600" height="600"/></svg>`
writeFileSync(resolve(projectRoot, 'public/favicon.svg'), faviconSvg)

export default defineConfig({ plugins: [react()] })
