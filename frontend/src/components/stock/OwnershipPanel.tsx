import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtNum, fmtPct } from '../../lib/format'
import type { StockFundamentals as Data } from '../../lib/types'
import { KV, Panel } from '../ui'

// ───────────────────────── Cổ đông và giao dịch nội bộ ─────────────────────────

export default function OwnershipPanel({ sh, it }: { sh: Data['majorShareholders']; it: Data['insiderTrades'] }) {
  return (
    <Panel title="Cổ đông lớn & giao dịch nội bộ" sx={{ height: '100%' }}>
      {sh ? (
        <>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
            Top {sh.top.length} cổ đông nắm {fmtPct(sh.top10TotalPct, 1, false)} · công bố mới nhất {fmtDate(sh.latestDisclosure)}
          </Typography>
          {sh.top.slice(0, 5).map((r) => (
            <Box key={r.name} sx={{ py: 0.5 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" noWrap title={r.name} sx={{ minWidth: 0 }}>
                  {r.name}
                </Typography>
                <Typography variant="body2" className="num" sx={{ fontWeight: 600, flexShrink: 0 }}>
                  {fmtPct(r.ownershipPct, 2, false)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {r.position ?? r.type} · {fmtDate(r.asOf)}
              </Typography>
            </Box>
          ))}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Không có dữ liệu cổ đông lớn.
        </Typography>
      )}

      <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 0.5 }}>
        Giao dịch nội bộ {it?.period ?? '12 tháng gần nhất'}
      </Typography>
      {it && it.count > 0 ? (
        <>
          <KV k="Mua (cổ phiếu)" v={fmtNum(it.sharesBought)} />
          <KV k="Bán (cổ phiếu)" v={fmtNum(it.sharesSold)} />
          <KV k="Ròng" v={`${it.net > 0 ? '+' : ''}${fmtNum(it.net)}`} />
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {it.recent.slice(0, 4).map((r, i) => (
              <Box key={i}>
                <Typography variant="body2">
                  <Box
                    component="span"
                    sx={{ fontWeight: 600, color: r.action === 'Mua' ? 'price.up' : r.action === 'Bán' ? 'price.down' : undefined }}
                  >
                    {r.action}
                  </Box>{' '}
                  {typeof r.shares === 'number' ? fmtNum(r.shares) : r.shares} · {r.trader}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtDate(r.date)}
                  {r.relatedTo ? ` · người liên quan của ${r.relatedTo}` : r.position ? ` · ${r.position}` : ''}
                </Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            Chỉ tính giao dịch đã hoàn tất, không tính cổ phiếu thưởng/ESOP
            {it.withoutVolume > 0 ? `; ${it.withoutVolume} giao dịch chưa ghi nhận khối lượng` : ''}. Tín hiệu tham khảo, không
            phải lý do mua bán.
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Không có giao dịch nội bộ đã hoàn tất trong 12 tháng.
        </Typography>
      )}
    </Panel>
  )
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
