import type { ReactNode } from 'react'
import { fmtDate, fmtPct, fmtPrice } from '../../lib/format'
import { amountText, qtyText, signOf } from '../../lib/reports'
import type { AssetType, PortfolioReport, ReportAmount, ReportTransaction } from '../../lib/types'
import { Logo } from '../ui'

const TYPE_COLOR: Record<AssetType, string> = {
  stock: '#2563eb',
  gold: '#d4a017',
  crypto: '#8b5cf6',
  cash: '#14a37f',
}

/**
 * Kiểu của bản báo cáo: màu cố định (giấy trắng, chữ đậm) cho cả bản xem trước lẫn bản in, không theo giao diện
 * sáng / tối của app. Khi in, chỉ bản báo cáo gắn ở `body` (.rpt-print-root) được in: không có thanh điều hướng,
 * nút bấm hay hộp thoại.
 */
export const REPORT_CSS = `
.rpt-doc{--ink:#111827;--muted:#5b6475;--line:#e3e7ee;--soft:#f4f6f9;--up:#0a7a3d;--down:#c62828;
  color:var(--ink);background:#fff;color-scheme:light;font-family:Inter,"Segoe UI",Roboto,system-ui,sans-serif;
  font-size:13px;line-height:1.45;font-variant-numeric:tabular-nums;-webkit-text-size-adjust:100%}
.rpt-doc *{box-sizing:border-box}
.rpt-doc h1,.rpt-doc h2,.rpt-doc p,.rpt-doc ul{margin:0}
.rpt-head{border-bottom:2px solid var(--ink);padding-bottom:10px}
.rpt-brand{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.03em;text-transform:uppercase}
.rpt-title{font-size:20px;font-weight:700;letter-spacing:-.01em;margin-top:8px;line-height:1.25}
.rpt-meta{color:var(--muted);font-size:12px;margin-top:2px}
.rpt-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rpt-tag{font-size:11px;font-weight:600;border:1px solid var(--line);border-radius:99px;padding:1px 8px;color:var(--muted)}
.rpt-tag.warn{color:#8a5a00;border-color:#f0d9a8;background:#fff8e6}
.rpt-sec{margin-top:18px;break-inside:avoid;page-break-inside:avoid}
.rpt-sec.long{break-inside:auto;page-break-inside:auto}
.rpt-sec h2{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid var(--line);break-after:avoid;page-break-after:avoid}
.rpt-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:6px}
.rpt-kpi{background:var(--soft);border-radius:8px;padding:8px 10px;min-width:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rpt-kpi .k{font-size:11px;color:var(--muted)}
.rpt-kpi .v{font-size:15px;font-weight:700;overflow-wrap:anywhere;line-height:1.3}
.rpt-returns{display:flex;flex-wrap:wrap;gap:2px 14px;margin-top:8px;font-size:12px;color:var(--muted)}
.rpt-returns b{color:var(--ink);font-weight:600}
.rpt-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-bottom:1px solid var(--line);break-inside:avoid;page-break-inside:avoid}
.rpt-row:last-child{border-bottom:0}
.rpt-row .k{min-width:0;overflow-wrap:anywhere}
.rpt-row .k small,.rpt-row .v small{display:block;color:var(--muted);font-size:11px;font-weight:400}
.rpt-row .v{text-align:right;white-space:nowrap;font-weight:500}
.rpt-row.sub .k{padding-left:12px;color:var(--muted)}
.rpt-row.sub .v{font-weight:400}
.rpt-row.total{font-weight:700;border-top:1px solid var(--ink);border-bottom:0}
.rpt-row.total .v{font-weight:700}
.rpt-doc .up{color:var(--up)}
.rpt-doc .down{color:var(--down)}
.rpt-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px;background:var(--soft);margin:6px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rpt-bar span{display:block;height:100%}
.rpt-legend{display:flex;flex-wrap:wrap;gap:2px 14px;font-size:12px;color:var(--muted);margin-bottom:4px}
.rpt-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rpt-legend b{color:var(--ink);font-weight:600;margin-left:4px}
.rpt-tx{display:grid;grid-template-columns:44px minmax(0,1fr) auto;column-gap:10px;padding:5px 0;border-bottom:1px solid var(--line);break-inside:avoid;page-break-inside:avoid}
.rpt-tx:last-child{border-bottom:0}
.rpt-tx .d{color:var(--muted);font-size:12px}
.rpt-tx .n{min-width:0;overflow-wrap:anywhere}
.rpt-tx .a{text-align:right;white-space:nowrap;font-weight:500}
.rpt-tx .s{grid-column:2/4;font-size:11px;color:var(--muted);overflow-wrap:anywhere}
.rpt-note{font-size:12px;color:var(--muted);margin-top:4px}
.rpt-notes{padding-left:18px;font-size:12px}
.rpt-notes li{margin:3px 0}
.rpt-empty{padding:16px 0;color:var(--muted)}
.rpt-foot{margin-top:18px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
@media (min-width:600px){.rpt-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.rpt-tx{grid-template-columns:80px minmax(0,1fr) auto}}
.rpt-print-root{display:none}
@media print{
  @page{size:A4;margin:12mm 12mm 14mm}
  html,body{background:#fff!important;color:#111827!important}
  body{min-width:0!important}
  body>*:not(.rpt-print-root){display:none!important}
  .rpt-print-root{display:block!important}
  .rpt-doc{font-size:9.5pt}
  .rpt-title{font-size:15pt}
  .rpt-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
  .rpt-kpi .v{font-size:11.5pt}
  .rpt-tx{grid-template-columns:22mm minmax(0,1fr) auto}
}
`

function Section({ title, long, children, testId }: { title: string; long?: boolean; children: ReactNode; testId?: string }) {
  return (
    <section className={long ? 'rpt-sec long' : 'rpt-sec'} data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

const tone = (a: ReportAmount) => (signOf(a) > 0 ? 'up' : signOf(a) < 0 ? 'down' : undefined)
/** Đổi dấu (khoản rút hiện là số âm); 0 giữ là 0, không thành "-0" */
const flip = (v: number | null) => (v === null || v === 0 ? v : -v)
const neg = (a: ReportAmount): ReportAmount => ({ vnd: flip(a.vnd), pct: flip(a.pct) })
const nonZero = (a: ReportAmount) => signOf(a) !== 0

function Row({
  k,
  sub,
  v,
  vSub,
  className,
  vClass,
}: {
  k: ReactNode
  sub?: ReactNode
  v: ReactNode
  vSub?: ReactNode
  className?: string
  vClass?: string
}) {
  return (
    <div className={['rpt-row', className].filter(Boolean).join(' ')}>
      <span className="k">
        {k}
        {sub && <small>{sub}</small>}
      </span>
      <span className={['v', vClass].filter(Boolean).join(' ')}>
        {v}
        {vSub && <small>{vSub}</small>}
      </span>
    </div>
  )
}

function txLine(t: ReportTransaction) {
  const parts: string[] = []
  if (t.quantity !== null && t.price !== null && t.type !== 'deposit' && t.type !== 'withdraw') {
    parts.push(`${qtyText(t.quantity)} × ${fmtPrice(t.price, t.currency)}`)
  } else if (t.type === 'bonus' && t.quantity !== null) parts.push(`${qtyText(t.quantity)} cp`)
  if (t.fee) parts.push(`phí ${fmtPrice(t.fee, t.currency)}`)
  if (t.tax) parts.push(`thuế ${fmtPrice(t.tax, t.currency)}`)
  if (t.portfolioName) parts.push(t.portfolioName)
  if (t.note) parts.push(t.note)
  return parts.join(' · ')
}

function genTime(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Bản báo cáo: dùng chung cho xem trước trên màn hình và bản in / lưu PDF */
export default function ReportDocument({ r }: { r: PortfolioReport }) {
  const s = r.summary
  const masked = r.mask.amounts
  return (
    <article className="rpt-doc" aria-label={`Báo cáo danh mục ${r.period.label}`}>
      <header className="rpt-head">
        <div className="rpt-brand">
          <Logo size={18} />
          Đồng Hành Đầu Tư
        </div>
        <h1 className="rpt-title">Báo cáo danh mục · {r.period.label}</h1>
        <p className="rpt-meta">
          {r.portfolio.name} · {fmtDate(r.period.from)} – {fmtDate(r.period.to)}
          {r.period.inProgress ? ' (kỳ chưa kết thúc)' : ''}
        </p>
        <p className="rpt-meta">Tạo lúc {genTime(r.generatedAt)} · Không phải khuyến nghị đầu tư</p>
        {(r.mask.amounts || r.mask.symbols || s?.isEstimate) && (
          <div className="rpt-tags">
            {r.mask.amounts && <span className="rpt-tag">Đã ẩn số tiền</span>}
            {r.mask.symbols && <span className="rpt-tag">Đã ẩn mã</span>}
            {s?.isEstimate && <span className="rpt-tag warn">Có số liệu ước tính</span>}
          </div>
        )}
        {masked && <p className="rpt-note">Số tiền được ẩn: các con số là % so với tổng tài sản cuối kỳ.</p>}
      </header>

      {!r.hasData || !s || !r.flows || !r.income || !r.allocation || !r.contributors ? (
        <p className="rpt-empty" data-testid="report-empty">
          {r.notes[0] ?? 'Kỳ này chưa có số liệu.'}
        </p>
      ) : (
        <>
          <Section title="Tổng quan" testId="report-summary">
            <div className="rpt-kpis">
              <div className="rpt-kpi">
                <div className="k">Đầu kỳ</div>
                <div className="v">{amountText(s.startValue)}</div>
              </div>
              <div className="rpt-kpi">
                <div className="k">Dòng vốn ròng</div>
                <div className="v">{amountText(s.netFlows, { signed: true })}</div>
              </div>
              <div className="rpt-kpi">
                <div className="k">Lãi/lỗ trong kỳ</div>
                <div className={`v ${tone(s.profit) ?? ''}`}>{amountText(s.profit, { signed: true })}</div>
              </div>
              <div className="rpt-kpi">
                <div className="k">Cuối kỳ</div>
                <div className="v">{amountText(s.endValue)}</div>
              </div>
            </div>
            <div className="rpt-returns">
              <span>
                Lãi trong kỳ <b className={s.returnPct ? (s.returnPct > 0 ? 'up' : 'down') : undefined}>{fmtPct(s.returnPct)}</b>
              </span>
              <span>
                TWR <b>{fmtPct(s.twrPct)}</b>
              </span>
              <span>
                XIRR <b>{s.xirrPct === null ? '—' : `${fmtPct(s.xirrPct)}/năm`}</b>
              </span>
            </div>
            {s.startedInPeriod && <p className="rpt-note">Danh mục bắt đầu trong kỳ nên giá trị đầu kỳ bằng 0.</p>}
          </Section>

          <Section title="Dòng vốn" testId="report-flows">
            <Row k="Nạp tiền" sub={`${r.flows.depositCount} lần`} v={amountText(r.flows.deposits)} />
            <Row k="Rút tiền" sub={`${r.flows.withdrawalCount} lần`} v={amountText(neg(r.flows.withdrawals))} />
            {nonZero(r.flows.openings) && (
              <Row k="Khai báo tài sản đang có" sub="Theo giá thị trường ngày khai báo" v={amountText(r.flows.openings)} />
            )}
            {nonZero(r.flows.implicitDeposits) && (
              <Row k="Nạp ngầm định" sub="Mua chưa ghi khoản nạp tương ứng" v={amountText(r.flows.implicitDeposits)} />
            )}
            {nonZero(r.flows.other) && (
              <Row k="Khác" sub="Quy đổi USDT chưa có tỷ giá" v={amountText(r.flows.other, { signed: true })} />
            )}
            <Row className="total" k="Dòng vốn ròng" v={amountText(r.flows.net, { signed: true })} />
          </Section>

          <Section title="Lãi đã chốt, cổ tức, phí và thuế" testId="report-income">
            <Row
              k="Lãi/lỗ đã chốt"
              sub="Từ các lần bán trong kỳ, sau phí và thuế bán"
              v={amountText(r.income.realized, { signed: true })}
              vClass={tone(r.income.realized)}
            />
            {r.income.realizedRows.map((x) => (
              <Row key={`${x.assetType}:${x.name}`} className="sub" k={x.name} v={amountText(x.amount, { signed: true })} vClass={tone(x.amount)} />
            ))}
            <Row k="Cổ tức thực nhận" sub="Sau thuế / phí" v={amountText(r.income.dividends)} vClass={tone(r.income.dividends)} />
            {r.income.dividendRows.map((d, i) => (
              <Row key={`${d.date}-${d.name}-${i}`} className="sub" k={`${fmtDate(d.date)} · ${d.name}`} v={amountText(d.net)} />
            ))}
            <Row
              k="Phí và thuế đã trả"
              sub={`Phí ${amountText(r.income.fees)} · thuế ${amountText(r.income.taxes)}`}
              v={amountText(r.income.feesAndTaxes)}
            />
          </Section>

          <Section title={`Phân bổ cuối kỳ (${fmtDate(r.allocation.date)})`} testId="report-allocation">
            {r.allocation.rows.length === 0 ? (
              <p className="rpt-empty">Cuối kỳ không còn tài sản nào.</p>
            ) : (
              <>
                <div className="rpt-bar" aria-hidden>
                  {r.allocation.byType.map((t) => (
                    <span key={t.assetType} style={{ width: `${t.weightPct}%`, background: TYPE_COLOR[t.assetType] }} />
                  ))}
                </div>
                <div className="rpt-legend">
                  {r.allocation.byType.map((t) => (
                    <span key={t.assetType}>
                      <i style={{ background: TYPE_COLOR[t.assetType] }} />
                      {t.typeLabel}
                      <b>{fmtPct(t.weightPct, 1, false)}</b>
                    </span>
                  ))}
                </div>
                {r.allocation.rows.map((x) => (
                  <Row
                    key={x.key}
                    k={x.name}
                    sub={x.priced ? x.typeLabel : `${x.typeLabel} · chưa có giá, tạm tính theo giá vốn`}
                    v={fmtPct(x.weightPct, 1, false)}
                    vSub={masked ? undefined : amountText(x.value)}
                  />
                ))}
              </>
            )}
          </Section>

          <Section title="Đóng góp lãi/lỗ theo tài sản" testId="report-contributors">
            {r.contributors.rows.map((c) => (
              <Row
                key={`${c.assetType}:${c.name}`}
                k={c.name}
                sub={c.priced ? undefined : 'Ước tính (thiếu giá)'}
                v={amountText(c.contribution, { signed: true })}
                vClass={tone(c.contribution)}
              />
            ))}
            {nonZero(r.contributors.other) && (
              <Row
                k="Khác"
                sub="Phí riêng, tiền mặt USDT, làm tròn"
                v={amountText(r.contributors.other, { signed: true })}
                vClass={tone(r.contributors.other)}
              />
            )}
            <Row className="total" k="Lãi/lỗ trong kỳ" v={amountText(s.profit, { signed: true })} vClass={tone(s.profit)} />
          </Section>

          <Section title={`Giao dịch trong kỳ (${r.transactions.length})`} long testId="report-transactions">
            {r.transactions.length === 0 && <p className="rpt-empty">Kỳ này không có giao dịch nào.</p>}
            {r.transactions.map((t, i) => {
              const line = txLine(t)
              return (
                <div className="rpt-tx" key={i}>
                  <span className="d">{fmtDate(t.date).slice(0, 5)}</span>
                  <span className="n">
                    {t.typeLabel}
                    {t.name ? ` ${t.name}` : ''}
                  </span>
                  <span className="a">{t.grossValue === null ? '' : fmtPrice(t.grossValue, t.currency)}</span>
                  {line && <span className="s">{line}</span>}
                </div>
              )
            })}
          </Section>
        </>
      )}

      <Section title="Ghi chú dữ liệu" testId="report-notes">
        {r.notes.length ? (
          <ul className="rpt-notes">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="rpt-note">Không có ghi chú: giá đầy đủ trong cả kỳ.</p>
        )}
        {s && <p className="rpt-note">{s.method}</p>}
      </Section>

      <footer className="rpt-foot">{r.disclaimer} Báo cáo chỉ được tạo khi bạn yêu cầu; app không tự chia sẻ danh mục của bạn.</footer>
    </article>
  )
}
