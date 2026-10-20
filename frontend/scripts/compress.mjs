// Nén sẵn file tĩnh sau khi build (.br và .gz cạnh file gốc) để server trả bản nén mà không phải nén mỗi request
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dir = new URL('../dist/assets/', import.meta.url).pathname
let before = 0
let after = 0
for (const f of readdirSync(dir)) {
  if (!/\.(js|css|svg|json)$/.test(f)) continue
  const file = join(dir, f)
  const raw = readFileSync(file)
  if (raw.length < 1024) continue
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
  writeFileSync(`${file}.br`, br)
  writeFileSync(`${file}.gz`, gzipSync(raw, { level: 9 }))
  before += statSync(file).size
  after += br.length
}
console.log(`Nén sẵn assets: ${Math.round(before / 1024)} kB → ${Math.round(after / 1024)} kB (brotli)`)
