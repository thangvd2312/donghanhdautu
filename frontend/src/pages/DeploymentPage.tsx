import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined'
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { explainDeployment, getActiveDeployment, getDeploymentSetup, saveDeployment } from '../api/deployment'
import { listPortfolios } from '../api/portfolio'
import ActivePlan from '../components/deployment/ActivePlan'
import { AmountPanel, OptionsPanel, SafetyPanel } from '../components/deployment/DeployInputs'
import DeployResult from '../components/deployment/DeployResult'
import { EmptyState, PageHeader } from '../components/page'
import { DialogHeader } from '../components/ui'
import { useDeploymentPreview } from '../hooks/useDeploymentPreview'
import { useResource } from '../hooks/useResource'
import { buildDeployRequest, initialForm, parseDeployParams, type DeployForm } from '../lib/deployment'
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
    if (setup && !form) setForm(initialForm(setup, building ? parseDeployParams(params) : {}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Hành động"
        title="Kế hoạch giải ngân"
        description="Có một khoản tiền mà chưa biết mua gì? Nhập số tiền, app chia vào từng loại tài sản theo hồ sơ của bạn: bao nhiêu, mua gì, mấy đợt, và vì sao."
        actions={
          plan && !building ? (
            <Button variant="contained" onClick={() => setParams({ new: '1' })} sx={{ borderRadius: 99 }}>
              Lập kế hoạch mới
            </Button>
          ) : undefined
        }
      />

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
        />
      ) : !setup.profile ? (
        <EmptyState
          Icon={PsychologyOutlined}
          title="Cần biết khẩu vị rủi ro của bạn trước"
          action={
            <Button component={RouterLink} to="/onboarding" variant="contained" sx={{ borderRadius: 99 }}>
              Làm khảo sát
            </Button>
          }
        >
Khảo sát mất khoảng 2 phút.
        </EmptyState>
      ) : (
        form && (
          <>
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
                Đang có kế hoạch{runningPlan ? ' chạy' : ''}. Lưu mới sẽ thay kế hoạch đó.
              </Alert>
            )}
            {/* Desktop: nhập bên trái, kết quả bên phải; điện thoại: nhập trước rồi tới kết quả */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'minmax(0, 1fr)',
                  md: '380px minmax(0, 1fr)',
                },
                gap: { xs: 2.5, md: 3 },
                alignItems: 'start',
              }}
            >
              <Stack spacing={2.5} sx={{ minWidth: 0 }}>
                <AmountPanel form={form} setup={setup} onChange={patch} />
                <SafetyPanel form={form} setup={setup} onChange={patch} />
                <OptionsPanel form={form} setup={setup} onChange={patch} />
              </Stack>
              <Stack spacing={2.5} sx={{ minWidth: 0 }}>
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
                      edit={{
                        editing,
                        onToggle: () => setEditing((v) => !v),
                        onMix: (mix) => patch({ mix }),
                      }}
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
                    <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: { xs: 'none', md: 'block' } }}>
                      App nhắc 8:00 ngày đến hạn từng đợt. Không tự ghi giao dịch: bạn bấm "Đã mua" rồi xác nhận mới ghi sổ.
                    </Typography>
                  </>
                ) : (
                  !error && (
                    <Box data-testid="dp-placeholder">
                      <EmptyState
                        Icon={PaymentsOutlined}
                        title={computing ? 'Đang lập kế hoạch…' : 'Nhập số tiền từ 1 triệu'}
                      >
                        {computing ? undefined : 'Kế hoạch hiện ở đây: chia vào đâu, mua gì, mấy đợt.'}
                      </EmptyState>
                    </Box>
                  )
                )}
              </Stack>
            </Box>
          </>
        )
      )}

      <Typography variant="caption" color="text.secondary" sx={{ pb: 1 }}>
        <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
          Kế hoạch tham khảo theo hồ sơ của bạn, không phải khuyến nghị mua bán; quyết định là của bạn. App không chọn mã cổ phiếu riêng
          lẻ thay bạn.{' '}
        </Box>
        <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
          Chỉ để tham khảo, không phải khuyến nghị.{' '}
        </Box>
        {res && (building || !plan) ? `Giá tính đến ${fmtDate(res.asOf)}.` : ''}
      </Typography>

      <Dialog open={confirmReplace} onClose={() => setConfirmReplace(false)} fullWidth maxWidth="xs">
        <DialogHeader onClose={() => setConfirmReplace(false)}>Thay kế hoạch đang chạy?</DialogHeader>
        <DialogContent>
          <Typography variant="body2">Kế hoạch cũ sẽ ngừng nhắc các đợt còn lại. Giao dịch đã ghi sổ giữ nguyên trong Danh mục.</Typography>
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
