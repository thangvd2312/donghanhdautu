/** Rút văn bản thuần từ HTML hồ sơ doanh nghiệp (bỏ thẻ, giải mã các thực thể tiếng Việt thường gặp) */
export function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&ocirc;': 'ô',
  '&oacute;': 'ó',
  '&ograve;': 'ò',
  '&otilde;': 'õ',
  '&aacute;': 'á',
  '&agrave;': 'à',
  '&atilde;': 'ã',
  '&acirc;': 'â',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&ecirc;': 'ê',
  '&iacute;': 'í',
  '&igrave;': 'ì',
  '&uacute;': 'ú',
  '&ugrave;': 'ù',
  '&yacute;': 'ý',
  '&amp;': '&',
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&Ocirc;': 'Ô',
  '&Aacute;': 'Á',
  '&Eacute;': 'É',
  '&Uacute;': 'Ú',
  '&Ecirc;': 'Ê',
};
