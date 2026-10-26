/** Promise hoàn tất theo lệnh của test: dựng các tình huống phản hồi về không theo thứ tự gửi */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lỗi `fetch` ném ra khi request bị huỷ bằng AbortController */
export const abortError = () => new DOMException('The operation was aborted.', 'AbortError')
