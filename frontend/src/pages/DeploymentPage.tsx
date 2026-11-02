import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { explainDeployment, getActiveDeployment, getDeploymentSetup, saveDeployment } from '../api/deployment'
import { listPortfolios } from '../api/portfolio'
import ActivePlan from '../components/deployment/ActivePlan'
import { AmountPanel, OptionsPanel, SafetyPanel } from '../components/deployment/DeployInputs'
import DeployResult from '../components/deployment/DeployResult'
import { DialogHeader } from '../components/ui'
import { useDeploymentPreview } from '../hooks/useDeploymentPreview'
import { useResource } from '../hooks/useResource'
import { buildDeployRequest, initialForm, type DeployForm } from '../lib/deployment'
import { fmtDate } from '../lib/format'
import { qk } from '../lib/query'

/**
 * Kế hoạch giải ngân: có X tiền thì chia vào loại tài sản nào, bao nhiêu, mua gì, mấy đợt, vì sao.
 * Tỷ trọng và số tiền do quy tắc ở backend tính theo hồ sơ khẩu vị rủi ro và danh mục đang có; trang này chỉ nhập và hiển thị.
 * Có kế hoạch đang chạy thì mở thẳng kế hoạch đó; `?new=1` (hoặc nút "Lập kế hoạch mới") mở màn lập kế hoạch.
 */
export default function DeploymentPage() {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const building = params.get('new') === '1'
  const { data: setup, error: setupError, loading, reload } = useResource(getDeploymentSetup, { key: qk.deploymentSetup })
  const active = useResource(getActiveDeployment, { key: qk.deployment })
  const { data: accounts } = useResource(listPortfolios, { key: qk.accounts })
  const [form, setForm] = useState<DeployForm | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)

  useEffect(() => {
    document.title = 'Kế hoạch giải ngân · Đồng Hành Đầu Tư'
  }, [])

  // Hồ sơ tải xong lần đầu: điền sẵn khung thời gian
  useEffect(() => {
    if (setup && !form) setForm(initialForm(setup))
  }, [setup, form])

  const req = form ? buildDeployRequest(form, setup) : null
  const bodyKey = req && (building || !active.data?.plan) ? JSON.stringify(req) : ''
  const { res, loading: computing, error, retry } = useDeploymentPreview(bodyKey)
  const patch = (p: Partial<DeployForm>) => setForm((f) => (f ? { ...f, ...p } : f))
  const plan = active.data?.plan ?? null
  const runningPlan = plan && plan.status === 'active'

  const save = async () => {
    if (!req) return
    setConfirmReplace(false)
    setSaving(true)
    setSaveError('')
    try {
      const saved = await saveDeployment(req)
      active.setData({ plan: saved })
      void client.invalidateQueries({ queryKey: qk.deploymentSetup })
      setParams({}, { replace: true })
      window.scrollTo({ top: 0 })
      // Lời giải thích của cố vấn viết sau, không chặn việc lưu; lỗi thì vẫn có lý do theo quy tắc và nút thử lại
      explainDeployment(saved.id)
        .then((v) => active.setData((cur) => (cur?.plan?.id === v.id ? { plan: v } : (cur ?? { plan: v }))))
        .catch(() => {})
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          Kế hoạch giải ngân
        </Typography>
      </Box>

      {loading || active.loading ? (
        <Stack spacing={1.5} aria-busy aria-label="Đang tải">
          <Skeleton variant="rounded" height={280} />
          <Skeleton variant="rounded" height={180} />
        </Stack>
      ) : !setup || !active.data ? (
        <Alert
          severity="warning"
          variant="outlined"
          action={
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                void reload()
                void active.reload()
              }}
              sx={{ minHeight: 36 }}
            >
              Thử lại
            </Button>
          }
        >
          {setupError || active.error || 'Chưa tải được dữ liệu, bạn thử lại nhé.'}
        </Alert>
      ) : plan && !building ? (
        <ActivePlan
          view={plan}
          accounts={accounts ?? []}
          onChange={(v) => {
            active.setData({ plan: v })
            if (!v) void client.invalidateQueries({ queryKey: qk.deploymentSetup })
          }}
          onNew={() => setParams({ new: '1' })}
        />
      ) : !setup.profile ? (
        <Paper sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Cần biết khẩu vị rủi ro của bạn trước</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Kế hoạch chia tiền dựa trên việc bạn chịu được lỗ bao nhiêu, bao lâu nữa cần tiền và kinh nghiệm của bạn. Bài khảo sát
            mất khoảng 2 phút.
          </Typography>
          <Button component={RouterLink} to="/onboarding" variant="contained">
            Làm khảo sát
          </Button>
        </Paper>
      ) : (
        form && (
          <>
            <Typography variant="body2" color="text.secondary">
              Có một khoản tiền mà chưa biết mua gì? Nhập số tiền, app chia vào từng loại tài sản theo hồ sơ của bạn: bao nhiêu, mua sản
              phẩm gì, mấy đợt, và vì sao.
            </Typography>
            {plan && (
              <Alert
                severity="info"
                variant="outlined"
                action={
                  <Button size="small" color="inherit" onClick={() => setParams({})} sx={{ minHeight: 36 }}>
                    Xem
                  </Button>
                }
              >
                Bạn đang có một kế hoạch giải ngân{runningPlan ? ' đang chạy' : ''}. Lưu kế hoạch mới sẽ thay kế hoạch đó.
              </Alert>
            )}
            <AmountPanel form={form} setup={setup} onChange={patch} />
            <SafetyPanel form={form} setup={setup} onChange={patch} />
            <OptionsPanel form={form} setup={setup} onChange={patch} />

            {error && (
              <Alert
                severity={error.bad ? 'info' : 'warning'}
                variant="outlined"
                role="alert"
                data-testid="dp-error"
                action={
                  error.bad ? undefined : (
                    <Button size="small" color="inherit" onClick={retry} sx={{ minHeight: 36 }}>
                      Thử lại
                    </Button>
                  )
                }
              >
                {error.bad ? error.message : 'Chưa lập được kế hoạch, bạn thử lại nhé.'}
              </Alert>
            )}

            {res ? (
              <>
                <DeployResult
                  res={res}
                  stale={computing || !req}
                  edit={{ editing, onToggle: () => setEditing((v) => !v), onMix: (mix) => patch({ mix }) }}
                />
                {saveError && (
                  <Alert severity="warning" variant="outlined">
                    {saveError}
                  </Alert>
                )}
                <Button
                  variant="contained"
                  size="large"
                  disabled={!req || computing || saving}
                  onClick={() => (runningPlan ? setConfirmReplace(true) : void save())}
                  data-testid="dp-save"
                  sx={{ borderRadius: 99, minHeight: 48 }}
                >
                  {saving ? 'Đang lưu…' : 'Lưu kế hoạch và nhắc theo lịch'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                  App nhắc 8:00 ngày đến hạn từng đợt. Không tự ghi giao dịch: bạn bấm "Đã mua" rồi xác nhận mới ghi sổ.
                </Typography>
              </>
            ) : (
              !error && (
                <Paper sx={{ p: 2.5, textAlign: 'center' }} data-testid="dp-placeholder">
                  <Typography color="text.secondary">
                    {computing ? 'Đang lập kế hoạch…' : 'Nhập số tiền (từ 1 triệu) để xem kế hoạch.'}
                  </Typography>
                </Paper>
              )
            )}
          </>
        )
      )}

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', pt: 0.5, pb: 1 }}>
        Kế hoạch tham khảo theo hồ sơ của bạn, không phải khuyến nghị mua bán; quyết định là của bạn. App không chọn mã cổ phiếu
        riêng lẻ thay bạn.
        {res && (building || !plan) ? ` Giá tính đến ${fmtDate(res.asOf)}.` : ''}
      </Typography>

      <Dialog open={confirmReplace} onClose={() => setConfirmReplace(false)} fullWidth maxWidth="xs">
        <DialogHeader onClose={() => setConfirmReplace(false)}>Thay kế hoạch đang chạy?</DialogHeader>
        <DialogContent>
          <Typography variant="body2">
            Kế hoạch cũ sẽ ngừng nhắc các đợt còn lại. Giao dịch đã ghi sổ giữ nguyên trong Danh mục.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReplace(false)}>Thôi</Button>
          <Button variant="contained" onClick={() => void save()}>
            Lưu kế hoạch mới
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
