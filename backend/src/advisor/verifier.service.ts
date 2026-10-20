import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../alerts/llm.service';
import { VERIFY_PROMPT } from './prompt';

export interface Evidence {
  id: string;
  tool: string;
  input: unknown;
  content: string;
}

export interface VerificationIssue {
  type: 'misattribution' | 'number_mismatch' | 'unsupported';
  quote: string;
  evidenceQuote: string;
  explanation: string;
  correction: string;
}

export interface Verification {
  status: 'verified' | 'issues' | 'skipped';
  issues: VerificationIssue[];
  /** Số lỗi model kiểm tra đưa ra nhưng bị loại vì không trích được nguyên văn (chống bịa lỗi) */
  discarded: number;
  checkedAt: string;
  reason?: string;
}

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

/** Giới hạn độ dài mỗi mục bằng chứng để một trang quá dài không chiếm hết ngữ cảnh */
const MAX_EVIDENCE_CHARS = 20000;

/**
 * Đối chiếu câu trả lời của cố vấn với chính dữ liệu cố vấn đã dùng.
 * Kết quả của model kiểm tra cũng được kiểm lại bằng code: mỗi lỗi phải trích được nguyên văn
 * trong câu trả lời, và (với sai số / sai nguồn) trích được nguyên văn trong bằng chứng — nếu không thì loại.
 */
@Injectable()
export class VerifierService {
  private log = new Logger(VerifierService.name);

  constructor(private llm: LlmService) {}

  async verify(answer: string, evidence: Evidence[]): Promise<Verification> {
    const checkedAt = new Date().toISOString();
    if (!this.llm.enabled) return { status: 'skipped', issues: [], discarded: 0, checkedAt, reason: 'Chưa cấu hình AI' };
    if (answer.trim().length < 150 || !evidence.length) {
      return { status: 'skipped', issues: [], discarded: 0, checkedAt, reason: 'Câu trả lời ngắn hoặc không dùng dữ liệu' };
    }
    const ev = evidence.map((e) => ({ ...e, content: e.content.slice(0, MAX_EVIDENCE_CHARS) }));
    const result = await this.llm.json<{ issues: VerificationIssue[] }>({
      tier: 'fast',
      system: VERIFY_PROMPT,
      user: JSON.stringify({ answer, evidence: ev }),
      schema: SCHEMA,
      maxTokens: 6000,
    });
    if (!result) return { status: 'skipped', issues: [], discarded: 0, checkedAt, reason: 'Bộ kiểm tra không phản hồi' };

    const answerNorm = norm(answer);
    const evidenceNorm = norm(ev.map((e) => e.content).join('\n'));
    const kept: VerificationIssue[] = [];
    let discarded = 0;
    for (const i of result.issues ?? []) {
      const quoteOk = i.quote?.trim().length >= 6 && answerNorm.includes(norm(i.quote));
      const needsEvidence = i.type !== 'unsupported';
      const evidenceOk = !needsEvidence || (i.evidenceQuote?.trim().length >= 4 && evidenceNorm.includes(norm(i.evidenceQuote)));
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
