import { alpha, createTheme } from '@mui/material/styles'

/** Màu giá theo quy ước bảng giá chứng khoán Việt Nam */
interface PricePalette {
  up: string
  down: string
  ref: string
  ceil: string
  floor: string
}

declare module '@mui/material/styles' {
  interface Palette {
    price: PricePalette
  }
  interface PaletteOptions {
    price?: PricePalette
  }
}

const FONT = 'Inter, "Segoe UI", Roboto, system-ui, sans-serif'

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1d4ed8', dark: '#1e3a8a', light: '#3b82f6' },
        secondary: { main: '#0f766e' },
        background: { default: '#f4f6f9', paper: '#ffffff' },
        divider: '#e3e7ee',
        text: { primary: '#111827', secondary: '#5b6475' },
        success: { main: '#0a8f45' },
        error: { main: '#d32f2f' },
        warning: { main: '#b7791f' },
        price: { up: '#0a8f45', down: '#d32f2f', ref: '#b7791f', ceil: '#9333ea', floor: '#0284c7' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#60a5fa', dark: '#3b82f6', light: '#93c5fd' },
        secondary: { main: '#2dd4bf' },
        background: { default: '#0e1117', paper: '#161b24' },
        divider: '#262d3a',
        text: { primary: '#e6e9ef', secondary: '#949db0' },
        success: { main: '#22c55e' },
        error: { main: '#f05252' },
        warning: { main: '#f2c94c' },
        price: { up: '#22c55e', down: '#f05252', ref: '#f2c94c', ceil: '#d36cf2', floor: '#38bdf8' },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: FONT,
    fontSize: 14,
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
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
        label: { fontSize: 12, whiteSpace: 'nowrap', '&.Mui-selected': { fontSize: 12, fontWeight: 600 } },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
})
