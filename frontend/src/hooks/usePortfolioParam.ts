import { useSearchParams } from 'react-router-dom'

/** Danh mục đang chọn nằm trên URL (?p=…, trống = tất cả); đổi bằng replace để Back không bị kẹt, giữ nguyên các tham số khác */
export function usePortfolioParam(): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const setPf = (id: string) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (id) n.set('p', id)
        else n.delete('p')
        return n
      },
      { replace: true },
    )
  return [params.get('p') ?? '', setPf]
}
