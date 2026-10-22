import { Injectable, Logger } from '@nestjs/common';
import type { Verification, VerificationIssue } from '@dautu/contracts';
import { LlmService } from '../alerts/llm.service';
import { VERIFY_PROMPT } from './prompt';

export interface Evidence {
  id: string;
  tool: string;
  input: unknown;
  content: string;
}

export type { Verification };
const SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['misattribution', 'number_mismatch', 'unsupported'] },
          quote: { type: 'string' },
          evidenceQuote: { type: 'string' },
          explanation: { type: 'string' },
          correction: { type: 'string' },
        },
        required: ['type', 'quote', 'evidenceQuote', 'explanation', 'correction'],
        additionalProperties: false,
      },
    },
  },
  required: ['issues'],
  additionalProperties: false,
};

/**
 * Giới hạn độ dài bằng chứng: mỗi mục tối đa 80k ký tự, tổng tối đa 300k (~100k token, vừa ngữ cảnh model
 * kiểm tra). Dữ liệu cổ phiếu đầy đủ đã ~45–65k ký tự — cắt ngắn hơn sẽ làm mất phần cổ đông, giao dịch nội bộ
 * ở cuối và bộ kiểm tra báo nhầm "không có nguồn".
 */
const MAX_EVIDENCE_CHARS = 80_000;
const MAX_TOTAL_EVIDENCE_CHARS = 300_000;

/** Cắt bằng chứng theo giới hạn; mục nào bị cắt được đánh dấu để bộ kiểm tra không kết luận "không có nguồn" */
export function fitEvidence(evidence: Evidence[]) {
  const total = evidence.reduce((s, e) => s + Math.min(e.content.length, MAX_EVIDENCE_CHARS), 0);
  const cap =
    total > MAX_TOTAL_EVIDENCE_CHARS
      ? Math.floor(MAX_EVIDENCE_CHARS * (MAX_TOTAL_EVIDENCE_CHARS / total))
      : MAX_EVIDENCE_CHARS;
  return evidence.map((e) =>
    e.content.length > cap ? { ...e, content: e.content.slice(0, cap), truncated: true } : e,
  );
}

/**
 * Đối chiếu câu trả lời của cố vấn với chính dữ liệu cố vấn đã dùng.
 * Kết quả của model kiểm tra cũng được kiểm lại bằng code: mỗi lỗi phải trích được nguyên văn
 * trong câu trả lời, và (với sai số / sai nguồn) trích được nguyên văn trong bằng chứng — nếu không thì loại.
 */
@Injectable()
export class VerifierService {
  private log = new Logger(VerifierService.name);

  constructor(private llm: LlmService) {}

  async verify(answer: string, evidence: Evidence[], userId?: string): Promise<Verification> {
    const checkedAt = new Date().toISOString();
    if (!this.llm.enabled)
      return { status: 'skipped', issues: [], discarded: 0, checkedAt, reason: 'Chưa cấu hình AI' };
    if (answer.trim().length < 150 || !evidence.length) {
      return {
        status: 'skipped',
        issues: [],
        discarded: 0,
        checkedAt,
        reason: 'Câu trả lời ngắn hoặc không dùng dữ liệu',
      };
    }
    const ev = fitEvidence(evidence);
    const result = await this.llm.json<{ issues: VerificationIssue[] }>({
      tier: 'fast',
      feature: 'verifier',
      userId,
      system: VERIFY_PROMPT,
      user: JSON.stringify({ answer, evidence: ev }),
      schema: SCHEMA,
      maxTokens: 6000,
    });
    if (!result)
      return { status: 'skipped', issues: [], discarded: 0, checkedAt, reason: 'Bộ kiểm tra không phản hồi' };

    const answerNorm = norm(answer);
    const evidenceNorm = norm(ev.map((e) => e.content).join('\n'));
    const kept: VerificationIssue[] = [];
    let discarded = 0;
    for (const i of result.issues ?? []) {
      const quoteOk = i.quote?.trim().length >= 6 && answerNorm.includes(norm(i.quote));
      const needsEvidence = i.type !== 'unsupported';
      const evidenceOk =
        !needsEvidence || (i.evidenceQuote?.trim().length >= 4 && evidenceNorm.includes(norm(i.evidenceQuote)));
      if (quoteOk && evidenceOk) kept.push(i);
      else discarded++;
    }
    if (discarded) this.log.warn(`Loại ${discarded} lỗi không trích được nguyên văn`);
    return { status: kept.length ? 'issues' : 'verified', issues: kept, discarded, checkedAt };
  }
}

/** Chuẩn hoá để so khớp nguyên văn: bỏ định dạng Markdown, gộp khoảng trắng, chữ thường, bỏ escape JSON */
function norm(s: string) {
  return s
    .normalize('NFC')
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
