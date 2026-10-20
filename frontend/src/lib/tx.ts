import type { TxType } from './types'

export const TX_LABEL: Record<TxType, string> = {
  buy: 'Mua',
  sell: 'Bán',
  deposit: 'Nạp tiền',
  withdraw: 'Rút tiền',
  dividend: 'Cổ tức',
  fee: 'Phí',
  opening: 'Số dư đầu kỳ',
}
