import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Câu báo lỗi tiếng Việt cho các ràng buộc class-validator dùng thông báo mặc định (tiếng Anh, vd
 * "allocations.0.pct must not be greater than 100"). Thông báo tự viết trong DTO (tiếng Việt) giữ nguyên.
 */
const VI: Record<string, string> = {
  isNotEmpty: 'không được để trống',
  isDefined: 'là bắt buộc',
  isString: 'phải là chữ',
  isNumber: 'phải là số',
  isInt: 'phải là số nguyên',
  isPositive: 'phải lớn hơn 0',
  min: 'nhỏ hơn mức cho phép',
  max: 'lớn hơn mức cho phép',
  isIn: 'có giá trị không hợp lệ',
  isEnum: 'có giá trị không hợp lệ',
  isBoolean: 'phải là đúng / sai',
  isArray: 'phải là danh sách',
  arrayMinSize: 'có quá ít mục',
  arrayMaxSize: 'có quá nhiều mục',
  arrayNotEmpty: 'không được để trống',
  maxLength: 'quá dài',
  minLength: 'quá ngắn',
  isDateString: 'không đúng dạng ngày (YYYY-MM-DD)',
  isISO8601: 'không đúng dạng ngày (YYYY-MM-DD)',
  matches: 'không đúng định dạng',
  isEmail: 'không phải email hợp lệ',
  isObject: 'không đúng dạng',
  whitelistValidation: 'không được phép gửi',
};

/** Thông báo mặc định của class-validator là ASCII tiếng Anh; thông báo tự viết có dấu tiếng Việt */
const isDefaultMessage = (m: string) => [...m].every((c) => c.charCodeAt(0) < 0x80);

export function validationMessages(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([rule, msg]) =>
      isDefaultMessage(msg) ? `Trường ${path} ${VI[rule] ?? 'không hợp lệ'}` : msg,
    );
    return [...own, ...validationMessages(e.children ?? [], path)];
  });
}

/** Pipe kiểm tra đầu vào dùng chung cho app và test DTO */
export function appValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(validationMessages(errors)),
  });
}
