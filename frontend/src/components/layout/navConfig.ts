import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined'
import EventOutlined from '@mui/icons-material/EventOutlined'
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined'
import ForumOutlined from '@mui/icons-material/ForumOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import NewspaperOutlined from '@mui/icons-material/NewspaperOutlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined'
import SummarizeOutlined from '@mui/icons-material/SummarizeOutlined'
import type { SvgIconComponent } from '@mui/icons-material'

export interface NavItem {
  to: string
  label: string
}
export interface NavItemWithIcon extends NavItem {
  Icon: SvgIconComponent
}

/** Sidebar trên desktop: mọi trang, chia nhóm (thay cho thanh tab + menu tài khoản) */
export const SIDEBAR: { title?: string; items: NavItemWithIcon[] }[] = [
  {
    items: [
      { to: '/', label: 'Hôm nay', Icon: HomeOutlined },
      { to: '/market', label: 'Bảng giá', Icon: ShowChartOutlined },
      { to: '/advisor', label: 'Cố vấn', Icon: ForumOutlined },
    ],
  },
  {
    title: 'Tài sản',
    items: [
      { to: '/portfolio', label: 'Danh mục', Icon: AccountBalanceWalletOutlined },
      { to: '/income', label: 'Thu nhập cổ tức', Icon: PaidOutlined },
      { to: '/reports', label: 'Báo cáo', Icon: SummarizeOutlined },
      { to: '/journal', label: 'Nhật ký', Icon: MenuBookOutlined },
    ],
  },
  {
    title: 'Công cụ',
    items: [
      { to: '/screener', label: 'Lọc cổ phiếu', Icon: FilterAltOutlined },
      { to: '/compare', label: 'So sánh', Icon: CompareArrowsOutlined },
      { to: '/events', label: 'Lịch sự kiện', Icon: EventOutlined },
    ],
  },
  {
    title: 'Thông tin',
    items: [{ to: '/news', label: 'Tin tức', Icon: NewspaperOutlined }],
  },
]

/** Mọi mục trên sidebar, dùng để tìm mục đang chọn */
export const NAV: NavItem[] = SIDEBAR.flatMap((g) => g.items)

/** Thanh đáy trên điện thoại: 4 trang dùng nhiều nhất + "Thêm" */
export const BOTTOM: NavItemWithIcon[] = [
  { to: '/', label: 'Hôm nay', Icon: HomeOutlined },
  { to: '/portfolio', label: 'Danh mục', Icon: AccountBalanceWalletOutlined },
  { to: '/market', label: 'Bảng giá', Icon: ShowChartOutlined },
  { to: '/advisor', label: 'Cố vấn', Icon: ForumOutlined },
]

/** Bảng "Thêm" trên điện thoại */
export const MORE: NavItemWithIcon[] = [
  { to: '/market', label: 'Bảng giá', Icon: ShowChartOutlined },
  { to: '/journal', label: 'Nhật ký quyết định', Icon: MenuBookOutlined },
  { to: '/events', label: 'Lịch sự kiện', Icon: EventOutlined },
  { to: '/income', label: 'Thu nhập cổ tức', Icon: PaidOutlined },
  { to: '/reports', label: 'Báo cáo danh mục', Icon: SummarizeOutlined },
  { to: '/screener', label: 'Lọc cổ phiếu', Icon: FilterAltOutlined },
  { to: '/compare', label: 'So sánh cổ phiếu', Icon: CompareArrowsOutlined },
  { to: '/news', label: 'Tin tức', Icon: NewspaperOutlined },
  { to: '/settings', label: 'Cài đặt & thông báo', Icon: SettingsOutlined },
]

/** Bảng "Thêm" trên điện thoại: lưới icon chia nhóm, nhãn ngắn (các trang không có ở thanh đáy) */
export const MORE_GROUPS: { title: string; items: NavItemWithIcon[] }[] = [
  {
    title: 'Tài sản',
    items: [
      { to: '/income', label: 'Cổ tức', Icon: PaidOutlined },
      { to: '/reports', label: 'Báo cáo', Icon: SummarizeOutlined },
      { to: '/journal', label: 'Nhật ký', Icon: MenuBookOutlined },
    ],
  },
  {
    title: 'Thị trường & công cụ',
    items: [
      { to: '/news', label: 'Tin tức', Icon: NewspaperOutlined },
      { to: '/events', label: 'Lịch sự kiện', Icon: EventOutlined },
      { to: '/screener', label: 'Lọc cổ phiếu', Icon: FilterAltOutlined },
      { to: '/compare', label: 'So sánh', Icon: CompareArrowsOutlined },
    ],
  },
]

/** Menu tài khoản trên desktop: các trang không có trên sidebar */
const IN_SIDEBAR = new Set(NAV.map((n) => n.to))
export const USER_MENU: NavItemWithIcon[] = MORE.filter((n) => !IN_SIDEBAR.has(n.to))

/** Bề rộng sidebar desktop */
export const SIDEBAR_WIDTH = 236

/** Chiều cao thanh đáy (chưa tính vùng an toàn của iPhone) */
export const BOTTOM_NAV_HEIGHT = 60

/** Bản ngắn một dòng (bảng "Thêm" trên điện thoại) */
export const DISCLAIMER_SHORT = 'Chỉ để tham khảo, không phải khuyến nghị đầu tư được cấp phép.'

export const DISCLAIMER =
  'Dữ liệu: Vietcap, DNSE, Binance, vang.today, Vietcombank, CafeF, VnExpress. Phân tích của cố vấn chỉ mang tính tham khảo, không phải khuyến nghị đầu tư được cấp phép — quyết định cuối cùng là của bạn.'

export const matches = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
