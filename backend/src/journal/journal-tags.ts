import { BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import type { JournalEmotion, JournalReason, JournalTagRequest } from '@dautu/contracts';
import { isJournalTxType, JOURNAL_EMOTIONS, JOURNAL_REASONS } from './journal-logic';

/** Nhãn nhật ký trên giao dịch. Bỏ trường = giữ nguyên; null = xoá */
export class JournalTagsDto implements JournalTagRequest {
  @IsOptional() @IsIn(JOURNAL_REASONS, { message: 'Lý do không hợp lệ' }) reason?: JournalReason | null;
  @IsOptional() @IsIn(JOURNAL_EMOTIONS, { message: 'Cảm xúc không hợp lệ' }) emotion?: JournalEmotion | null;
}

interface TaggableTx {
  type: string;
  /** Giá trị đang lưu (khi sửa); undefined với giao dịch mới */
  current?: { reason: string | null; emotion: string | null };
}

interface JournalColumns {
  reason?: string | null;
  emotion?: string | null;
}

/**
 * Cột nhật ký cần ghi cho một giao dịch, đã kiểm tra: chỉ mua / bán / nạp / rút nhận nhãn; đổi sang loại khác thì
 * xoá nhãn cũ. Trả về chỉ những cột cần đổi.
 */
export function journalColumns(tx: TaggableTx, dto: JournalTagRequest): JournalColumns {
  const has = (v: unknown) => v !== undefined && v !== null;
  if (!isJournalTxType(tx.type)) {
    if (has(dto.reason) || has(dto.emotion)) {
      throw new BadRequestException('Chỉ gắn nhãn nhật ký cho giao dịch mua, bán, nạp hoặc rút tiền');
    }
    const c = tx.current;
    return c && (c.reason || c.emotion) ? { reason: null, emotion: null } : {};
  }
  const out: JournalColumns = {};
  if (dto.reason !== undefined) out.reason = dto.reason;
  if (dto.emotion !== undefined) out.emotion = dto.emotion;
  return out;
}
