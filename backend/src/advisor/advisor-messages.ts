import type Anthropic from '@anthropic-ai/sdk';

/** The server prefixes every user turn with the current time (VN) so the model knows "today"; strip it for display. */
export const TIME_PREFIX = /^\[Thời điểm hiện tại: [^\]]*\]\n/;

export function searchLabel(input: unknown) {
  const q = (input as { query?: string } | null)?.query;
  return q ? `Tìm trên web: "${q}"` : 'Tìm trên web';
}

export function sourcesOf(block: Anthropic.Beta.BetaContentBlock): { title: string; url: string }[] {
  if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
    return block.content.map((r) => ({ title: r.title, url: r.url }));
  }
  if (block.type === 'text' && block.citations) {
    return block.citations
      .filter((c): c is Anthropic.Beta.BetaCitationsWebSearchResultLocation => c.type === 'web_search_result_location')
      .map((c) => ({ title: c.title ?? c.url, url: c.url }));
  }
  return [];
}

/** Link từ kết quả search_web / read_webpage (tool phía client) để hiển thị như nguồn web */
export function sourcesOfToolResult(toolName: string, content: string): { title: string; url: string }[] {
  try {
    if (toolName === 'search_web') {
      const d = JSON.parse(content) as { results?: { title: string; url: string }[] };
      return (d.results ?? []).map((r) => ({ title: r.title, url: r.url }));
    }
    if (toolName === 'read_webpage') {
      const d = JSON.parse(content) as { title: string; url: string };
      return d.url ? [{ title: d.title || d.url, url: d.url }] : [];
    }
  } catch {
    /* kết quả không phải JSON */
  }
  return [];
}

export function dedupe(items: { title: string; url: string }[]) {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}
