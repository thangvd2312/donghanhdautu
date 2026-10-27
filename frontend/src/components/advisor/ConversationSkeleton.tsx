import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'

/** Chỗ giữ trong lúc tải tin nhắn của một cuộc trò chuyện: một câu hỏi bên phải, một câu trả lời nhiều đoạn */
export default function ConversationSkeleton() {
  return (
    <Stack spacing={3} aria-busy="true" aria-label="Đang tải cuộc trò chuyện">
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Skeleton variant="rounded" width={180} height={36} sx={{ borderRadius: 4 }} />
      </Box>
      {[0, 1, 2].map((i) => (
        <Stack key={i} spacing={0.75}>
          <Skeleton variant="text" width={140} height={26} />
          <Skeleton variant="text" width="96%" />
          <Skeleton variant="text" width="88%" />
          {i < 2 && <Skeleton variant="text" width="62%" />}
        </Stack>
      ))}
    </Stack>
  )
}
