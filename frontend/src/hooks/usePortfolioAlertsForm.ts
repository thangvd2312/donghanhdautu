import { useCallback, useEffect, useRef, useState } from 'react'
import { getPortfolioAlertSettings, previewPortfolioAlerts, savePortfolioAlertRule } from '../api/portfolioAlerts'
import {
  draftError,
  draftOf,
  emptyTargets,
  KINDS,
  targetsOf,
  toRequest,
  type Draft,
} from '../lib/portfolioAlerts'
import type {
  PortfolioAlertKind,
  PortfolioAlertPreview,
  PortfolioAlertRule,
  PortfolioAlertSettings,
} from '../lib/types'

/**
 * Trạng thái form "Cảnh báo danh mục": cài đặt từ máy chủ, bản nháp đang nhập, bản đã lưu, xem trước theo giá trị đang nhập
 * (chưa cần lưu, trễ 400 ms) và lưu từng quy tắc. Lỗi nhập hiện theo từng dòng.
 */
export function usePortfolioAlertsForm() {
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
    getPortfolioAlertSettings()
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
      previewPortfolioAlerts({ rules })
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
      const r = await savePortfolioAlertRule(kind, toRequest(kind, d))
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

  const reset = (kind: PortfolioAlertKind) => {
    setRowError((e) => ({ ...e, [kind]: undefined }))
    setDrafts((s) => (s && saved ? { ...s, [kind]: saved[kind] } : s))
  }

  return { settings, saved, drafts, preview, previewing, loadError, rowError, saving, change, save, toggle, reset }
}
