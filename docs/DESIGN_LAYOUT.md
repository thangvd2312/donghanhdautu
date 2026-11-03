# Bố cục trang (Navy & vàng, 11/2026)

Áp dụng cho mọi trang đã đăng nhập. Màu, font, khung (sidebar desktop, thanh đáy điện thoại) đã có trong `frontend/src/theme.ts` và `components/layout`. Tài liệu này quy định **bên trong một trang**.

## Khung chung

```
PageHeader            nhóm · tiêu đề · 1 câu mô tả            [nút chính]
StatTiles             (nếu trang có 2–4 con số quan trọng)
Bộ lọc / tab          1 hàng, ngay dưới đầu trang
PageGrid
  main  (cột chính)   Panel, Panel, …
  aside (340px)       tóm tắt, giải thích, mẹo, hành động phụ — dính khi cuộn
```

Thành phần trong `frontend/src/components/page.tsx`:

| Thành phần | Dùng khi |
|---|---|
| `PageHeader({ eyebrow, title, description, actions })` | Mọi trang. `eyebrow` = tên nhóm trên sidebar (Tài sản, Hành động, Công cụ, Thông tin; trang không thuộc nhóm thì bỏ). Trên điện thoại tiêu đề tự ẩn vì thanh trên đã có tên trang. |
| `PageGrid({ aside, asideFirst })` | Trang có nội dung phụ. Desktop: cột chính + cột phụ 340px. Điện thoại: một cột, `asideFirst` đưa cột phụ lên trước (bộ lọc, tóm tắt). |
| `StatTiles({ items })` | 2–4 số tóm tắt đầu trang (tổng, số lượng, tỷ lệ). |
| `EmptyState({ Icon, title, children, action, plain })` | Mọi chỗ "chưa có dữ liệu". Một hành động chính. `plain` khi đã nằm trong Panel. |
| `Panel({ title, subtitle, action, noPadding })` (`components/ui.tsx`) | Mọi khối nội dung. Tiêu đề 16px đậm, không kẻ ngang (trừ `noPadding` cho bảng / danh sách sát mép). |
| `QuickActions` (`components/QuickActions.tsx`) | Hàng 2–4 lối tắt dạng ô thay cho các câu link. |

## Quy tắc

1. **Bề rộng**: dùng hết khung (tối đa 1200px). Không bọc trang trong `maxWidth: 760, mx: 'auto'`. Nội dung đọc / biểu mẫu dài để ở cột chính của `PageGrid`, phần giải thích sang cột phụ.
2. **Thứ tự**: tóm tắt trước chi tiết. Việc cần làm (đến hạn, cảnh báo) trước thông tin tham khảo.
3. **Khối**: mỗi khối là một `Panel`. Không lồng Paper trong Paper; bên trong Panel dùng `Divider` hoặc nền `action.hover` để tách.
4. **Khoảng cách**: giữa các khối `spacing={2.5}`; trong khối 1.5–2.
5. **Chữ**: chỉ `PageHeader` có tiêu đề cấp trang. Không dùng `variant="h4"/"h5"` trong trang. Tiêu đề khối qua `Panel`.
6. **Nút**: nút chính của trang nằm trong `PageHeader.actions`, `variant="contained"`, bo tròn `borderRadius: 99`. Nút phụ `outlined`. Link chữ chỉ dùng trong câu.
7. **Màu**: chỉ dùng token theme (`primary`, `text.secondary`, `divider`, `price.up/down`, `hero.*`). Thẻ nền navy (`HERO_SX` trong `home/HomeBlocks.tsx`) tối đa một thẻ mỗi trang, cho con số quan trọng nhất. Màu riêng chỉ cho chuỗi dữ liệu biểu đồ.
8. **Bo góc**: `shape.borderRadius` = 8 và `sx.borderRadius: n` nhân với nó. Bo mới viết bằng px (`'12px'`).
9. **Bộ lọc**: một hàng `ToggleButtonGroup` hoặc chip; trên điện thoại đặt trong `ScrollRow` (cuộn ngang). Vùng chạm ≥ 32px.
10. **Điện thoại**: một cột, padding 16px, không tràn ngang; nút chính một mình thì rộng hết hàng.
11. **Giữ nguyên hành vi**: dữ liệu, API, nhãn và `aria-label` mà `frontend/e2e/*.spec.ts` dùng.
