/**
 * Xếp hạng độ tin cậy nguồn tin. Gắn nhãn cho mọi kết quả tìm kiếm / trang đã đọc trước khi đưa cho AI:
 * AI vẫn tự đánh giá, nhưng luôn thấy rõ nguồn nào là chính thức, nguồn nào là thứ cấp.
 *
 *  1 = chính thức: cơ quan nhà nước, ngân hàng trung ương, sở giao dịch, tổ chức quốc tế, cơ sở dữ liệu văn bản pháp luật
 *  2 = báo chí / tổ chức tài chính uy tín: báo lớn, hãng tin, công ty chứng khoán
 *  3 = thứ cấp: mạng xã hội, diễn đàn, blog, trang dịch vụ, nguồn chưa phân loại
 */
export type SourceTier = 1 | 2 | 3;

const TIER1_SUFFIX = ['.gov.vn', '.gov', '.gov.uk', '.europa.eu', '.int'];

const TIER1 = [
  // Việt Nam
  'sbv.gov.vn',
  'chinhphu.vn',
  'baochinhphu.vn',
  'xaydungchinhsach.chinhphu.vn',
  'vanban.chinhphu.vn',
  'quochoi.vn',
  'mof.gov.vn',
  'nso.gov.vn',
  'gso.gov.vn',
  'ssc.gov.vn',
  'hsx.vn',
  'hnx.vn',
  'vsd.vn',
  'vsdc.vn',
  'vbpl.vn',
  'congbao.chinhphu.vn',
  'thuvienphapluat.vn',
  'luatvietnam.vn',
  // Quốc tế
  'federalreserve.gov',
  'ecb.europa.eu',
  'bankofengland.co.uk',
  'boj.or.jp',
  'pbc.gov.cn',
  'imf.org',
  'worldbank.org',
  'adb.org',
  'bis.org',
  'oecd.org',
  'wto.org',
  'opec.org',
  'iea.org',
  'un.org',
  'sec.gov',
  'bls.gov',
  'bea.gov',
  'treasury.gov',
  'msci.com',
  'ftserussell.com',
  'lseg.com',
];

const TIER2 = [
  // Báo chí, hãng tin Việt Nam
  'vnexpress.net',
  'e.vnexpress.net',
  'tuoitre.vn',
  'thanhnien.vn',
  'vietnamnet.vn',
  'nhandan.vn',
  'vtv.vn',
  'vov.vn',
  'vnanet.vn',
  'baotintuc.vn',
  'vietnamplus.vn',
  'dantri.com.vn',
  'laodong.vn',
  'nld.com.vn',
  'znews.vn',
  'zingnews.vn',
  'plo.vn',
  'sggp.org.vn',
  'qdnd.vn',
  'cand.com.vn',
  'baodautu.vn',
  'vir.com.vn',
  'vneconomy.vn',
  'thesaigontimes.vn',
  'thoibaonganhang.vn',
  'thoibaotaichinhvietnam.vn',
  'tinnhanhchungkhoan.vn',
  'cafef.vn',
  'cafebiz.vn',
  'vietstock.vn',
  'bnews.vn',
  'theleader.vn',
  'diendandoanhnghiep.vn',
  'tapchicongthuong.vn',
  'tapchitaichinh.vn',
  'vietnambiz.vn',
  'ndh.vn',
  'kinhtedothi.vn',
  'vccinews.vn',
  // Công ty chứng khoán (báo cáo phân tích)
  'ssi.com.vn',
  'vndirect.com.vn',
  'vietcap.com.vn',
  'vcsc.com.vn',
  'hsc.com.vn',
  'mbs.com.vn',
  'vcbs.com.vn',
  'bsc.com.vn',
  'fpts.com.vn',
  'acbs.com.vn',
  'kbsec.com.vn',
  'mas.com.vn',
  'tcbs.com.vn',
  'vps.com.vn',
  'shs.com.vn',
  'bsi.com.vn',
  'vdsc.com.vn',
  'kisvn.vn',
  'yuanta.com.vn',
  'masvn.com',
  'phs.vn',
  'agriseco.com.vn',
  'pinetree.vn',
  'dsc.com.vn',
  'abs.vn',
  'vietinbanksc.com.vn',
  'ors.com.vn',
  'vixs.vn',
  'fiingroup.vn',
  'fiintrade.vn',
  // Quốc tế
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'economist.com',
  'nikkei.com',
  'asia.nikkei.com',
  'scmp.com',
  'marketwatch.com',
  'theguardian.com',
  'nytimes.com',
  'barrons.com',
  'forbes.com',
  'fortune.com',
  'coindesk.com',
  'theblock.co',
  'kitco.com',
  'spglobal.com',
  'moodys.com',
  'fitchratings.com',
  'investing.com',
];

const TIER3_EXPLICIT = [
  'facebook.com',
  'fb.com',
  'm.facebook.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'threads.net',
  'reddit.com',
  't.me',
  'zalo.me',
  'linkedin.com',
  'medium.com',
  'substack.com',
  'blogspot.com',
  'wordpress.com',
  'quora.com',
  'voz.vn',
  'webtretho.com',
  'tinhte.vn',
];

const LABEL: Record<SourceTier, string> = {
  1: 'Chính thức (cơ quan nhà nước / tổ chức gốc)',
  2: 'Báo chí, tổ chức tài chính uy tín',
  3: 'Thứ cấp (mạng xã hội, diễn đàn, blog, trang dịch vụ hoặc chưa phân loại)',
};

function matches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function classifySource(url: string): { domain: string; tier: SourceTier; tierLabel: string } {
  const domain = hostOf(url);
  let tier: SourceTier = 3;
  if (TIER3_EXPLICIT.some((d) => matches(domain, d))) tier = 3;
  else if (TIER1.some((d) => matches(domain, d))) tier = 1;
  else if (TIER2.some((d) => matches(domain, d))) tier = 2;
  else if (TIER1_SUFFIX.some((s) => domain.endsWith(s))) tier = 1;
  return { domain, tier, tierLabel: LABEL[tier] };
}
