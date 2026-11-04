import { alpha, createTheme } from '@mui/material/styles'

/** Màu giá theo quy ước bảng giá chứng khoán Việt Nam */
interface PricePalette {
  up: string
  down: string
  ref: string
  ceil: string
  floor: string
}

/** Thẻ tổng tài sản và sidebar: nền navy ở cả hai chế độ, chữ sáng, lãi / lỗ sáng hơn để đọc được trên nền tối */
interface HeroPalette {
  bg: string
  ink: string
  muted: string
  chip: string
  line: string
  up: string
  down: string
  gold: string
}

declare module '@mui/material/styles' {
  interface Palette {
    price: PricePalette
    hero: HeroPalette
  }
  interface PaletteOptions {
    price?: PricePalette
    hero?: HeroPalette
  }
}

const FONT = '"Be Vietnam Pro", Inter, "Segoe UI", Roboto, system-ui, sans-serif'

/** Màu thương hiệu: navy (tin cậy, điềm tĩnh) + vàng (tài sản) — dùng chung cho logo, sidebar, thẻ tổng tài sản */
export const BRAND_NAVY = '#15213a'
export const BRAND_GOLD = '#c9a24b'

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1e3560', dark: '#15213a', light: '#3a5a8f' },
        secondary: { main: '#a67c1f' },
        background: { default: '#f4f5f7', paper: '#ffffff' },
        divider: '#e4e7ec',
        text: { primary: '#121a2b', secondary: '#5b6475' },
        success: { main: '#0a8f45' },
        error: { main: '#d32f2f' },
        warning: { main: '#b7791f' },
        price: { up: '#0a8f45', down: '#d32f2f', ref: '#b7791f', ceil: '#9333ea', floor: '#0284c7' },
        hero: {
          bg: BRAND_NAVY,
          ink: '#f6f2e7',
          muted: '#a9b3c7',
          chip: 'rgba(255, 255, 255, 0.07)',
          line: 'rgba(255, 255, 255, 0.1)',
          up: '#4ade94',
          down: '#ff8a80',
          gold: BRAND_GOLD,
        },
      },
    },
    dark: {
      palette: {
        primary: { main: '#a9bfeb', dark: '#7f9bd4', light: '#cfdcf5' },
        secondary: { main: '#d4b062' },
        background: { default: '#0e121a', paper: '#161c27' },
        divider: '#273042',
        text: { primary: '#e7eaf0', secondary: '#97a1b4' },
        success: { main: '#22c55e' },
        error: { main: '#f05252' },
        warning: { main: '#f2c94c' },
        price: { up: '#22c55e', down: '#f05252', ref: '#f2c94c', ceil: '#d36cf2', floor: '#38bdf8' },
        hero: {
          bg: '#1a2742',
          ink: '#f6f2e7',
          muted: '#a9b3c7',
          chip: 'rgba(255, 255, 255, 0.07)',
          line: 'rgba(255, 255, 255, 0.1)',
          up: '#4ade94',
          down: '#ff8a80',
          gold: BRAND_GOLD,
        },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: FONT,
    fontSize: 14,
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontWeight: 600, fontSize: '1.05rem' },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: '0.06em', lineHeight: 1.6 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Ô nhập được focus không bị header dính / thanh điều hướng dưới che mất
        html: { scrollPaddingTop: 72, scrollPaddingBottom: 96 },
        body: { fontFeatureSettings: '"tnum" 1' },
        '.num': { fontVariantNumeric: 'tabular-nums' },
        // Safari iOS căn giữa và co chiều cao ô ngày/giờ khi còn trống
        'input[type="date"], input[type="time"], input[type="datetime-local"]': {
          minHeight: '1.4375em',
          textAlign: 'left',
        },
        '::-webkit-date-and-time-value': { textAlign: 'left' },
        // Điện thoại: link chữ có vùng chạm cao ≥ 32px (padding của phần tử inline không đẩy dòng chữ)
        '@media (max-width: 899.95px)': {
          'a.MuiLink-root, button.MuiLink-root': { paddingTop: 8, paddingBottom: 8 },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({ backgroundImage: 'none', border: `1px solid ${theme.vars.palette.divider}` }),
        // Thẻ, menu, hộp thoại bo 16px (mềm hơn shape mặc định của nút, ô nhập)
        rounded: { borderRadius: 16 },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: ({ theme }) => ({
          border: 'none',
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper,
        }),
      },
    },
    // Trên điện thoại nút nhỏ vẫn đủ lớn để chạm (≥ 36px)
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { sizeSmall: ({ theme }) => ({ [theme.breakpoints.down('md')]: { minHeight: 36 } }) },
    },
    MuiIconButton: {
      styleOverrides: { sizeSmall: ({ theme }) => ({ [theme.breakpoints.down('md')]: { padding: 8 } }) },
    },
    MuiAutocomplete: {
      styleOverrides: {
        popupIndicator: ({ theme }) => ({ [theme.breakpoints.down('md')]: { padding: 6 } }),
        clearIndicator: ({ theme }) => ({ [theme.breakpoints.down('md')]: { padding: 6, visibility: 'visible' } }),
      },
    },
    MuiTableSortLabel: {
      styleOverrides: { root: ({ theme }) => ({ [theme.breakpoints.down('md')]: { minHeight: 32 } }) },
    },
    MuiToggleButton: {
      styleOverrides: { sizeSmall: ({ theme }) => ({ [theme.breakpoints.down('md')]: { minHeight: 36 } }) },
    },
    // Hộp thoại toàn màn hình trên iPhone: chừa thanh vuốt home ở đáy
    MuiDialogActions: { styleOverrides: { root: { paddingBottom: 'max(8px, env(safe-area-inset-bottom))' } } },
    MuiTableCell: {
      styleOverrides: {
        root: { fontVariantNumeric: 'tabular-nums', borderColor: 'var(--mui-palette-divider)' },
        head: ({ theme }) => ({
          fontSize: 12,
          fontWeight: 600,
          color: theme.vars.palette.text.secondary,
          whiteSpace: 'nowrap',
          backgroundColor: theme.vars.palette.background.paper,
        }),
        sizeSmall: { padding: '6px 12px' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.MuiTableRow-hover:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.05) },
        }),
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          // Mục đang chọn: biểu tượng nằm trong viên thuốc nền nhạt
          '& > :first-child': { borderRadius: 99, padding: '2px 16px', transition: 'background-color 150ms' },
          '&.Mui-selected > :first-child': { backgroundColor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.12)' },
        },
        label: { fontSize: 12, whiteSpace: 'nowrap', marginTop: 2, '&.Mui-selected': { fontSize: 12, fontWeight: 600 } },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
})
