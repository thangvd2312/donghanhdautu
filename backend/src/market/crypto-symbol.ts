/** "eth" / "ETH-USDT" / "ETHUSDT" → "ETHUSDT" */
export function normalizeCrypto(symbol: string) {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.endsWith('USDT') ? s : `${s}USDT`;
}
