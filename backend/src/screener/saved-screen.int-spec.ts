import { testPrisma, testUser } from '../test-utils/test-db';
import { MAX_SAVED_SCREENS, SavedScreenService } from './saved-screen.service';

const prisma = testPrisma();
const saved = new SavedScreenService(prisma);

afterAll(() => prisma.$disconnect());

const filters = [
  { key: 'pe', min: 0, max: 10 },
  { key: 'exchange', values: ['HOSE'] },
];

describe('bộ lọc cổ phiếu đã lưu (PostgreSQL)', () => {
  it('tạo, đọc, sửa, xoá; danh sách mới sửa trước', async () => {
    const u = await testUser(prisma, 'scr-crud');
    const a = await saved.create(u.id, { name: ' P/E thấp ', filters, sort: { key: 'pe', dir: 'asc' } });
    expect(a).toMatchObject({ name: 'P/E thấp', sort: { key: 'pe', dir: 'asc' } });
    const b = await saved.create(u.id, { name: 'ROE cao', filters: [{ key: 'roe', min: 15 }] });
    expect(b.sort).toBeNull();
    expect((await saved.list(u.id)).map((s) => s.name)).toEqual(['ROE cao', 'P/E thấp']);

    const renamed = await saved.update(u.id, a.id, { name: 'Rẻ' });
    expect(renamed).toMatchObject({ name: 'Rẻ', filters: a.filters, sort: { key: 'pe', dir: 'asc' } });
    expect((await saved.list(u.id))[0].id).toBe(a.id);

    const changed = await saved.update(u.id, a.id, { filters: [{ key: 'pb', max: 1 }], sort: null });
    expect(changed.filters).toEqual([{ key: 'pb', max: 1 }]);
    expect(changed.sort).toBeNull();

    await expect(saved.remove(u.id, a.id)).resolves.toEqual({ ok: true });
    expect(await saved.list(u.id)).toHaveLength(1);
    await expect(saved.remove(u.id, a.id)).rejects.toThrow('Không tìm thấy bộ lọc');
  });

  it('tên trùng trong cùng người dùng bị từ chối, người khác dùng lại được', async () => {
    const u = await testUser(prisma, 'scr-dup');
    const other = await testUser(prisma, 'scr-dup2');
    const first = await saved.create(u.id, { name: 'Trùng', filters });
    await expect(saved.create(u.id, { name: 'Trùng', filters })).rejects.toThrow('trùng tên');
    await expect(saved.create(other.id, { name: 'Trùng', filters })).resolves.toBeDefined();
    const second = await saved.create(u.id, { name: 'Khác', filters });
    await expect(saved.update(u.id, second.id, { name: 'Trùng' })).rejects.toThrow('trùng tên');
    await expect(saved.update(u.id, first.id, { name: 'Trùng' })).resolves.toBeDefined();
  });

  it('kiểm tra tên và nội dung bộ lọc khi lưu', async () => {
    const u = await testUser(prisma, 'scr-valid');
    await expect(saved.create(u.id, { name: '   ', filters })).rejects.toThrow('1 đến 60');
    await expect(saved.create(u.id, { name: 'x'.repeat(61), filters })).rejects.toThrow('1 đến 60');
    await expect(saved.create(u.id, { name: 'A', filters: [{ key: 'pe', min: 9, max: 1 }] })).rejects.toThrow(
      'không được lớn hơn',
    );
    await expect(saved.create(u.id, { name: 'A', filters: [{ key: 'zzz', min: 1 }] })).rejects.toThrow('không tồn tại');
    await expect(
      saved.create(u.id, { name: 'A', filters, sort: { key: 'dividendYield', dir: 'asc' } }),
    ).rejects.toThrow('Không sắp xếp được');
    expect(await saved.list(u.id)).toHaveLength(0);
  });

  it('bỏ lọc cổ tức thì sắp xếp theo cổ tức cũ bị bỏ thay vì lỗi', async () => {
    const u = await testUser(prisma, 'scr-sort');
    const s = await saved.create(u.id, {
      name: 'Cổ tức',
      filters: [{ key: 'dividendYield', min: 3 }],
      sort: { key: 'dividendYield', dir: 'desc' },
    });
    const updated = await saved.update(u.id, s.id, { filters: [{ key: 'roe', min: 10 }] });
    expect(updated.sort).toBeNull();
  });

  it('mỗi người tối đa 20 bộ lọc, kể cả khi tạo cùng lúc', async () => {
    const u = await testUser(prisma, 'scr-limit');
    const results = await Promise.allSettled(
      Array.from({ length: MAX_SAVED_SCREENS + 5 }, (_, i) => saved.create(u.id, { name: `F${i}`, filters })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_SAVED_SCREENS);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as Error).message).toContain('tối đa 20');
    const another = await testUser(prisma, 'scr-limit2');
    await expect(saved.create(another.id, { name: 'F0', filters })).resolves.toBeDefined();
  });

  it('không đọc, sửa, xoá được bộ lọc của người khác; xoá user thì xoá bộ lọc', async () => {
    const owner = await testUser(prisma, 'scr-owner');
    const intruder = await testUser(prisma, 'scr-intruder');
    const s = await saved.create(owner.id, { name: 'Của tôi', filters });
    expect(await saved.list(intruder.id)).toEqual([]);
    await expect(saved.update(intruder.id, s.id, { name: 'Hack' })).rejects.toThrow('Không tìm thấy bộ lọc');
    await expect(saved.remove(intruder.id, s.id)).rejects.toThrow('Không tìm thấy bộ lọc');
    expect((await saved.list(owner.id))[0].name).toBe('Của tôi');
    await prisma.user.delete({ where: { id: owner.id } });
    expect(await prisma.savedScreen.count({ where: { userId: owner.id } })).toBe(0);
  });
});
