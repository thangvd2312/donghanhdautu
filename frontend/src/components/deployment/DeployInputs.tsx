import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { fmtStockPrice, fmtVnd } from '../../lib/format'
import { asks, HORIZON_LABEL, horizonFor, money, todayKey, type DeployForm } from '../../lib/deployment'
import { moneyText, parseMoneyText } from '../../lib/rebalance'
import type { DeployEtf, DeployHorizon, DeployMode, DeploymentSetup } from '../../lib/types'
import { Segmented } from '../rebalance/RebalanceParts'
import { Panel } from '../ui'

const AMOUNT_CHIPS = [10e6, 50e6, 100e6, 500e6]

type Patch = (p: Partial<DeployForm>) => void

function MoneyField({ label, value, onChange, testId }: { label: string; value: number; onChange: (n: number) => void; testId?: string }) {
  return (
    <TextField
      label={label}
      value={moneyText(value)}
      placeholder="0"
      fullWidth
      onChange={(e) => onChange(Math.min(1e13, parseMoneyText(e.target.value)))}
      onFocus={(e) => e.target.select()}
      slotProps={{
        htmlInput: { inputMode: 'numeric', autoComplete: 'off', style: { textAlign: 'right' }, 'data-testid': testId },
        input: { endAdornment: <Typography color="text.secondary" sx={{ pl: 0.5 }}>₫</Typography> },
        inputLabel: { shrink: true },
      }}
    />
  )
}

/** Bước 1: số tiền, một lần hay mỗi tháng, lúc nào cần dùng (điền sẵn từ hồ sơ và mục tiêu) */
export function AmountPanel({ form, setup, onChange }: { form: DeployForm; setup: DeploymentSetup; onChange: Patch }) {
  return (
    <Panel title="1. Số tiền và lúc cần dùng">
      <Stack spacing={2.5}>
        <Box>
          <MoneyField
            label={form.mode === 'monthly' ? 'Số tiền góp mỗi tháng' : 'Số tiền muốn giải ngân'}
            value={form.amount}
            onChange={(amount) => onChange({ amount })}
            testId="dp-amount"
          />
          <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            {AMOUNT_CHIPS.map((v) => (
              <Chip
                key={v}
                label={money(v)}
                variant={form.amount === v ? 'filled' : 'outlined'}
                color={form.amount === v ? 'primary' : 'default'}
                onClick={() => onChange({ amount: v })}
                sx={{ height: 36, minWidth: 64 }}
              />
            ))}
          </Stack>
        </Box>
        <Segmented<DeployMode>
          label="Giải ngân"
          value={form.mode}
          onChange={(mode) => onChange({ mode })}
          options={[
            { value: 'one_time', label: 'Một lần', desc: 'Có sẵn một khoản, chia vào các phần rồi mua theo đợt.' },
            { value: 'monthly', label: 'Mỗi tháng', desc: 'Góp đều mỗi tháng, mỗi tháng ưu tiên phần đang thiếu nhiều nhất.' },
          ]}
        />
        <Box>
          <Segmented<DeployHorizon>
            label="Bao lâu nữa bạn có thể cần số tiền này?"
            value={form.horizon}
            onChange={(horizon) => onChange({ horizon, goalId: null })}
            options={(['short', 'medium', 'long'] as const).map((h) => ({
              value: h,
              label: HORIZON_LABEL[h],
              desc:
                h === 'short'
                  ? 'Cần trong vòng 1 năm: chỉ gửi tiết kiệm, không vào cổ phiếu, vàng, crypto.'
                  : h === 'medium'
                    ? '1–3 năm: cổ phiếu tối đa 40%, crypto tối đa 5%.'
                    : 'Trên 3 năm: theo bảng tỷ trọng của kiểu nhà đầu tư của bạn.',
            }))}
          />
          {setup.goals.length > 0 && (
            <Box sx={{ mt: 1.25 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                Hoặc tiền này dành cho mục tiêu:
              </Typography>
              <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                {setup.goals.map((g) => (
                  <Chip
                    key={g.id}
                    label={`${g.name} · ${g.targetDate.slice(5, 7)}/${g.targetDate.slice(0, 4)}`}
                    variant={form.goalId === g.id ? 'filled' : 'outlined'}
                    color={form.goalId === g.id ? 'primary' : 'default'}
                    onClick={() =>
                      onChange(form.goalId === g.id ? { goalId: null } : { goalId: g.id, horizon: horizonFor(g.targetDate, todayKey()) })
                    }
                    sx={{ height: 36 }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Box>
        {form.mode === 'one_time' && setup.cashVnd > 0 && (
          <FormControlLabel
            control={<Checkbox checked={form.fromCash} onChange={(e) => onChange({ fromCash: e.target.checked })} />}
            label={
              <Typography variant="body2">
                Số tiền này đã ghi trong Danh mục là tiền mặt (đang ghi {fmtVnd(setup.cashVnd)})
              </Typography>
            }
          />
        )}
      </Stack>
    </Panel>
  )
}

function YesNo({ value, onChange, label }: { value: boolean | null; onChange: (v: boolean) => void; label: string }) {
  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }}>{label}</Typography>
      <Stack direction="row" spacing={1}>
        {[
          { v: false, l: 'Không có' },
          { v: true, l: 'Có' },
        ].map((o) => (
          <Chip
            key={o.l}
            label={o.l}
            variant={value === o.v ? 'filled' : 'outlined'}
            color={value === o.v ? 'primary' : 'default'}
            onClick={() => onChange(o.v)}
            sx={{ height: 36, minWidth: 88 }}
          />
        ))}
      </Stack>
    </Box>
  )
}

/** Bước 2: lớp an toàn, chỉ hỏi cái khảo sát chưa có (nợ lãi cao luôn hỏi; quỹ dự phòng, margin khi khảo sát cho thấy cần) */
export function SafetyPanel({ form, setup, onChange }: { form: DeployForm; setup: DeploymentSetup; onChange: Patch }) {
  const need = asks(setup)
  const fund = form.monthlyExpense * form.emergencyMonths
  return (
    <Panel title="2. Trước khi đầu tư" subtitle="Trả nợ lãi cao và có quỹ dự phòng trước, để không phải bán tài sản lúc đang lỗ.">
      <Stack spacing={2.5}>
        <Box>
          <YesNo
            label="Bạn có nợ lãi cao (thẻ tín dụng, vay tiêu dùng) không?"
            value={form.hasDebt}
            onChange={(hasDebt) => onChange({ hasDebt })}
          />
          {form.hasDebt && (
            <Box sx={{ mt: 1.5 }}>
              <MoneyField label="Tổng số nợ lãi cao" value={form.debt} onChange={(debt) => onChange({ debt })} />
            </Box>
          )}
        </Box>
        {need.margin && (
          <MoneyField
            label="Dư nợ margin hiện tại (0 nếu đã trả hết)"
            value={form.marginDebt}
            onChange={(marginDebt) => onChange({ marginDebt })}
          />
        )}
        {need.emergency && (
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.25 }}>Quỹ dự phòng</Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.25 }}>
              Khảo sát của bạn ghi là chưa có. Nhập chi tiêu thiết yếu mỗi tháng để app để riêng phần này trước.
            </Typography>
            <Stack spacing={1.5}>
              <MoneyField
                label="Chi tiêu thiết yếu mỗi tháng"
                value={form.monthlyExpense}
                onChange={(monthlyExpense) => onChange({ monthlyExpense })}
              />
              <MoneyField label="Đã để dành được" value={form.saved} onChange={(saved) => onChange({ saved })} />
              <Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Dự phòng cho
                </Typography>
                <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                  {[3, 6, 9, 12].map((m) => (
                    <Chip
                      key={m}
                      label={`${m} tháng`}
                      variant={form.emergencyMonths === m ? 'filled' : 'outlined'}
                      color={form.emergencyMonths === m ? 'primary' : 'default'}
                      onClick={() => onChange({ emergencyMonths: m })}
                      sx={{ height: 36 }}
                    />
                  ))}
                </Stack>
              </Box>
              {fund > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Cần {fmtVnd(fund)}, còn thiếu {fmtVnd(Math.max(0, fund - form.saved))}.
                </Typography>
              )}
            </Stack>
          </Box>
        )}
      </Stack>
    </Panel>
  )
}

/** Tuỳ chọn: số đợt cho phần rủi ro, ETF dùng cho phần cổ phiếu lõi */
export function OptionsPanel({ form, setup, onChange }: { form: DeployForm; setup: DeploymentSetup; onChange: Patch }) {
  return (
    <Panel title="Tuỳ chọn">
      <Stack spacing={2.5}>
        {form.mode === 'one_time' && (
          <Segmented<'1' | '3' | '6'>
            label="Chia phần cổ phiếu và crypto thành"
            value={String(form.tranches) as '1' | '3' | '6'}
            onChange={(v) => onChange({ tranches: Number(v) as 1 | 3 | 6 })}
            options={[
              { value: '1', label: '1 đợt', desc: 'Mua hết ngay. Khi thị trường đi lên, bỏ tiền một lần thường lãi hơn.' },
              { value: '3', label: '3 tháng', desc: 'Mỗi tháng một đợt: giảm rủi ro mua đúng đỉnh và giảm hối tiếc.' },
              { value: '6', label: '6 tháng', desc: 'Chia nhỏ hơn nữa, hợp khi bạn rất sợ mua đúng đỉnh.' },
            ]}
          />
        )}
        <Segmented<DeployEtf>
          label="ETF cho phần cổ phiếu lõi"
          value={form.etf}
          onChange={(etf) => onChange({ etf })}
          options={setup.etfOptions.map((e) => ({
            value: e.symbol,
            label: e.symbol,
            desc: `${e.name}${e.price ? ` · giá ${fmtStockPrice(e.price)}` : ''}. ${
              e.symbol === 'E1VFVN30' ? 'Bám VN30: 30 doanh nghiệp lớn nhất HOSE.' : 'Bám VN Diamond: nhóm cổ phiếu hết room ngoại.'
            }`,
          }))}
        />
      </Stack>
    </Panel>
  )
}
