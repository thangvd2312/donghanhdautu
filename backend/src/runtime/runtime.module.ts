import { Module } from '@nestjs/common';
import { AppRuntime } from './app-role';
import { HeartbeatService } from './heartbeat.service';
import { AdvisoryLock, JobRunner, PgAdvisoryLock } from './job-runner';

/** Vai trò tiến trình, chạy việc định kỳ có khoá và nhịp tim worker. ConfigModule và PrismaModule là global */
@Module({
  providers: [
    AppRuntime,
    HeartbeatService,
    PgAdvisoryLock,
    { provide: JobRunner, useFactory: (lock: AdvisoryLock) => new JobRunner(lock), inject: [PgAdvisoryLock] },
  ],
  exports: [AppRuntime, HeartbeatService, JobRunner],
})
export class RuntimeModule {}
