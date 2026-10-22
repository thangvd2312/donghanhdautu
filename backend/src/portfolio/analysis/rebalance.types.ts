import type {
  AssetType,
  RebalanceFees,
  RebalanceLots,
  RebalanceMode,
  RebalanceRequest as RebalanceReq,
  RebalanceResponse,
} from '@dautu/contracts';
import type { PriceStatus } from '../../market/freshness';

export type { RebalanceMode };
export type RebalanceGroup = AssetType;
export type LotMode = RebalanceLots;
/** Yêu cầu tái cân bằng như tầng tính toán nhận (danh mục đã được resolve ở service) */
export type RebalanceRequest = Omit<RebalanceReq, 'portfolioId'>;

/** Phần của một dòng định giá (valuePortfolio) mà tính tái cân bằng cần: đúng giá trị màn Danh mục */
export interface RebalanceHolding {
  assetType: string;
  symbol: string;
  displayName: string;
  quantity: number;
  /** VND/đơn vị theo định giá hiện tại (vàng: giá mua vào, coin: đã quy VND); null = chưa có giá */
  priceVnd: number | null;
  marketValue: number | null;
  costValue: number;
  price: { status: PriceStatus; reason?: string | null };
}

export interface RebalanceContext {
  holdings: RebalanceHolding[];
  /** Cổ phiếu mục tiêu chưa giữ, đã được kiểm tra tồn tại; price null = chưa lấy được giá */
  newStocks: { symbol: string; price: number | null }[];
  /** Giá BÁN RA của cửa hàng theo mã vàng (VND/lượng): giá phải trả khi mua thêm */
  goldBuyPrices: Record<string, number>;
  asOf: string;
}

/** Kết quả tái cân bằng, giống phản hồi API */
export type RebalanceResult = RebalanceResponse;

export const DEFAULT_FEES: Required<RebalanceFees> = {
  stockBuyPct: 0.15,
  stockSellPct: 0.15,
  stockSellTaxPct: 0.1,
  cryptoPct: 0.1,
};
export const MAX_TARGETS = 60;
export const MAX_NEW_MONEY = 1e15;
