import { getToken } from './client'

/** Tải file nhị phân / CSV (kèm token đăng nhập) — dùng cho các endpoint không trả JSON */
export async function fetchFile(path: string): Promise<Response> {
  return fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
}

/** Lưu một Blob xuống máy qua thẻ <a download> */
export function saveBlob(blob: Blob, filename: string, opts: { attach?: boolean; revokeDelayMs?: number } = {}) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  if (opts.attach) document.body.appendChild(a)
  a.click()
  if (opts.attach) a.remove()
  // Safari cần URL còn sống thêm một nhịp sau khi bấm
  if (opts.revokeDelayMs) setTimeout(() => URL.revokeObjectURL(url), opts.revokeDelayMs)
  else URL.revokeObjectURL(url)
}
