/**
 * Tạo tài khoản e2e@local có sẵn dữ liệu cho audit giao diện điện thoại (frontend/e2e/mobile.spec.ts) và in JWT.
 * Chỉ chạy trên database tên kết thúc bằng _test, _e2e hoặc _e2e_<hậu tố> (DB e2e riêng, vd dautu_e2e_08); chạy lại thì xoá tài khoản cũ và tạo lại.
 *   npm run build && DATABASE_URL=postgresql://…/dautu_test JWT_SECRET=… node scripts/seed-e2e.js
 */
const path = require('node:path');
const jwt = require('jsonwebtoken');

const url = process.env.DATABASE_URL ?? '';
if (!/_(test|e2e)(_[a-z0-9]+)?$/.test(url ? new URL(url).pathname : '')) {
  console.error('DATABASE_URL phải trỏ tới database tên kết thúc bằng _test, _e2e hoặc _e2e_<hậu tố>');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('Cần JWT_SECRET (giống backend đang chạy)');
  process.exit(1);
}

const dist = (p) => require(path.join(__dirname, '../dist', p));
const { PrismaService } = dist('prisma/prisma.service');
const { TransactionsService } = dist('portfolio/transactions.service');
const { scoreQuiz } = dist('profile/quiz');
const { vnDateKey } = dist('market/types');

const ANSWERS = {
  goal: 'accumulate',
  horizon: 'long',
  drawdown: '20',
  reaction: 'sell_some',
  experience: 'some',
  income_share: 'half',
  emergency: 'yes',
  margin: 'never',
  decision: 'groups',
  fomo_history: 'often',
};

const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const prisma = new PrismaService();
  // Mã được coi là hợp lệ; giá lấy từ nguồn thật khi backend chạy
  const market = {
    assertStock: (s) => Promise.resolve({ symbol: s }),
    goldQuotes: () => [],
    usdtVnd: { rate: 26_000 },
  };
  const tx = new TransactionsService(prisma, market);
  const email = 'e2e@local';
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({ data: { email, name: 'E2E Tester' } });
  await prisma.investorProfile.create({ data: { userId: user.id, ...scoreQuiz(ANSWERS), answers: ANSWERS } });

  const today = vnDateKey();
  const d = (n) => addDays(today, -n);
  for (const t of [
    { type: 'deposit', date: d(40), amount: 50_000_000 },
    { type: 'buy', date: d(35), assetType: 'stock', symbol: 'FPT', quantity: 100, price: 120_000, fee: 18_000 },
    { type: 'buy', date: d(30), assetType: 'stock', symbol: 'HPG', quantity: 500, price: 26_000 },
    { type: 'deposit', date: d(30), currency: 'USDT', amount: 2_000, fxRate: 25_800 },
    { type: 'buy', date: d(28), assetType: 'crypto', symbol: 'BTC', quantity: 0.01, price: 95_000, fxRate: 25_800 },
    { type: 'buy', date: d(20), assetType: 'crypto', symbol: 'ETH', quantity: 0.2, price: 3_200, fxRate: 25_900 },
    { type: 'sell', date: d(10), assetType: 'stock', symbol: 'HPG', quantity: 200, price: 27_500, tax: 5_500 },
    { type: 'dividend', date: d(5), symbol: 'FPT', amount: 200_000 },
  ]) {
    await tx.create(user.id, { note: undefined, ...t });
  }
  await prisma.watchItem.createMany({
    data: [
      { userId: user.id, assetType: 'stock', symbol: 'VNM' },
      { userId: user.id, assetType: 'crypto', symbol: 'SOLUSDT' },
    ],
  });
  const plan = await prisma.investmentPlan.create({
    data: {
      userId: user.id,
      assetType: 'stock',
      symbol: 'FPT',
      thesis: 'Doanh nghiệp công nghệ đầu ngành, tăng trưởng lợi nhuận đều.',
      horizon: 'Trên 3 năm',
      exitConditions: 'Tăng trưởng lợi nhuận dưới 10% hai quý liên tiếp',
      targetPrice: 160_000,
      stopPrice: 100_000,
      reviewEveryDays: 30,
      nextReviewAt: new Date(`${addDays(today, 3)}T00:00:00Z`),
    },
  });
  // Nhật ký quyết định (FREE-08): vài lệnh có nhãn cảm xúc / lý do, một lệnh gắn kế hoạch, một lần xem lại có nhãn
  const tag = (symbol, type, data) => prisma.transaction.updateMany({ where: { userId: user.id, symbol, type }, data });
  await tag('FPT', 'buy', { planId: plan.id, emotion: 'calm', reason: 'plan' });
  await tag('ETHUSDT', 'buy', { emotion: 'fomo', reason: 'tip' });
  await tag('HPG', 'sell', { emotion: 'anxious', reason: 'need_cash' });
  await prisma.planReview.create({
    data: {
      planId: plan.id,
      decision: 'keep',
      note: 'Kết quả kinh doanh quý vẫn tăng đều, giữ nguyên kế hoạch.',
      reason: 'plan',
      emotion: 'calm',
      priceAtReview: 120_000,
    },
  });
  await prisma.goal.create({
    data: {
      userId: user.id,
      name: 'Quỹ mua nhà',
      targetAmount: 1_500_000_000,
      targetDate: new Date(`${addDays(today, 5 * 365)}T00:00:00Z`),
      monthlyContribution: 10_000_000,
      allocations: { create: [{ assetType: 'stock', symbol: 'FPT', pct: 100 }] },
    },
  });
  await prisma.conversation.create({
    data: {
      userId: user.id,
      title: 'FPT có nên mua thêm?',
      messages: {
        create: [
          { role: 'user', content: [{ type: 'text', text: 'FPT có nên mua thêm?' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Câu trả lời mẫu cho audit giao diện.' }] },
        ],
      },
    },
  });
  await prisma.priceAlert.create({
    data: { userId: user.id, assetType: 'stock', symbol: 'FPT', direction: 'above', targetPrice: 200_000 },
  });
  await prisma.$disconnect();
  process.stdout.write(jwt.sign({ sub: user.id, email }, process.env.JWT_SECRET, { expiresIn: '1d' }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
