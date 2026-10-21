// pm2 config — production: hai process NestJS từ cùng một codebase.
//   dautu         (web)    API (/api), socket.io, bản build React (frontend/dist), poll bảng giá realtime. Không chạy việc nền.
//   dautu-worker  (worker) cron, hàng đợi bản tin, gửi Telegram / Web Push, ghi nhịp tim. Không mở cổng HTTP.
//   npm run install:all && npm run build && pm2 start ecosystem.config.cjs && pm2 save
// APP_ROLE đặt ở đây (không đặt trong .env dùng chung); APP_VERSION lấy từ GITHUB_SHA khi deploy.
const version = process.env.GITHUB_SHA || 'dev';

module.exports = {
  apps: [
    {
      name: 'dautu',
      cwd: `${__dirname}/backend`,
      script: 'dist/main.js',
      node_args: '--env-file=../.env',
      env: { NODE_ENV: 'production', TZ: 'Asia/Ho_Chi_Minh', APP_ROLE: 'web', APP_VERSION: version },
      max_memory_restart: '600M',
      time: true,
    },
    {
      name: 'dautu-worker',
      cwd: `${__dirname}/backend`,
      script: 'dist/worker.js',
      node_args: '--env-file=../.env',
      env: { NODE_ENV: 'production', TZ: 'Asia/Ho_Chi_Minh', APP_ROLE: 'worker', APP_VERSION: version },
      max_memory_restart: '600M',
      // Dừng êm: chờ việc đang chạy xong (WORKER_SHUTDOWN_GRACE_MS, mặc định 25 giây) trước khi pm2 SIGKILL
      kill_timeout: 35000,
      time: true,
    },
  ],
};
