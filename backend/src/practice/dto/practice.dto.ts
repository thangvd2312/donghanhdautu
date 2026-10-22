import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { PracticeOrderRequest, PracticeStartRequest } from '@dautu/contracts';
import { START_CASH_OPTIONS } from '../practice-logic';
import type { PracticeAssetType, PracticeSide } from '../practice-logic';

const CASH_MSG = 'Số tiền ban đầu không hợp lệ';

export class StartDto implements PracticeStartRequest {
  @IsIn(START_CASH_OPTIONS, { message: CASH_MSG }) startCash!: number;
}

export class OrderDto implements PracticeOrderRequest {
  @IsIn(['stock', 'crypto'], { message: 'Loại tài sản luyện tập chỉ gồm cổ phiếu và coin' })
  assetType!: PracticeAssetType;
  @IsString() @MaxLength(20) symbol!: string;
  @IsIn(['buy', 'sell'], { message: 'Lệnh phải là mua hoặc bán' }) side!: PracticeSide;
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Số lượng không hợp lệ' })
  @Min(0.000001, { message: 'Số lượng phải lớn hơn 0' })
  @Max(1_000_000_000_000, { message: 'Số lượng quá lớn' })
  quantity!: number;
}

export class TradesQuery {
  @IsOptional() @IsString() @MaxLength(60) cursor?: string;
}
