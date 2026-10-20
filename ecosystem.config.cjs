// pm2 config — production: một process NestJS phục vụ API (/api), socket.io và bản build React (frontend/dist).
//   npm run install:all && npm run build && pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'dautu',
      cwd: `${__dirname}/backend`,
      script: 'dist/main.js',
      node_args: '--env-file=../.env',
      env: { NODE_ENV: 'production', TZ: 'Asia/Ho_Chi_Minh' },
      max_memory_restart: '600M',
      time: true,
    },
  ],
};
