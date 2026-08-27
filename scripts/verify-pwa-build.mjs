import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const dist = 'dist'
const manifestPath = join(dist, 'manifest.webmanifest')
const swPath = join(dist, 'sw.js')
const icon192Path = join(dist, 'pwa-192x192.png')
const icon512Path = join(dist, 'pwa-512x512.png')

assert.ok(existsSync(manifestPath), 'manifest.webmanifest must exist after build')
assert.ok(existsSync(swPath), 'sw.js must exist after build')
assert.ok(existsSync(icon192Path), '192x192 PWA icon must exist')
assert.ok(existsSync(icon512Path), '512x512 PWA icon must exist')

function assertPngDimensions(path, expectedWidth, expectedHeight) {
  const png = readFileSync(path)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.ok(png.subarray(0, 8).equals(signature), `${path} must be a PNG file`)
  assert.equal(png.toString('ascii', 12, 16), 'IHDR', `${path} must contain a PNG IHDR header`)
  assert.equal(png.readUInt32BE(16), expectedWidth, `${path} width must be ${expectedWidth}`)
  assert.equal(png.readUInt32BE(20), expectedHeight, `${path} height must be ${expectedHeight}`)
}

assertPngDimensions(icon192Path, 192, 192)
assertPngDimensions(icon512Path, 512, 512)

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.name, 'TaskRing AI Secretary')
assert.equal(manifest.short_name, 'TaskRing')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')

const iconSizes = new Set((manifest.icons ?? []).map((icon) => icon.sizes))
assert.ok(iconSizes.has('192x192'), 'manifest must declare a 192x192 icon')
assert.ok(iconSizes.has('512x512'), 'manifest must declare a 512x512 icon')
assert.ok(
  (manifest.icons ?? []).every((icon) => String(icon.purpose ?? '').includes('maskable')),
  'manifest icons must support maskable purpose',
)

const assets = readdirSync(join(dist, 'assets'))
assert.ok(assets.some((name) => name.endsWith('.js')), 'built JavaScript asset must exist')
assert.ok(assets.some((name) => name.endsWith('.css')), 'built CSS asset must exist')
assert.ok(existsSync(join(dist, 'index.html')), 'built index.html must exist')

const sw = readFileSync(swPath, 'utf8')
assert.ok(sw.includes('index.html'), 'service worker must precache the application entry point for offline shell startup')
for (const forbidden of ['supabase.co', '/rest/v1/', '/auth/v1/', '/storage/v1/']) {
  assert.ok(!sw.includes(forbidden), `service worker must not cache private endpoint marker: ${forbidden}`)
}

const viteConfig = readFileSync('vite.config.ts', 'utf8')
assert.match(viteConfig, /runtimeCaching:\s*\[\s*\]/, 'PWA config must keep runtimeCaching explicitly empty')
assert.ok(!/urlPattern\s*:/.test(viteConfig), 'PWA config must not define runtime cache URL patterns')
assert.ok(
  !/supabase\.co|\/rest\/v1\/|\/auth\/v1\/|\/storage\/v1\//.test(viteConfig),
  'PWA config must not reference private API caching targets',
)

console.log('PWA artifact verification passed: install icons valid, static shell precached, no private API runtime cache.')
