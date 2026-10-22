import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { JournalEmotion } from '@dautu/contracts';
import { vnDateKey } from '../../market/types';
import { JOURNAL_EMOTIONS } from '../journal-logic';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MonthQuery {
  /** YYYY-MM; bỏ trống = tháng hiện tại (giờ VN) */
  @IsOptional() @Matches(MONTH, { message: 'Tháng không hợp lệ (cần dạng YYYY-MM)' }) month?: string;
}

export class EntriesQuery extends MonthQuery {
  @IsOptional() @IsIn(JOURNAL_EMOTIONS, { message: 'Cảm xúc không hợp lệ' }) emotion?: JournalEmotion;
  @IsOptional() @IsString() @MaxLength(40) planId?: string;
}

export const monthOf = (q: MonthQuery) => q.month ?? vnDateKey().slice(0, 7);
