import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isDateKey } from '../common/dates';
import { normalizeCrypto } from '../market/crypto-symbol';
import type { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import type { TransactionDto } from './dto/transaction.dto';
import type { Currency, TxType } from './ledger';

const CASH_ONLY: TxType[] = ['deposit', 'withdraw', 'fee'];
/** Ngày giao dịch sớm nhất nhận (chặn gõ nhầm năm, vd 0026 hay 1026) */
const MIN_TX_DATE = '1990-01-01';

const dec = (v: number | undefined | null) => (v === undefined || v === null ? null : new Prisma.Decimal(String(v)));

/** Chuẩn hoá đầu vào theo loại giao dịch; mã tài sản được kiểm tra với nguồn giá */
export async function normalizeTransaction(
  dto: TransactionDto,
  market: Pick<MarketService, 'assertStock' | 'goldQuotes'>,
) {
  const today = vnDateKey();
  if (!isDateKey(dto.date)) throw new BadRequestException('Ngày giao dịch không hợp lệ');
  if (dto.date > today) throw new BadRequestException('Ngày giao dịch không được ở tương lai');
  if (dto.date < MIN_TX_DATE) throw new BadRequestException('Ngày giao dịch quá xa trong quá khứ (trước năm 1990)');
  const base = {
    type: dto.type,
    date: new Date(`${dto.date}T00:00:00Z`),
    fee: dec(dto.fee) ?? new Prisma.Decimal(0),
    tax: dec(dto.tax) ?? new Prisma.Decimal(0),
    fxRate: dec(dto.fxRate),
    note: dto.note?.trim() || null,
  };

  if (CASH_ONLY.includes(dto.type)) {
    if (!dto.amount) throw new BadRequestException('Nhập số tiền');
    return {
      ...base,
      assetType: null,
      symbol: null,
      quantity: null,
      price: null,
      amount: dec(dto.amount),
      currency: dto.currency ?? 'VND',
    };
  }

  if (dto.type === 'bonus') {
    if (dto.assetType && dto.assetType !== 'stock')
      throw new BadRequestException('Chỉ cổ phiếu mới nhận thêm cổ phiếu');
    if (!dto.symbol) throw new BadRequestException('Chọn mã cổ phiếu');
    if (!dto.quantity) throw new BadRequestException('Nhập số cổ phiếu nhận thêm');
    const symbol = (await market.assertStock(dto.symbol.trim().toUpperCase())).symbol;
    return {
      ...base,
      assetType: 'stock',
      symbol,
      quantity: dec(dto.quantity),
      price: null,
      amount: null,
      currency: 'VND',
    };
  }

  if (dto.type === 'dividend') {
    if (!dto.amount) throw new BadRequestException('Nhập số tiền cổ tức');
    const symbol = dto.symbol ? (await market.assertStock(dto.symbol.trim().toUpperCase())).symbol : null;
    return {
      ...base,
      assetType: symbol ? 'stock' : null,
      symbol,
      quantity: null,
      price: null,
      amount: dec(dto.amount),
      currency: 'VND',
    };
  }

  // opening / buy / sell: cần tài sản, số lượng, giá
  if (!dto.assetType) throw new BadRequestException('Chọn loại tài sản');
  if (!dto.quantity) throw new BadRequestException('Nhập số lượng');
  if (dto.assetType === 'cash') {
    if (dto.type !== 'opening') throw new BadRequestException('Tiền mặt dùng giao dịch nạp / rút');
    const cur: Currency = dto.symbol?.toUpperCase() === 'USDT' ? 'USDT' : 'VND';
    return {
      ...base,
      assetType: 'cash',
      symbol: cur,
      quantity: dec(dto.quantity),
      price: new Prisma.Decimal(1),
      amount: null,
      currency: cur,
    };
  }
  if (dto.price === undefined || (dto.type !== 'opening' && !dto.price)) throw new BadRequestException('Nhập giá');
  let symbol = (dto.symbol ?? '').trim().toUpperCase();
  if (!symbol) throw new BadRequestException('Chọn mã tài sản');
  if (dto.assetType === 'stock') symbol = (await market.assertStock(symbol)).symbol;
  if (dto.assetType === 'crypto') symbol = normalizeCrypto(symbol);
  if (dto.assetType === 'gold' && !market.goldQuotes().some((g) => g.code === symbol)) {
    throw new NotFoundException(`Không có loại vàng ${symbol}`);
  }
  return {
    ...base,
    assetType: dto.assetType,
    symbol,
    quantity: dec(dto.quantity),
    price: dec(dto.price),
    amount: null,
    currency: dto.assetType === 'crypto' ? 'USDT' : 'VND',
  };
}

export type NormalizedTx = Awaited<ReturnType<typeof normalizeTransaction>>;
