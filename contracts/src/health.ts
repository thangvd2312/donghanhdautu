/** GET /health */

export interface WorkerStatus {
  ok: boolean
  /** null khi worker chưa từng ghi nhịp */
  beatAgoSec: number | null
}

/**
 * `ok: true` nghĩa là API đang trả lời (CI / deploy kiểm tra dựa vào đây) và không phụ thuộc worker;
 * `worker` cho biết nhịp tim worker còn mới không.
 */
export interface HealthResponse {
  ok: true
  worker: WorkerStatus
}
