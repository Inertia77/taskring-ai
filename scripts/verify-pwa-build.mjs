import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const dist = 'dist'
const manifestPath = join(dist, 'manifest.webmanifest')
const swPath = join(dist, 'sw.js')

assert.ok(existsSync(manifestPath), 'manifest.webmanifest must exist after build')
assert.ok(existsSync(swPath), 'sw.js must exist after build')
assert.ok(existsSync(join(dist, 'pwa-192x192.png')), '192x192 PWA icon must exist')
assert.ok(existsSync(join(dist, 'pwa-512x512.png')), '512x512 PWA icon must exist')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.name, 'TaskRing AI Secretary')
assert.equal(manifest.short_name, 'TaskRing')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')

const iconSizes = new Set((manifest.icons ?? []).map((icon) => icon.sizes))
assert.ok(iconSizes.has('192x192'), 'manifest must declare a 192x192 icon')
assert.ok(iconSizes.has('512x512'), 'manifest must declare a 512x512 icon')
assert.ok((manifest.icons ?? []).every((icon) => String(icon.purpose ?? '').includes('maskable')), 'manifest icons must support maskable purpose')

const assets = readdirSync(join(dist, 'assets'))
assert.ok(assets.some((name) => name.endsWith('.js')), 'built JavaScript asset must exist')
assert.ok(assets.some((name) => name.endsWith('.css')), 'built CSS asset must exist')
assert.ok(existsSync(join(dist, 'index.html')), 'built index.html must exist')

const sw = readFileSync(swPath, 'utf8')
for (const forbidden of ['supabase.co', '/rest/v1/', '/auth/v1/', '/storage/v1/']) {
  assert.ok(!sw.includes(forbidden), `service worker must not runtime-cache private endpoint marker: ${forbidden}`)
}

const viteConfig = readFileSync('vite.config.ts', 'utf8')
assert.match(viteConfig, /runtimeCaching:\s*\[\s*\]/, 'PWA config must keep runtimeCaching explicitly empty')
assert.ok(!/urlPattern\s*:/.test(viteConfig), 'PWA config must not define runtime cache URL patterns')
assert.ok(!/supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(viteConfig), 'PWA config must not reference private API caching targets')

console.log('PWA artifact verification passed: static shell only, no private API runtime cache.')
