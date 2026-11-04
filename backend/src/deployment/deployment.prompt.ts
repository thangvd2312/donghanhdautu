import type { DeployPart, DeployRationale, DeploymentPreview } from '@dautu/contracts';
import { PARTS } from './deployment.mix';

/** AI chỉ diễn giải: tóm tắt + một đoạn "vì sao" cho mỗi phần có trong kế hoạch */
export const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'parts'],
  properties: {
    summary: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['part', 'why'],
        properties: {
          part: { type: 'string', enum: PARTS },
          why: { type: 'string' },
        },
      },
    },
  },
};

export const EXPLAIN_PROMPT = `Bạn là cố vấn của ứng dụng "Đồng Hành Đầu Tư", giải thích một KẾ HOẠCH GIẢI NGÂN đã được tính sẵn cho một nhà đầu tư cá nhân người Việt. Kế hoạch (tỷ trọng, số tiền, sản phẩm, số đợt) do quy tắc của ứng dụng tính theo hồ sơ khẩu vị rủi ro và danh mục của họ. Việc của bạn là giúp họ HIỂU vì sao kế hoạch như vậy để bám theo được khi thị trường biến động, không phải lập kế hoạch khác.

Viết bằng tiếng Việt, giọng một người anh đi trước: điềm tĩnh, cụ thể, không lên lớp.
- summary: 3–5 câu. Nói kế hoạch này hợp với người này ở điểm nào (kiểu nhà đầu tư, lúc cần tiền, mức lỗ chịu được, các điều chỉnh đã áp dụng), kịch bản xấu nghĩa là gì với họ bằng tiền, và một việc quan trọng nhất cần giữ kỷ luật (ví dụ: mua đúng lịch, không mua thêm ngoài kế hoạch khi giá tăng nóng).
- parts: mỗi phần có trong dữ liệu parts (kể cả phần không mua thêm) đúng một mục, 1–3 câu: vì sao tỷ trọng này, vì sao chọn sản phẩm này, cách mua này giúp gì. Phần có note thì giải thích note.

Quy tắc bắt buộc:
- Chỉ dùng con số có trong dữ liệu (được làm tròn như dữ liệu hiển thị). KHÔNG tự tính số mới, không ước lượng lợi nhuận, không nêu lãi suất, giá hay số liệu thị trường nào không có trong dữ liệu.
- Không hứa hay gợi ý lợi nhuận. Không nói "chắc chắn", "an toàn tuyệt đối".
- Không gợi ý mã cổ phiếu riêng lẻ. Phần cổ phiếu tự chọn: nhắc người dùng tự chọn mã khi đã có luận điểm và viết kế hoạch cho mã đó.
- Không khuyên đòn bẩy, altcoin, "chờ đáy" hay canh thời điểm mua.
- Người dùng tự chỉnh tỷ trọng khác gợi ý (overrides, warnings) thì nói thẳng phần nào cao hơn gợi ý và rủi ro đi kèm, không phán xét.
- Không dùng emoji, không markdown đậm/nghiêng, không tiêu đề.`;

/** Dữ liệu đưa cho AI (và dùng để đối chiếu số): kết quả quy tắc, bỏ chi tiết từng đợt và phần chữ mẫu */
export function explainInput(p: Omit<DeploymentPreview, 'steps'>) {
  return {
    amount: p.amount,
    monthlyAmount: p.monthlyAmount,
    mode:
      p.mode === 'monthly'
        ? 'góp mỗi tháng'
        : p.mode === 'both'
          ? 'vốn ban đầu cộng góp mỗi tháng'
          : 'giải ngân một lần',
    horizon: { short: 'cần tiền trong vòng 1 năm', medium: 'cần tiền trong 1–3 năm', long: 'trên 3 năm' }[p.horizon],
    needBy: p.needBy,
    tranches: p.tranches,
    etf: p.etf,
    profile: p.profile,
    safety: p.safety.map((s) => ({ kind: s.kind, need: s.need, amount: s.amount, text: s.text })),
    investable: p.investable,
    mix: p.mix,
    suggestedMix: p.suggestedMix,
    adjustments: p.adjustments.map((a) => a.text),
    overrides: p.overrides,
    warnings: p.warnings,
    // Tên khoá "decline" / "drawdown": bộ đối chiếu số hiểu là độ lớn của mức giảm ("giảm 26%" khớp 26)
    worstCase: {
      declinePct: p.worstCase.dropPct,
      maxDrawdownPct: p.worstCase.limitPct,
      ok: p.worstCase.ok,
      afterTotal: p.worstCase.afterTotal,
      declineVnd: p.worstCase.afterDropVnd,
      afterDeclinePct: p.worstCase.afterDropPct,
      shocks: p.worstCase.shocks,
    },
    currentTotal: p.current.total,
    parts: p.parts.map((x) => ({
      part: x.part,
      label: x.label,
      targetPct: x.targetPct,
      suggestedPct: x.suggestedPct,
      currentPct: x.currentPct,
      afterPct: x.afterPct,
      amount: x.amount,
      instrument: x.instrument,
      how: x.how,
      note: x.note,
    })),
  };
}

/** Kiểm tra kết quả AI: đủ chữ, chỉ các phần có trong kế hoạch, mỗi phần một lần; sai thì null */
export function parseExplain(raw: unknown, parts: DeployPart[]): Pick<DeployRationale, 'summary' | 'parts'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { summary?: unknown; parts?: unknown };
  if (typeof r.summary !== 'string' || r.summary.trim().length < 20 || !Array.isArray(r.parts)) return null;
  const out: Partial<Record<DeployPart, string>> = {};
  for (const item of r.parts as { part?: unknown; why?: unknown }[]) {
    const part = item?.part as DeployPart;
    if (!parts.includes(part) || typeof item.why !== 'string' || !item.why.trim() || out[part]) continue;
    out[part] = item.why.trim().slice(0, 800);
  }
  if (!parts.every((p) => out[p])) return null;
  return { summary: r.summary.trim().slice(0, 1500), parts: out };
}

/** Văn bản để đối chiếu số (writeChecked đọc `markdown`) */
export const explainMarkdown = (e: Pick<DeployRationale, 'summary' | 'parts'>) =>
  [e.summary, ...Object.values(e.parts)].join('\n\n');
