import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Tạo client Claude. Thứ tự lấy thông tin xác thực theo SDK:
 * LLM_API_KEY → ANTHROPIC_AUTH_TOKEN → profile của `ant auth login`.
 * LLM_BASE_URL cho phép đi qua router/proxy có endpoint chuẩn Anthropic (/v1/messages).
 * Trả về null khi không có nguồn nào, để app vẫn chạy (tắt cố vấn AI).
 */
export function createAnthropicClient(): Anthropic | null {
  const baseURL = process.env.LLM_BASE_URL || undefined;
  if (process.env.LLM_API_KEY) return new Anthropic({ apiKey: process.env.LLM_API_KEY, baseURL });
  if (process.env.ANTHROPIC_AUTH_TOKEN || hasCliProfile()) {
    try {
      return new Anthropic({ baseURL });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Chế độ tương thích cho router bên thứ ba: tắt các tính năng chỉ API Anthropic chính thức có
 * (beta endpoint, server-side fallbacks, web search, adaptive thinking, structured outputs).
 * Mặc định bật khi có LLM_BASE_URL; ghi đè bằng ADVISOR_COMPAT_MODE=true|false.
 */
export function compatMode() {
  const v = process.env.ADVISOR_COMPAT_MODE;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return !!process.env.LLM_BASE_URL;
}

function hasCliProfile() {
  const dir = join(process.env.ANTHROPIC_CONFIG_DIR ?? join(homedir(), '.config', 'anthropic'), 'credentials');
  return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.json'));
}
