import type { FastifyInstance } from 'fastify';

const trendCacheTtlMs = 6 * 60 * 60 * 1000;
const trendLexicon = [
  '慢热救赎', '悬疑求生', '网恋掉马', '先婚后爱', '追妻火葬场', '时间循环', '规则怪谈', '无限流',
  '群像成长', '都市日常', '青春甜宠', '现实向', '小镇文学', '公路文', '职场婚恋', '娱乐圈',
  '古风世情', '古言脑洞', '宫斗宅斗', '种田经营', '基建', '东方幻想', '仙侠修真', '历史权谋',
  '科幻末世', '星际机甲', '赛博朋克', '都市异能', '悬疑推理', '轻喜剧', '双向暗恋', '破镜重圆',
  '欢喜冤家', '双强', '成长流', '治愈日常', '封闭空间', '高概念'
];
const fallbackKeywords = ['慢热救赎', '悬疑求生', '时间循环', '双强', '科幻末世', '古风世情', '治愈日常', '网恋掉马'];

let cachedPayload: { keywords: string[]; fetchedAt: number; sourceLabel: string } | null = null;

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchSearchTrendText(query: string) {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('format', 'rss');
  url.searchParams.set('q', query);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
      'User-Agent': 'BabyLink-Fanfic-Trend/1.0'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return '';
  return decodeXmlEntities((await response.text()).replace(/<[^>]+>/g, ' '));
}

async function collectTrendKeywords() {
  const year = new Date().getFullYear();
  const queries = [
    `${year} 中文小说 热门题材 趋势`,
    `${year} 女频 小说 热门标签 榜单`,
    `${year} 网络文学 新书 热门类型`
  ];
  const texts = await Promise.all(queries.map((query) => fetchSearchTrendText(query).catch(() => '')));
  const corpus = texts.join('\n');
  const scored = trendLexicon
    .map((keyword, order) => ({
      keyword,
      count: corpus.split(keyword).length - 1,
      order
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .map((entry) => entry.keyword);
  return [...scored, ...fallbackKeywords.filter((keyword) => !scored.includes(keyword))].slice(0, 14);
}

export async function registerFanficTrendRoutes(app: FastifyInstance) {
  app.get('/api/fanfic/trends', {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } }
  }, async (_request, reply) => {
    const now = Date.now();
    if (!cachedPayload || now - cachedPayload.fetchedAt >= trendCacheTtlMs) {
      const keywords = await collectTrendKeywords().catch(() => fallbackKeywords);
      cachedPayload = {
        keywords: keywords.length ? keywords : fallbackKeywords,
        fetchedAt: now,
        sourceLabel: '公开搜索趋势 · 仅提取通用题材标签'
      };
    }
    reply.header('Cache-Control', 'private, max-age=1800');
    return cachedPayload;
  });
}