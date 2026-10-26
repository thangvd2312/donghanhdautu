import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined'
import EventOutlined from '@mui/icons-material/EventOutlined'
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined'
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import ForumOutlined from '@mui/icons-material/ForumOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import NewspaperOutlined from '@mui/icons-material/NewspaperOutlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined'
import SummarizeOutlined from '@mui/icons-material/SummarizeOutlined'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import type { SvgIconComponent } from '@mui/icons-material'

export interface NavItem {
  to: string
  label: string
}
export interface NavItemWithIcon extends NavItem {
  Icon: SvgIconComponent
}

/** Thanh tab trên desktop */
export const NAV: NavItem[] = [
  { to: '/', label: 'Hôm nay' },
  { to: '/market', label: 'Bảng giá' },
  { to: '/portfolio', label: 'Danh mục' },
  { to: '/plans', label: 'Kế hoạch' },
  { to: '/goals', label: 'Mục tiêu' },
  { to: '/advisor', label: 'Cố vấn' },
  { to: '/news', label: 'Tin tức' },
]

/** Thanh đáy trên điện thoại: 4 trang dùng nhiều nhất + "Thêm" */
export const BOTTOM: NavItemWithIcon[] = [
  { to: '/', label: 'Hôm nay', Icon: HomeOutlined },
  { to: '/portfolio', label: 'Danh mục', Icon: AccountBalanceWalletOutlined },
  { to: '/plans', label: 'Kế hoạch', Icon: FlagOutlined },
  { to: '/advisor', label: 'Cố vấn', Icon: ForumOutlined },
]

/** Bảng "Thêm" trên điện thoại */
export const MORE: NavItemWithIcon[] = [
  { to: '/market', label: 'Bảng giá', Icon: ShowChartOutlined },
  { to: '/tips', label: 'Soi lời khuyên', Icon: FactCheckOutlined },
  { to: '/goals', label: 'Mục tiêu tài chính', Icon: SavingsOutlined },
  { to: '/journal', label: 'Nhật ký quyết định', Icon: MenuBookOutlined },
  { to: '/events', label: 'Lịch sự kiện', Icon: EventOutlined },
  { to: '/income', label: 'Thu nhập cổ tức', Icon: PaidOutlined },
  { to: '/reports', label: 'Báo cáo danh mục', Icon: SummarizeOutlined },
  { to: '/screener', label: 'Lọc cổ phiếu', Icon: FilterAltOutlined },
  { to: '/compare', label: 'So sánh cổ phiếu', Icon: CompareArrowsOutlined },
  { to: '/simulate', label: 'Thử kịch bản', Icon: TuneOutlined },
  { to: '/rebalance', label: 'Tái cân bằng', Icon: BalanceOutlined },
  { to: '/practice', label: 'Luyện tập (tiền ảo)', Icon: SchoolOutlined },
  { to: '/news', label: 'Tin tức', Icon: NewspaperOutlined },
  { to: '/settings', label: 'Cài đặt & thông báo', Icon: SettingsOutlined },
]

/** Menu tài khoản trên desktop: các trang không có trên thanh tab (cùng thứ tự với "Thêm") */
const IN_TABS = new Set(NAV.map((n) => n.to))
export const USER_MENU: NavItemWithIcon[] = MORE.filter((n) => !IN_TABS.has(n.to))

/** Chiều cao thanh đáy (chưa tính vùng an toàn của iPhone) */
export const BOTTOM_NAV_HEIGHT = 60

export const DISCLAIMER =
  'Dữ liệu: Vietcap, DNSE, Binance, vang.today, Vietcombank, CafeF, VnExpress. Phân tích của cố vấn chỉ mang tính tham khảo, không phải khuyến nghị đầu tư được cấp phép — quyết định cuối cùng là của bạn.'

export const matches = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
