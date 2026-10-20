# Tải trang (QA-01)

## Đo

Script [scripts/loadtime.mjs](../frontend/scripts/loadtime.mjs) mở `/login` và `/demo` trên WebKit với cấu hình iPhone 11 Pro. Mạng chậm được giả lập: mỗi response trễ 150 ms cộng thời gian truyền ở 1,6 Mbps. Script đo thời gian tới khi nội dung chính hiện và số kB thực truyền, lấy trung vị 3 lần.

```bash
cd frontend
npm run build                         # build + nén sẵn .br/.gz
npm run perf:load -- http://localhost:3999   # app đang chạy (backend phục vụ frontend/dist)
```

## Kết quả 20/10/2026

| Bản | `/login` | `/demo` | JS tải về |
|---|---|---|---|
| Trước: một bundle 1.332 kB, server không nén | 7,1 s · 1.313 kB | 7,1 s · 1.313 kB | 1.301 kB |
| Tách chunk theo trang | 4,1 s · 764 kB | 4,5 s · 826 kB | ~755 kB |
| Tách chunk + brotli nén sẵn | **1,5 s · 213 kB** | **2,0 s · 273 kB** | ~203 kB |

Đây là số đo local. Nếu production có proxy nén sẵn (gzip), mức cải thiện thực tế từ phần nén sẽ nhỏ hơn bảng trên. Phần tách chunk vẫn giữ nguyên tác dụng.

## Thay đổi

- Mỗi trang là một chunk tải khi mở (`React.lazy`). Riêng trang đăng nhập và trang chủ nằm trong bundle đầu. Biểu đồ (`lightweight-charts`) và markdown của cố vấn chỉ tải khi cần.
- React và router tách thành chunk riêng, để cache trình duyệt vẫn dùng được sau mỗi lần deploy mã app.
- `npm run build` nén sẵn assets thành `.br` và `.gz`. Backend trả bản nén theo `Accept-Encoding`, chỉ cho đường dẫn `/assets`, nên luồng SSE của cố vấn không bị nén.
- Bundle đầu còn khoảng 716 kB (227 kB gzip), chủ yếu là MUI dùng chung, nên Vite vẫn cảnh báo chunk lớn hơn 500 kB. Ngưỡng cảnh báo không được nâng lên.
