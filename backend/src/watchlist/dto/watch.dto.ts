import type { WatchRequest } from '@dautu/contracts';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { WATCH_TYPES } from '../watchlist.constants';
import type { WatchType } from '../watchlist.constants';

export class WatchDto implements WatchRequest {
  @IsIn(WATCH_TYPES, { message: 'Chỉ theo dõi được cổ phiếu, crypto hoặc vàng' }) assetType!: WatchType;
  @IsString() @MaxLength(20) symbol!: string;
}
