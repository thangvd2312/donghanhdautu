import { timeAgo } from './format'
import type { PriceMeta } from './types'

/** "14:45 (5 phút trước)" trong ngày; ngày khác thì "14:45 23/10/2026" (không lặp lại ngày) */
function asOfText(iso: string) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  return Date.now() - d.getTime() < 86_400_000 ? `${time} (${timeAgo(iso)})` : `${time} ${d.toLocaleDateString('vi-VN')}`
}

/** "Nguồn: Vietcap · lúc 14:45 (5 phút trước)" */
export function priceSourceText(price: PriceMeta) {
  return [`Nguồn: ${price.source}`, price.asOf ? `lúc ${asOfText(price.asOf)}` : null].filter(Boolean).join(' · ')
}
