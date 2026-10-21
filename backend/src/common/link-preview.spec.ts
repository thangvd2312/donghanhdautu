import { pagePreview, withPreview } from './link-preview';

const HTML = [
  '<title>Đồng Hành Đầu Tư</title>',
  '<meta name="description" content="mặc định" />',
  '<meta property="og:url" content="https://dautu.thangvu.io.vn/" />',
  '<meta property="og:title" content="Đồng Hành Đầu Tư" />',
  '<meta property="og:description" content="mặc định" />',
  '<meta name="twitter:title" content="Đồng Hành Đầu Tư" />',
  '<meta name="twitter:description" content="mặc định" />',
].join('\n');

describe('pagePreview', () => {
  it('trang cổ phiếu: chuẩn hoá mã, bỏ dấu / cuối', () => {
    expect(pagePreview('/stock/fpt/')).toMatchObject({ title: 'Cổ phiếu FPT', path: '/stock/FPT' });
  });

  it('mã không hợp lệ hoặc trang lạ thì giữ mặc định', () => {
    expect(pagePreview('/stock/<script>')).toBeNull();
    expect(pagePreview('/stock/%22onload%3D')).toBeNull();
    expect(pagePreview('/')).toBeNull();
    expect(pagePreview('/settings')).toBeNull();
    expect(pagePreview('/stock/%E0%A4%A')).toBeNull();
  });

  it('so sánh: lấy 2–4 mã hợp lệ, bỏ trùng; ngoài khoảng thì dùng tiêu đề chung', () => {
    expect(pagePreview('/compare', { symbols: 'fpt,VCB,fpt' })).toMatchObject({
      title: 'So sánh FPT, VCB',
      path: '/compare?symbols=FPT,VCB',
    });
    expect(pagePreview('/compare', { symbols: 'FPT' })).toMatchObject({ title: 'So sánh cổ phiếu', path: '/compare' });
    expect(pagePreview('/compare', { symbols: ['FPT', 'VCB'] })).toMatchObject({ title: 'So sánh cổ phiếu' });
  });

  it('crypto bỏ hậu tố USDT trong tên', () => {
    expect(pagePreview('/crypto/btcusdt')).toMatchObject({ title: 'BTC (crypto)', path: '/crypto/BTCUSDT' });
  });

  it('các trang tính năng có tiêu đề riêng', () => {
    for (const p of ['/events', '/screener', '/income', '/simulate', '/market', '/news', '/demo', '/register']) {
      expect(pagePreview(p)?.title).toBeTruthy();
    }
  });
});

describe('withPreview', () => {
  it('thay tiêu đề, mô tả, og:url; giữ phần còn lại', () => {
    const out = withPreview(HTML, pagePreview('/stock/FPT'), 'https://dautu.thangvu.io.vn/');
    expect(out).toContain('<title>Cổ phiếu FPT · Đồng Hành Đầu Tư</title>');
    expect(out).toContain('<meta property="og:title" content="Cổ phiếu FPT · Đồng Hành Đầu Tư" />');
    expect(out).toContain('<meta name="twitter:title" content="Cổ phiếu FPT · Đồng Hành Đầu Tư" />');
    expect(out).toContain('<meta property="og:url" content="https://dautu.thangvu.io.vn/stock/FPT" />');
    expect(out).not.toContain('mặc định');
  });

  it('không có preview thì trả nguyên văn', () => {
    expect(withPreview(HTML, null, 'https://x')).toBe(HTML);
  });

  it('thoát ký tự HTML trong nội dung', () => {
    const out = withPreview(HTML, { title: 'A "B" <C>', description: 'x & y', path: '/x' }, 'https://x');
    expect(out).toContain('content="A &quot;B&quot; &lt;C&gt; · Đồng Hành Đầu Tư"');
    expect(out).toContain('content="x &amp; y"');
  });
});
