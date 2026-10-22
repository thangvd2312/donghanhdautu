import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { JournalEmotion, JournalReason, JournalReviewTagRequest, JournalTagRequest } from '@dautu/contracts';
import { isJournalTxType, JOURNAL_EMOTIONS, JOURNAL_REASONS, PLAN_LINK_TX_TYPES } from './journal-logic';

/** Nhãn nhật ký trên một lần xem lại kế hoạch (dùng chung cho POST /plans/:id/reviews và PATCH /journal/reviews/:id) */
export class JournalReviewTagsDto implements JournalReviewTagRequest {
  @IsOptional() @IsIn(JOURNAL_REASONS, { message: 'Lý do không hợp lệ' }) reason?: JournalReason | null;
  @IsOptional() @IsIn(JOURNAL_EMOTIONS, { message: 'Cảm xúc không hợp lệ' }) emotion?: JournalEmotion | null;
}

/** Nhãn nhật ký trên giao dịch. Bỏ trường = giữ nguyên; null = xoá */
export class JournalTagsDto extends JournalReviewTagsDto implements JournalTagRequest {
  @IsOptional() @IsString() @MaxLength(40) planId?: string | null;
}

export interface TaggableTx {
  type: string;
  assetType: string | null;
  symbol: string | null;
  /** Giá trị đang lưu (khi sửa); undefined với giao dịch mới */
  current?: { reason: string | null; emotion: string | null; planId: string | null };
}

export interface JournalColumns {
  reason?: string | null;
  emotion?: string | null;
  planId?: string | null;
}

type Db = Pick<Prisma.TransactionClient, 'investmentPlan'>;

/**
 * Cột nhật ký cần ghi cho một giao dịch, đã kiểm tra:
 * - chỉ mua / bán / nạp / rút nhận nhãn; đổi sang loại khác thì xoá nhãn cũ;
 * - chỉ mua / bán gắn được kế hoạch, và kế hoạch phải của chính người dùng, cùng loại tài sản + mã.
 * Khi sửa mà không gửi planId, liên kết cũ được giữ nếu vẫn khớp tài sản, không khớp nữa thì gỡ (không báo lỗi).
 * Trả về chỉ những cột cần đổi.
 */
export async function journalColumns(
  db: Db,
  userId: string,
  tx: TaggableTx,
  dto: JournalTagRequest,
): Promise<JournalColumns> {
  const has = (v: unknown) => v !== undefined && v !== null;
  if (!isJournalTxType(tx.type)) {
    if (has(dto.reason) || has(dto.emotion) || has(dto.planId)) {
      throw new BadRequestException('Chỉ gắn nhãn nhật ký cho giao dịch mua, bán, nạp hoặc rút tiền');
    }
    const c = tx.current;
    return c && (c.reason || c.emotion || c.planId) ? { reason: null, emotion: null, planId: null } : {};
  }
  const out: JournalColumns = {};
  if (dto.reason !== undefined) out.reason = dto.reason;
  if (dto.emotion !== undefined) out.emotion = dto.emotion;

  const linkable = (PLAN_LINK_TX_TYPES as readonly string[]).includes(tx.type);
  if (dto.planId !== undefined && dto.planId !== null) {
    if (!linkable) throw new BadRequestException('Chỉ gắn lệnh mua hoặc bán vào kế hoạch');
    const plan = await db.investmentPlan.findFirst({ where: { id: dto.planId, userId } });
    if (!plan) throw new NotFoundException('Không tìm thấy kế hoạch');
    if (plan.assetType !== tx.assetType || plan.symbol !== tx.symbol) {
      throw new BadRequestException('Kế hoạch này dành cho tài sản khác với giao dịch');
    }
    out.planId = plan.id;
  } else if (dto.planId === null) {
    out.planId = null;
  } else if (tx.current?.planId) {
    // Không gửi planId khi sửa: giữ liên kết nếu vẫn đúng tài sản
    const plan = linkable
      ? await db.investmentPlan.findFirst({
          where: { id: tx.current.planId, userId },
          select: { assetType: true, symbol: true },
        })
      : null;
    if (!plan || plan.assetType !== tx.assetType || plan.symbol !== tx.symbol) out.planId = null;
  }
  return out;
}
