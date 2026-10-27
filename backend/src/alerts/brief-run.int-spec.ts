import type { MarketGateway } from '../market/market.gateway';
import { testPrisma, testUser } from '../test-utils/test-db';
import { BriefContent, BriefRunService, STALE_RUN_MS } from './brief-run.service';
import { NotifierService } from './notifier.service';

const prisma = testPrisma();
const gateway = { notifyUser: () => undefined } as unknown as MarketGateway;
const notifier = new NotifierService(prisma, gateway);
const runs = new BriefRunService(prisma, notifier);

afterAll(() => prisma.$disconnect());

const KEY = 'brief:weekly:2026-10-24';
const content = (): BriefContent => ({
  title: 'Tổng kết tuần 24/10',
  prompt: 'Tổng kết tuần 24/10',
  body: '| bảng |',
  headline: 'ổn',
  notification: { kind: 'brief', severity: 'info', title: 'Tổng kết tuần 24/10: ổn', body: 'Đã sẵn sàng' },
});
const counts = async (userId: string) => ({
  conversations: await prisma.conversation.count({ where: { userId } }),
  notifications: await prisma.notification.count({ where: { userId } }),
});

describe('bản tin mỗi kỳ một lần (PostgreSQL)', () => {
  it('hai tiến trình chạy cùng lúc chỉ tạo một bản tin, chỉ gọi AI một lần', async () => {
    const u = await testUser(prisma, 'brief-concurrent');
    const build = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return content();
    });
    await Promise.all([runs.run(u.id, KEY, build), runs.run(u.id, KEY, build), runs.run(u.id, KEY, build)]);
    expect(build).toHaveBeenCalledTimes(1);
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 1 });
  });

  it('cuộc trò chuyện của bản tin ghi loại bản tin và câu tóm tắt', async () => {
    const u = await testUser(prisma, 'brief-kind');
    await runs.run(u.id, KEY, () => Promise.resolve(content()));
    expect(await prisma.conversation.findFirst({ where: { userId: u.id } })).toMatchObject({
      brief: 'weekly',
      headline: 'ổn',
    });
  });

  it('chạy lại sau khi đã xong không tạo thêm', async () => {
    const u = await testUser(prisma, 'brief-rerun');
    await runs.run(u.id, KEY, () => Promise.resolve(content()));
    const later = new Date(Date.now() + STALE_RUN_MS * 2);
    expect(await runs.run(u.id, KEY, () => Promise.resolve(content()), later)).toBeNull();
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 1 });
  });

  it('lỗi sau khi đã lưu nội dung: chạy lại ngay dùng lại cuộc trò chuyện, không gọi lại AI', async () => {
    const u = await testUser(prisma, 'brief-resume');
    const send = jest.spyOn(notifier, 'send').mockRejectedValueOnce(new Error('crash'));
    await expect(runs.run(u.id, KEY, () => Promise.resolve(content()))).rejects.toThrow('crash');
    send.mockRestore();
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 0 });

    const build = jest.fn(() => Promise.resolve(content()));
    const n = await runs.run(u.id, KEY, build);
    expect(build).not.toHaveBeenCalled();
    const conversation = await prisma.conversation.findFirst({ where: { userId: u.id } });
    expect(n).toMatchObject({ title: 'Tổng kết tuần 24/10: ổn', link: `/advisor/${conversation!.id}` });
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 1 });
    expect(await prisma.briefRun.findFirst({ where: { userId: u.id } })).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('tiến trình chết giữa chừng: tiến trình khác chờ hết hạn rồi mới nhận lại', async () => {
    const u = await testUser(prisma, 'brief-dead');
    // Lượt đang "running" do một tiến trình đã chết để lại
    await prisma.briefRun.create({ data: { userId: u.id, key: KEY } });
    const build = jest.fn(() => Promise.resolve(content()));
    expect(await runs.run(u.id, KEY, build)).toBeNull();
    expect(build).not.toHaveBeenCalled();
    await runs.run(u.id, KEY, build, new Date(Date.now() + STALE_RUN_MS + 1000));
    expect(build).toHaveBeenCalledTimes(1);
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 1 });
  });

  it('không lưu được thông báo thì không đánh dấu xong, lần sau gửi lại', async () => {
    const u = await testUser(prisma, 'brief-notify-fail');
    const send = jest.spyOn(notifier, 'send').mockResolvedValueOnce(null);
    await expect(runs.run(u.id, KEY, () => Promise.resolve(content()))).rejects.toThrow('Không lưu được thông báo');
    send.mockRestore();
    await runs.run(u.id, KEY, () => Promise.resolve(content()));
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 1 });
  });

  it('AI lỗi trước khi có nội dung: không để lại cuộc trò chuyện, lần sau tạo được', async () => {
    const u = await testUser(prisma, 'brief-ai-fail');
    await expect(runs.run(u.id, KEY, () => Promise.reject(new Error('AI không trả về bản tin')))).rejects.toThrow();
    expect(await counts(u.id)).toEqual({ conversations: 0, notifications: 0 });
    await runs.run(u.id, KEY, () => Promise.resolve(content()), new Date(Date.now() + STALE_RUN_MS + 1000));
    expect(await counts(u.id)).toEqual({ conversations: 1, notifications: 1 });
  });

  it('chưa có gì để tổng kết thì nhả việc', async () => {
    const u = await testUser(prisma, 'brief-empty');
    expect(await runs.run(u.id, KEY, () => Promise.resolve(null))).toBeNull();
    expect(await prisma.briefRun.count({ where: { userId: u.id } })).toBe(0);
  });
});
