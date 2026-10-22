import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { api, post, put } from '../lib/api'
import { timeAgo } from '../lib/format'
import { parseNum } from '../lib/num'
import type {
  AssetType,
  GroupTargets,
  PortfolioAlertKind,
  PortfolioAlertPreview,
  PortfolioAlertPreviewItem,
  PortfolioAlertRule,
  PortfolioAlertRuleRequest,
  PortfolioAlertSettings,
} from '../lib/types'
import { Panel } from './ui'

const KINDS: PortfolioAlertKind[] = ['concentration', 'drift', 'drawdown']
const GROUPS: AssetType[] = ['stock', 'crypto', 'gold', 'cash']
const GROUP_LABEL: Record<AssetType, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt' }

const META: Record<PortfolioAlertKind, { title: string; desc: string; field: string; unit: string }> = {
  concentration: {
    title: 'Tập trung vào một tài sản',
    desc: 'Nhắc khi một tài sản (không tính tiền mặt) chiếm trên ngưỡng này của tổng tài sản.',
    field: 'Trên',
    unit: '%',
  },
  drift: {
    title: 'Lệch tỷ trọng mục tiêu',
    desc: 'Nhắc khi một nhóm tài sản lệch khỏi tỷ trọng bạn đặt từ số điểm % này.',
    field: 'Lệch từ',
    unit: 'điểm',
  },
  drawdown: {
    title: 'Giảm từ đỉnh gần đây',
    desc: 'Nhắc khi danh mục giảm từ ngưỡng này so với đỉnh, đã loại tiền nạp / rút nên nạp hay rút không bị tính là lãi / lỗ.',
    field: 'Giảm từ',
    unit: '%',
  },
}

interface Draft {
  enabled: boolean
  threshold: string
  windowDays: number
  cooldownDays: number
  targets: Record<AssetType, string> | null
}

const draftOf = (r: PortfolioAlertRule): Draft => ({
  enabled: r.enabled,
  threshold: String(r.thresholdPct),
  windowDays: r.windowDays ?? 30,
  cooldownDays: r.cooldownDays,
  targets: r.targets
    ? (Object.fromEntries(GROUPS.map((g) => [g, String(r.targets![g])])) as Record<AssetType, string>)
    : null,
})

const targetsOf = (t: GroupTargets): Record<AssetType, string> =>
  Object.fromEntries(GROUPS.map((g) => [g, String(t[g])])) as Record<AssetType, string>

const targetSum = (t: Record<AssetType, string>) => GROUPS.reduce((s, g) => s + (parseNum(t[g] || '0') || 0), 0)

/** Lỗi nhập của một dòng (null = hợp lệ) — cùng giới hạn với backend (portfolio-alerts/rules.ts) */
function draftError(kind: PortfolioAlertKind, d: Draft, s: PortfolioAlertSettings): string | null {
  const lim = s.limits.threshold[kind]
  const v = parseNum(d.threshold)
  if (!Number.isFinite(v) || v < lim.min || v > lim.max) return `Ngưỡng từ ${lim.min} đến ${lim.max}`
  if (kind === 'drift') {
    if (!d.targets) return d.enabled ? 'Đặt tỷ trọng mục tiêu trước khi bật' : null
    if (GROUPS.some((g) => !Number.isFinite(parseNum(d.targets![g] || '0')) || parseNum(d.targets![g] || '0') < 0))
      return 'Tỷ trọng mỗi nhóm từ 0 đến 100%'
    const sum = targetSum(d.targets)
    if (Math.abs(sum - 100) > 0.5) return `Tổng tỷ trọng mục tiêu phải là 100% (đang là ${Math.round(sum * 10) / 10}%)`
  }
  return null
}

function toRequest(kind: PortfolioAlertKind, d: Draft): PortfolioAlertRuleRequest {
  return {
    enabled: d.enabled,
    thresholdPct: parseNum(d.threshold),
    windowDays: kind === 'drawdown' ? d.windowDays : null,
    targets:
      kind === 'drift' && d.targets
        ? (Object.fromEntries(GROUPS.map((g) => [g, parseNum(d.targets![g] || '0')])) as GroupTargets)
        : null,
    cooldownDays: d.cooldownDays,
  }
}

const same = (kind: PortfolioAlertKind, a: Draft, b: Draft) =>
  JSON.stringify(toRequest(kind, a)) === JSON.stringify(toRequest(kind, b))

/**
 * Cảnh báo theo tình trạng danh mục: mỗi quy tắc một dòng (bật/tắt, ngưỡng, tần suất nhắc lại) và dòng "Hiện tại"
 * xem trước theo đúng giá trị đang nhập — chưa cần lưu, không gửi thông báo.
 */
export default function PortfolioAlertsPanel({ standalone }: { standalone?: boolean }) {
  const [settings, setSettings] = useState<PortfolioAlertSettings | null>(null)
  const [saved, setSaved] = useState<Record<PortfolioAlertKind, Draft> | null>(null)
  const [drafts, setDrafts] = useState<Record<PortfolioAlertKind, Draft> | null>(null)
  const [preview, setPreview] = useState<PortfolioAlertPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [rowError, setRowError] = useState<Partial<Record<PortfolioAlertKind, string>>>({})
  const [saving, setSaving] = useState<PortfolioAlertKind | null>(null)
  const seq = useRef(0)

  const apply = useCallback((rules: PortfolioAlertRule[]) => {
    const next = Object.fromEntries(rules.map((r) => [r.kind, draftOf(r)])) as Record<PortfolioAlertKind, Draft>
    setSaved(next)
    setDrafts(next)
  }, [])

  useEffect(() => {
    api<PortfolioAlertSettings>('/portfolio-alerts')
      .then((s) => {
        setSettings(s)
        apply(s.rules)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [apply])

  // Xem trước theo giá trị đang nhập (dòng nhập sai thì dùng cài đặt đã lưu của dòng đó)
  useEffect(() => {
    if (!drafts || !settings) return
    const rules = KINDS.filter((k) => !draftError(k, { ...drafts[k], enabled: false }, settings)).map((k) => ({
      kind: k,
      ...toRequest(k, drafts[k]),
    }))
    const id = ++seq.current
    const t = setTimeout(() => {
      setPreviewing(true)
      post<PortfolioAlertPreview>('/portfolio-alerts/preview', { rules })
        .then((p) => id === seq.current && setPreview(p))
        .catch(() => id === seq.current && setPreview(null))
        .finally(() => id === seq.current && setPreviewing(false))
    }, 400)
    return () => clearTimeout(t)
  }, [drafts, settings])

  const change = (kind: PortfolioAlertKind, patch: Partial<Draft>) => {
    setRowError((e) => ({ ...e, [kind]: undefined }))
    setDrafts((d) => (d ? { ...d, [kind]: { ...d[kind], ...patch } } : d))
  }

  const save = async (kind: PortfolioAlertKind, d: Draft) => {
    if (!settings) return
    const err = draftError(kind, d, settings)
    if (err) {
      setRowError((e) => ({ ...e, [kind]: err }))
      return
    }
    setSaving(kind)
    try {
      const r = await put<PortfolioAlertRule>(`/portfolio-alerts/${kind}`, toRequest(kind, d))
      setSettings((s) => (s ? { ...s, rules: s.rules.map((x) => (x.kind === kind ? r : x)) } : s))
      setSaved((s) => (s ? { ...s, [kind]: draftOf(r) } : s))
      setDrafts((s) => (s ? { ...s, [kind]: draftOf(r) } : s))
    } catch (e) {
      setRowError((x) => ({ ...x, [kind]: (e as Error).message }))
    } finally {
      setSaving(null)
    }
  }

  const toggle = (kind: PortfolioAlertKind, enabled: boolean) => {
    if (!drafts) return
    const d = { ...drafts[kind], enabled }
    // Bật lệch tỷ trọng khi chưa có mục tiêu: mở phần nhập mục tiêu thay vì báo lỗi
    if (enabled && kind === 'drift' && !d.targets) {
      change(kind, { targets: settings?.suggestions[0] ? targetsOf(settings.suggestions[0].targets) : emptyTargets() })
      setRowError((e) => ({ ...e, drift: 'Kiểm tra tỷ trọng mục tiêu rồi bật lại' }))
      return
    }
    setDrafts((s) => (s ? { ...s, [kind]: d } : s))
    void save(kind, d)
  }

  return (
    <Panel
      // Trang riêng đã có tiêu đề và lời giới thiệu: khung không lặp lại
      title={standalone ? undefined : 'Cảnh báo danh mục'}
      subtitle={
        standalone
          ? undefined
          : 'Nhắc bạn xem lại khi cả danh mục vượt ngưỡng bạn đặt. Đây là lời nhắc, không phải khuyến nghị mua bán.'
      }
      noPadding
      data-testid="portfolio-alerts"
      action={
        !standalone && (
          <Link component={RouterLink} to="/portfolio-alerts" variant="body2">
            Mở trang
          </Link>
        )
      }
    >
      {loadError && (
        <Alert severity="error" sx={{ m: 2 }}>
          {loadError}
        </Alert>
      )}
      {!settings || !drafts || !saved ? (
        !loadError && (
          <Box sx={{ p: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )
      ) : (
        <>
          {KINDS.map((kind) => (
            <RuleRow
              key={kind}
              kind={kind}
              draft={drafts[kind]}
              dirty={!same(kind, drafts[kind], saved[kind])}
              rule={settings.rules.find((r) => r.kind === kind)!}
              settings={settings}
              preview={preview?.items.find((i) => i.kind === kind) ?? null}
              previewing={previewing}
              error={rowError[kind] ?? (drafts[kind].targets || kind !== 'drift' ? draftError(kind, drafts[kind], settings) : null)}
              saving={saving === kind}
              onChange={(p) => change(kind, p)}
              onToggle={(v) => toggle(kind, v)}
              onSave={() => void save(kind, drafts[kind])}
              onReset={() => {
                setRowError((e) => ({ ...e, [kind]: undefined }))
                setDrafts((s) => (s ? { ...s, [kind]: saved[kind] } : s))
              }}
            />
          ))}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1.5, m: 0 }}>
            Kiểm tra mỗi 30 phút trong phiên và lúc 15:20 hằng ngày; giảm từ đỉnh chỉ kiểm tra sau phiên. Khi giá thiếu
            hoặc cũ, ứng dụng bỏ qua lượt đó thay vì báo. Thông báo luôn có trong app; gửi qua Telegram / thông báo đẩy
            khi bạn bật mục “Tình trạng danh mục” ở phần kênh nhận tin.
          </Typography>
        </>
      )}
    </Panel>
  )
}

/** Ngày/tháng theo giờ VN */
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))

const emptyTargets = (): Record<AssetType, string> => ({ stock: '', crypto: '', gold: '', cash: '' })

function RuleRow({
  kind,
  draft,
  dirty,
  rule,
  settings,
  preview,
  previewing,
  error,
  saving,
  onChange,
  onToggle,
  onSave,
  onReset,
}: {
  kind: PortfolioAlertKind
  draft: Draft
  dirty: boolean
  rule: PortfolioAlertRule
  settings: PortfolioAlertSettings
  preview: PortfolioAlertPreviewItem | null
  previewing: boolean
  error: string | null
  saving: boolean
  onChange: (p: Partial<Draft>) => void
  onToggle: (v: boolean) => void
  onSave: () => void
  onReset: () => void
}) {
  const meta = META[kind]
  const lim = settings.limits.threshold[kind]
  const titleId = `palert-${kind}-title`
  return (
    <Box
      data-testid={`palert-${kind}`}
      sx={{ px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider', opacity: saving ? 0.7 : 1 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant="body2" sx={{ fontWeight: 600 }}>
            {meta.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {meta.desc}
          </Typography>
        </Box>
        <Switch
          checked={draft.enabled}
          disabled={saving}
          onChange={(_, v) => onToggle(v)}
          slotProps={{ input: { 'aria-labelledby': titleId } }}
          sx={{ mt: -0.5, mr: -1 }}
        />
      </Stack>

      <Stack direction="row" useFlexGap sx={{ mt: 1.25, gap: 1, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label={meta.field}
          value={draft.threshold}
          onChange={(e) => onChange({ threshold: e.target.value })}
          slotProps={{
            input: { endAdornment: <InputAdornment position="end">{meta.unit}</InputAdornment> },
            htmlInput: { inputMode: 'decimal', 'aria-label': `${meta.title}: ngưỡng (${lim.min}–${lim.max})` },
          }}
          sx={{ width: 112 }}
        />
        {kind === 'drawdown' && (
          <TextField
            select
            size="small"
            label="So với đỉnh"
            value={draft.windowDays}
            onChange={(e) => onChange({ windowDays: Number(e.target.value) })}
            sx={{ width: 124 }}
          >
            {settings.limits.windowDays.map((d) => (
              <MenuItem key={d} value={d}>
                {d} ngày
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label="Nhắc lại"
          value={draft.cooldownDays}
          onChange={(e) => onChange({ cooldownDays: Number(e.target.value) })}
          sx={{ width: 140 }}
        >
          {settings.limits.cooldownDays.map((d) => (
            <MenuItem key={d} value={d}>
              {d === 1 ? 'Mỗi ngày' : `Mỗi ${d} ngày`}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {kind === 'drift' && <TargetsEditor draft={draft} settings={settings} onChange={onChange} />}

      <PreviewLine preview={preview} previewing={previewing} enabled={draft.enabled} />

      {error && (
        <Typography variant="caption" color="error" component="div" role="alert" sx={{ mt: 0.75 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 0.75, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        {rule.lastNotifiedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Báo gần nhất {timeAgo(rule.lastNotifiedAt)}
          </Typography>
        )}
        {dirty && (
          <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
            <Button size="small" color="inherit" onClick={onReset} disabled={saving}>
              Huỷ
            </Button>
            <Button size="small" variant="contained" onClick={onSave} disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

/** Tỷ trọng mục tiêu theo nhóm: gợi ý từ hồ sơ / mục tiêu tài chính, hoặc tự nhập */
function TargetsEditor({
  draft,
  settings,
  onChange,
}: {
  draft: Draft
  settings: PortfolioAlertSettings
  onChange: (p: Partial<Draft>) => void
}) {
  const [editing, setEditing] = useState(false)
  const t = draft.targets
  const sum = t ? targetSum(t) : 0
  const summary = useMemo(
    () => (t ? GROUPS.map((g) => `${GROUP_LABEL[g]} ${t[g] || 0}%`).join(' · ') : null),
    [t],
  )

  if (t && !editing) {
    return (
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" className="num" sx={{ flex: 1, minWidth: 0 }}>
          Mục tiêu: {summary}
        </Typography>
        <Button size="small" onClick={() => setEditing(true)}>
          Sửa
        </Button>
      </Stack>
    )
  }

  return (
    <Box sx={{ mt: 1.25 }}>
      {settings.suggestions.length > 0 && (
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
          {settings.suggestions.map((s) => (
            <Chip
              key={s.label}
              label={s.label}
              variant="outlined"
              onClick={() => onChange({ targets: targetsOf(s.targets) })}
              sx={{ maxWidth: '100%' }}
            />
          ))}
        </Stack>
      )}
      {!t ? (
        <Button size="small" variant="outlined" onClick={() => onChange({ targets: emptyTargets() })}>
          Tự nhập tỷ trọng mục tiêu
        </Button>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
            {GROUPS.map((g) => (
              <TextField
                key={g}
                size="small"
                label={GROUP_LABEL[g]}
                value={t[g]}
                onChange={(e) => onChange({ targets: { ...t, [g]: e.target.value } })}
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                  htmlInput: { inputMode: 'decimal' },
                }}
              />
            ))}
          </Box>
          <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography
              variant="caption"
              className="num"
              color={Math.abs(sum - 100) > 0.5 ? 'error' : 'text.secondary'}
            >
              Tổng {Math.round(sum * 10) / 10}%
            </Typography>
            {editing && Math.abs(sum - 100) <= 0.5 && (
              <Button size="small" onClick={() => setEditing(false)}>
                Xong
              </Button>
            )}
          </Stack>
        </>
      )}
    </Box>
  )
}

/** "Hiện tại: FPT chiếm 42% (ngưỡng 30%) → sẽ báo" */
function PreviewLine({
  preview,
  previewing,
  enabled,
}: {
  preview: PortfolioAlertPreviewItem | null
  previewing: boolean
  enabled: boolean
}) {
  if (!preview) {
    return (
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        {previewing ? 'Đang xem trước…' : 'Chưa xem trước được'}
      </Typography>
    )
  }
  const firing = preview.status === 'firing'
  const outcome =
    preview.status === 'skipped'
      ? null
      : !firing
        ? 'chưa tới ngưỡng'
        : !enabled
          ? 'bật để nhận nhắc'
          : preview.wouldNotify
            ? 'sẽ báo'
            : preview.nextAllowedAt
              ? `đã báo gần đây, nhắc lại từ ${shortDate(preview.nextAllowedAt)}`
              : 'sẽ báo'
  const tone = preview.status === 'skipped' ? 'text.secondary' : firing ? 'warning.main' : 'success.main'
  return (
    <Box
      data-testid="palert-preview"
      data-status={preview.status}
      sx={{
        mt: 1.25,
        pl: 1.25,
        py: 0.5,
        borderLeft: 3,
        borderColor: tone,
        opacity: previewing ? 0.6 : 1,
        transition: 'opacity .2s',
      }}
    >
      <Typography variant="body2" className="num" sx={{ lineHeight: 1.45 }}>
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {preview.status === 'skipped' ? 'Chưa kiểm tra: ' : 'Hiện tại: '}
        </Box>
        {preview.headline}
        {outcome && (
          <Box component="span" sx={{ color: tone, fontWeight: 600 }}>
            {' '}
            → {outcome}
          </Box>
        )}
      </Typography>
      {preview.reason && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
          {preview.reason}
        </Typography>
      )}
    </Box>
  )
}
