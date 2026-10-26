import { appValidationPipe } from '../../common/validation';
import { SubscribeDto } from './push.dto';

const keys = { p256dh: 'BPk', auth: 'abc' };
const check = (endpoint: string) =>
  appValidationPipe()
    .transform({ endpoint, keys }, { type: 'body', metatype: SubscribeDto })
    .then(() => true)
    .catch(() => false);

describe('SubscribeDto.endpoint', () => {
  it('nhận địa chỉ của dịch vụ Web Push trình duyệt', async () => {
    expect(await check('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(await check('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(await check('https://web.push.apple.com/QK1abc')).toBe(true);
    expect(await check('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });

  it('từ chối localhost, IP, máy nội bộ, http và tên miền giả dạng', async () => {
    expect(await check('https://localhost:3977/push')).toBe(false);
    expect(await check('https://10.0.0.5/push')).toBe(false);
    expect(await check('https://internal.corp/push')).toBe(false);
    expect(await check('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(await check('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(await check('https://evilgoogleapis.com/x')).toBe(false);
  });
});
