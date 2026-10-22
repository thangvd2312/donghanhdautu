import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { useMarket } from '../../lib/market-context'
import { SEVERITY } from '../../lib/notifications'
import { BOTTOM_NAV_HEIGHT } from './navConfig'

export default function Toast() {
  const { latest, dismissLatest } = useMarket()
  return (
    <Snackbar
      open={!!latest}
      autoHideDuration={12000}
      onClose={(_, reason) => reason !== 'clickaway' && dismissLatest()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))`, md: 24 } }}
    >
      {latest ? (
        <Alert
          severity={SEVERITY[latest.severity]}
          variant="outlined"
          onClose={dismissLatest}
          sx={{ bgcolor: 'background.paper', width: 'min(92vw, 400px)' }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {latest.title}
          </Typography>
          <Typography variant="body2">{latest.body}</Typography>
          {latest.link && (
            <Link component={RouterLink} to={latest.link} variant="body2" onClick={dismissLatest} sx={{ fontWeight: 600 }}>
              {latest.kind === 'brief' ? 'Xem bản tin' : 'Xem chi tiết'}
            </Link>
          )}
        </Alert>
      ) : undefined}
    </Snackbar>
  )
}
