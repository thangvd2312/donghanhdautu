/**
 * Từ điển sự kiện đo hành vi (OBS-01). Mỗi sự kiện: ai phát (server / client), lúc nào, thuộc tính được phép
 * và khoá chống ghi trùng. Không có sự kiện nào mang token, nội dung chat, ghi chú, email hay giá trị danh mục:
 * thuộc tính ngoài danh sách `props` bị bỏ, giá trị chỉ là nhãn ngắn hoặc số đếm.
 */
import type { ClientEvent } from '@dautu/contracts';

export interface EventDef {
  source: 'server' | 'client';
  description: string;
  /** Thuộc tính được ghi và ý nghĩa */
  props: Record<string, string>;
  /** Cách chống ghi trùng (dedupeKey theo người dùng / thiết bị ẩn danh) */
  dedupe: string;
}

export const EVENTS = {
  signup: {
    source: 'server',
    description: 'Tạo tài khoản mới (mật khẩu hoặc Google lần đầu)',
    props: { method: 'password | google' },
    dedupe: 'Một lần mỗi người dùng',
  },
  onboarding_completed: {
    source: 'server',
    description: 'Lưu kết quả khảo sát khẩu vị rủi ro lần đầu',
    props: {},
    dedupe: 'Một lần mỗi người dùng (làm lại khảo sát không tính)',
  },
  onboarding_skipped: {
    source: 'client',
    description: 'Bấm "Để sau" ở khảo sát',
    props: {},
    dedupe: 'Một lần mỗi người dùng',
  },
  first_real_asset_added: {
    source: 'server',
    description: 'Giao dịch / số dư thật đầu tiên được ghi vào sổ (tay hoặc CSV; không tính chuyển đổi dữ liệu cũ)',
    props: { via: 'manual | csv' },
    dedupe: 'Một lần mỗi người dùng',
  },
  import_completed: {
    source: 'server',
    description: 'Xác nhận nhập CSV thành công (không tính gửi lại cùng file)',
    props: { rows: 'số giao dịch được nhập', errors: 'số dòng lỗi bị bỏ', total: 'số dòng trong file' },
    dedupe: 'Theo đợt nhập',
  },
  import_rejected: {
    source: 'server',
    description: 'Xác nhận nhập CSV nhưng không có dòng nào nhập được (file sai cột / mọi dòng lỗi / đã nhập rồi)',
    props: {
      reason: 'mapping | errors | duplicates',
      errors: 'số dòng lỗi',
      total: 'số dòng trong file',
    },
    dedupe: 'Không chống trùng',
  },
  portfolio_viewed: {
    source: 'client',
    description: 'Mở trang Danh mục',
    props: {},
    dedupe: 'Một lần mỗi người mỗi ngày (giờ VN)',
  },
  portfolio_valued: {
    source: 'server',
    description: 'Danh mục được định giá khi người dùng mở — ghi trạng thái dữ liệu giá để đo chất lượng dữ liệu',
    props: { status: 'ok | partial (thiếu giá) | degraded (giá cũ / tỷ giá dự phòng)' },
    dedupe: 'Một lần mỗi người mỗi ngày (giờ VN)',
  },
  app_active: {
    source: 'client',
    description: 'Mở app khi đã đăng nhập — dùng tính người dùng hoạt động và giữ chân D7/D30',
    props: {},
    dedupe: 'Một lần mỗi người mỗi ngày (giờ VN)',
  },
  brief_generated: {
    source: 'server',
    description: 'Bản tin (sáng / chiều / tuần) được tạo và gửi thông báo',
    props: { kind: 'morning | closing | weekly', test: 'true khi bấm "Gửi thử"' },
    dedupe: 'Theo người dùng và kỳ bản tin',
  },
  brief_opened: {
    source: 'server',
    description: 'Mở cuộc trò chuyện chứa bản tin',
    props: { kind: 'morning | closing | weekly' },
    dedupe: 'Lần mở đầu tiên của mỗi bản tin',
  },
  brief_followup: {
    source: 'server',
    description: 'Hỏi tiếp cố vấn ngay trong cuộc trò chuyện của bản tin',
    props: { kind: 'morning | closing | weekly' },
    dedupe: 'Lần hỏi đầu tiên của mỗi bản tin',
  },
  advisor_asked: {
    source: 'server',
    description: 'Gửi một câu hỏi cho cố vấn AI (không ghi nội dung)',
    props: { inBrief: 'true khi hỏi trong cuộc trò chuyện của bản tin' },
    dedupe: 'Không chống trùng: mỗi câu hỏi một sự kiện',
  },
  plan_created: {
    source: 'server',
    description: 'Lưu một kế hoạch đầu tư mới',
    props: {},
    dedupe: 'Không chống trùng',
  },
  plan_reviewed: {
    source: 'server',
    description: 'Ghi một lần xem lại kế hoạch',
    props: { decision: 'keep | adjust | close' },
    dedupe: 'Không chống trùng',
  },
  demo_viewed: {
    source: 'client',
    description: 'Khách chưa đăng nhập xem danh mục mẫu (sample = true)',
    props: {},
    dedupe: 'Một lần mỗi thiết bị mỗi ngày',
  },
  demo_signup_clicked: {
    source: 'client',
    description: 'Khách bấm đăng ký / đăng nhập từ trang danh mục mẫu (sample = true)',
    props: { target: 'register | login' },
    dedupe: 'Một lần mỗi thiết bị mỗi ngày',
  },
} satisfies Record<string, EventDef>;

export type EventName = keyof typeof EVENTS;

/** Tên các sự kiện có nguồn `client` trong từ điển */
type ClientEventName = { [K in EventName]: (typeof EVENTS)[K]['source'] extends 'client' ? K : never }[EventName];

/**
 * Kiểm tra lúc biên dịch: `ClientEvent` trong hợp đồng (frontend gửi) phải khớp đúng với các sự kiện `client` của từ điển.
 * Thêm / bớt sự kiện ở một phía mà quên phía kia sẽ làm dòng này không biên dịch được.
 */
export type ClientEventsMatchContract = MustBeTrue<
  [ClientEventName] extends [ClientEvent] ? ([ClientEvent] extends [ClientEventName] ? true : false) : false
>;
type MustBeTrue<T extends true> = T;

export const CLIENT_EVENTS = (Object.keys(EVENTS) as EventName[]).filter((k) => EVENTS[k].source === 'client');

/** Chỉ giữ thuộc tính có trong từ điển; giá trị là số hữu hạn hoặc chuỗi ngắn */
export function cleanProps(name: EventName, props: Record<string, unknown> | undefined) {
  const out: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(EVENTS[name].props)) {
    const v = props?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string' && v.length <= 40) out[key] = v;
  }
  return out;
}

/** Số ngày giữ sự kiện trước khi xoá */
export const RETENTION_DAYS = 400;
