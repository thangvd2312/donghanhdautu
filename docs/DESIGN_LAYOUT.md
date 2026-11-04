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
8. **Bo góc**: thẻ (Paper/Panel) 16px qua theme; thẻ navy 20px. `shape.borderRadius` vẫn = 8 và `sx.borderRadius: n` nhân với nó, nên bo mới viết bằng px (`'12px'`).
9. **Bộ lọc**: một hàng `ToggleButtonGroup` hoặc chip; trên điện thoại đặt trong `ScrollRow` (cuộn ngang). Vùng chạm ≥ 32px.
10. **Điện thoại**: một cột, padding 16px, không tràn ngang; nút chính một mình thì rộng hết hàng.
11. **Giữ nguyên hành vi**: dữ liệu, API, nhãn và `aria-label` mà `frontend/e2e/*.spec.ts` dùng.
12. **Tầng thứ**: việc gấp / cảnh báo dùng hàng có **thanh màu 4px bên trái** (đỏ `price.down` = nghiêm trọng, `warning.main` = chú ý, `primary.main` = thông tin), như `ReviewList` trong `home/HomeBlocks.tsx`. Việc đến hạn: viền thẻ `hero.gold` + ô ngày kiểu lịch. Thẻ phụ giữ viền nhạt.
13. **Link góc thẻ**: `CardLink` (`home/HomeBlocks.tsx`) đặt ở `Panel.action` ("Danh mục", "Cân bằng", "Kế hoạch") thay cho link "Xem tất cả" cuối thẻ hay câu link gạch chân.
14. **Số và %**: % thay đổi dùng `ChangePill` (viên thuốc nền nhạt). Phân bổ so với mục tiêu dùng `portfolio/TargetAllocation` (vạch đậm = mục tiêu, vượt mục tiêu tô vàng).

## Điện thoại: bớt chữ (11/2026, người dùng phàn nàn "nhiều text quá")

Mục tiêu: mỗi màn hình đọc lướt được trong vài giây. Chữ giải thích không mất đi, chỉ chuyển sang chỗ chạm mới thấy.

- **Mô tả trang** (`PageHeader.description`) tự ẩn trên điện thoại. Chỉ dùng `descriptionOnMobile` khi câu đó là dữ liệu cần thiết.
- **Phụ đề khối** dạng chữ tự thu vào ⓘ trên điện thoại (`Panel`).
- **Đoạn giải thích, chú thích nguồn, lưu ý pháp lý, ghi chú cách tính** → `InfoTip` (ⓘ) cạnh tiêu đề / con số liên quan, hoặc chỉ hiện từ md (`display: { xs: 'none', md: 'block' }`). Không để đoạn văn > 1 câu đứng trơ trên điện thoại.
- **Trạng thái trống**: tiêu đề + tối đa một câu ngắn (≤ 12 từ) + một nút. Viết lại câu cho ngắn, không cắt chữ giữa chừng.
- **Danh sách**: dòng phụ một dòng (`WebkitLineClamp: 1` trên xs), cả hàng bấm được thay cho 2–3 nút chữ mỗi hàng; hành động phụ thành `IconButton` có `aria-label`.
- **Nhiều nút chữ dài** → một nút chính + `QuickActions` (ô biểu tượng + nhãn 1–2 từ) hoặc gom vào menu.
- **Nhãn nút** 1–3 từ ("Ghi giao dịch", không phải "Có giao dịch mới? Ghi ngay vào sổ giao dịch").
- Kiểm tra: `words` trên điện thoại (script chụp màn hình) phải giảm rõ so với trước; không đoạn nào bị cắt cụt vô nghĩa.

Tham chiếu đã làm đúng: `pages/HomePage.tsx`, `components/home/HomeBlocks.tsx`. Mockup gốc: https://claude.ai/artifact/3vq6q8FKNaFgL9LRSz5aEM (hướng A).

