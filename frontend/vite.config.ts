import { defineConfig, type Rollup } from 'vite'
import react from '@vitejs/plugin-react'

type GetModuleInfo = Rollup.GetModuleInfo

/** Mô-đun `id` có được import tĩnh (bắc cầu) từ một mô-đun thoả `isRoot` không */
function reachableFrom(id: string, getModuleInfo: GetModuleInfo, isRoot: (id: string, entry: boolean) => boolean) {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    if (seen.has(cur)) continue
    seen.add(cur)
    const info = getModuleInfo(cur)
    if (!info) continue
    if (isRoot(cur, info.isEntry)) return true
    stack.push(...info.importers)
  }
  return false
}
const isEntry = (_id: string, entry: boolean) => entry
const isShell = (id: string) => id.endsWith('/src/AuthedRoutes.tsx')

/**
 * Vendor chunk ổn định (tên theo nội dung, ít đổi giữa các lần deploy → trình duyệt dùng lại bản cache):
 *  - vendor-react: react, react-dom, router
 *  - vendor-mui: MUI/emotion mà trang đăng nhập (entry) cần
 *  - vendor-mui-shell: phần MUI chỉ vỏ app đã đăng nhập dùng (Menu, Drawer, Popover…) — khách không phải tải
 *  - vendor-socket: socket.io-client (chỉ vỏ đã đăng nhập)
 * Thư viện còn lại (biểu đồ, markdown, MUI của riêng từng trang…) để Rollup gom theo trang dùng chúng.
 */
function vendorChunk(id: string, ctx: { getModuleInfo: GetModuleInfo }) {
  if (!id.includes('/node_modules/')) return undefined
  const pkg = id.split('/node_modules/').pop()!
  if (/^(react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)\//.test(pkg)) return 'vendor-react'
  if (/^(socket\.io-client|engine\.io-client|engine\.io-parser|socket\.io-parser|@socket\.io)\//.test(pkg)) return 'vendor-socket'
  if (/^(@mui|@emotion|@popperjs|stylis|hoist-non-react-statics|react-is|prop-types|clsx)\//.test(pkg)) {
    if (reachableFrom(id, ctx.getModuleInfo, isEntry)) return 'vendor-mui'
    if (reachableFrom(id, ctx.getModuleInfo, isShell)) return 'vendor-mui-shell'
  }
  return undefined
}

export default defineConfig({
  plugins: [react()],
  // Mã của lần build: cache dữ liệu lưu trên máy bị bỏ khi deploy bản mới (cấu trúc dữ liệu có thể đã đổi)
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  build: {
    rollupOptions: {
      output: {
        // Thư viện ít đổi tách riêng: deploy mã app mới thì trình duyệt vẫn dùng lại bản đã cache
        manualChunks: (id, ctx) => vendorChunk(id, ctx),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
