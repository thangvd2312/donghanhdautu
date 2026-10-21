/** Thời gian chờ các việc đang chạy xong khi tắt (pm2 kill_timeout của worker phải lớn hơn mức này) */
export const shutdownGraceMs = () => Number(process.env.WORKER_SHUTDOWN_GRACE_MS) || 25_000;

/** Chờ tới khi `busy()` hết đúng hoặc quá hạn; trả true nếu đã rảnh */
export async function waitWhileBusy(busy: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (busy() && Date.now() < deadline) await new Promise((r) => setTimeout(r, stepMs));
  return !busy();
}
