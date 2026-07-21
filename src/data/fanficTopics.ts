import type { FanficTopic } from '@/types/domain';

export interface FanficGenreSection {
  id: string;
  label: string;
  description: string;
  topics: string[];
}

export interface FanficGenreGroup {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  sections: FanficGenreSection[];
}

const builtInCreatedAt = Date.UTC(2026, 6, 22);

export const fanficGenreGroups: FanficGenreGroup[] = [
  {
    id: 'ancient-romance',
    label: '古代言情',
    shortLabel: '古言',
    description: '从庙堂、江湖到田园市井，覆盖古风女频的完整主流与衍生赛道。',
    sections: [
      {
        id: 'era',
        label: '时代背景',
        description: '按朝代感、社会形态与历史距离选择故事底色。',
        topics: ['古早架空', '正史古风·清穿', '正史古风·宋代', '正史古风·唐代', '正史古风·汉代', '正史古风·魏晋', '正史古风·明初', '春秋战国 / 先秦古风', '民国言情', '末世古代 / 废土古风']
      },
      {
        id: 'transmigration',
        label: '穿越古言',
        description: '以穿越、重生或快穿改变既定人生。',
        topics: ['清穿·九子夺嫡', '清穿·宫斗王府流', '胎穿·从小布局', '魂穿·庶女', '魂穿·弃妃', '魂穿·炮灰', '魂穿·侯府小姐', '身穿·携带现代物品', '身穿·运用现代知识', '双重生', '女主重生', '快穿古代副本']
      },
      {
        id: 'household',
        label: '宅斗文',
        description: '以内宅秩序、家族资源和女性生存智慧为核心。',
        topics: ['庶女逆袭', '嫡女复仇', '后宅小妾争斗', '继母继女', '侯府世家宅斗', '种田宅斗']
      },
      {
        id: 'palace',
        label: '宫斗文',
        description: '在宫廷规则中完成生存、上位或复仇。',
        topics: ['帝王后宫', '妃嫔上位', '皇后权谋', '宫斗复仇', '冷宫逆袭']
      },
      {
        id: 'court',
        label: '朝堂权谋',
        description: '大女主事业线与家国抉择并重。',
        topics: ['女官', '摄政公主', '权臣夫人', '女扮男装为官', '谋夺江山', '家国天下线']
      },
      {
        id: 'farming',
        label: '种田古言',
        description: '从日常劳作、经营与邻里关系中慢慢建立生活。',
        topics: ['农家穿越', '开荒种地', '养娃经商', '乡土日常', '山野隐居', '药膳美食种田']
      },
      {
        id: 'martial-arts',
        label: '江湖武侠',
        description: '门派、侠义、恩怨与江湖秩序。',
        topics: ['侠女闯荡江湖', '门派恩怨', '魔教女主', '江湖权谋', '武侠甜宠']
      },
      {
        id: 'royal-sweet',
        label: '宫廷王府甜宠',
        description: '轻权谋、重陪伴，不以惨烈争斗为主要推动力。',
        topics: ['王爷王妃', '皇子贵女', '古言先婚后爱', '古言双向奔赴', '轻松古风甜文']
      },
      {
        id: 'angst',
        label: '虐古言',
        description: '强情绪、强抉择与遗憾美学。',
        topics: ['帝王虐妃', '古言替身文学', '古言相爱相杀', '家国误会', '阴阳相隔', '古言破镜重圆']
      },
      {
        id: 'infrastructure',
        label: '基建古言',
        description: '用经营和技术推动社会发展。',
        topics: ['古代开商铺', '古代造农具', '古代建城池', '发展民生', '发展手工业', '古代通商']
      },
      {
        id: 'commerce',
        label: '经商古言',
        description: '围绕商品、账目、商路与行业竞争展开事业线。',
        topics: ['古代女商人', '胭脂铺', '酒楼经营', '绸缎庄', '跨国商路', '钱庄票号']
      },
      {
        id: 'special',
        label: '特殊衍生',
        description: '古风与志怪、幻想或地域使命的融合题材。',
        topics: ['古言灵异 / 志怪', '宫廷妖怪', '修仙古风', '兽世古代', '和亲文', '和亲公主逆袭']
      }
    ]
  },
  {
    id: 'modern-romance',
    label: '现代言情',
    shortLabel: '现言',
    description: '都市、校园、行业与现实生活全覆盖，兼顾甜感、成长和事业线。',
    sections: [
      {
        id: 'wealthy',
        label: '总裁豪门',
        description: '资源、身份与亲密关系共同构成冲突。',
        topics: ['霸总甜宠', '现代先婚后爱', '契约婚姻', '豪门争斗', '千金逆袭', '真假千金', '财阀世家', '大佬隐婚']
      },
      {
        id: 'workplace',
        label: '职场现言',
        description: '专业成长与关系推进并行的行业故事。',
        topics: ['律师现言', '医生现言', '设计师现言', '媒体行业', '互联网职场', '公务员职场', '娱乐圈编剧', '职场逆袭', '行业文']
      },
      {
        id: 'campus',
        label: '校园言情',
        description: '青春成长、暗恋与人生选择。',
        topics: ['高中甜宠', '大学恋爱', '校园暗恋', '校园救赎', '学霸学渣', '破镜重圆校园', '校园重生']
      },
      {
        id: 'ordinary-life',
        label: '市井平民',
        description: '以普通人的工作、居住与家庭生活承载感情。',
        topics: ['普通人恋爱', '出租屋日常', '打工女孩', '烟火气婚后', '家长里短', '普通人基建创业']
      },
      {
        id: 'period',
        label: '年代文',
        description: '在七十至九十年代的社会变化中重建人生。',
        topics: ['70年代重生', '80年代重生', '90年代重生', '知青下乡', '随军年代文', '下岗创业', '养娃致富', '年代种田']
      },
      {
        id: 'relationship-trope',
        label: '特殊人设',
        description: '以关系模式和人物张力决定叙事核心。',
        topics: ['现代破镜重圆', '追妻火葬场', '现代替身文学', '相亲先婚后爱', '契约联姻日久生情', '姐弟恋·年下小狼狗', '姐弟恋·年下小奶狗', '大叔文·成熟年上', '双向救赎', '禁欲系医生', '禁欲系教授', '禁欲系军官', '禁欲系科研大佬']
      },
      {
        id: 'entertainment',
        label: '娱乐圈',
        description: '镜头、舆论、作品与真实自我之间的拉扯。',
        topics: ['顶流爱豆', '十八线逆袭', '影后影帝', '娱乐圈选秀', '娱乐圈综艺', '幕后编剧导演', '黑粉变真爱', '娱乐圈重生']
      },
      {
        id: 'military',
        label: '军旅现言',
        description: '职业使命、长期分离与稳定陪伴。',
        topics: ['军人现言', '特种兵', '随军家属', '军医', '消防员', '航空机组', '军旅甜宠']
      },
      {
        id: 'esports',
        label: '电竞现言',
        description: '竞技成长、团队协作与网络身份。',
        topics: ['电竞女选手', '游戏主播', '职业战队', '大神网恋', '吃鸡电竞', 'LOL电竞', '古风网游题材']
      },
      {
        id: 'food',
        label: '美食现言',
        description: '以味觉、手艺和经营创造治愈日常。',
        topics: ['现代开餐馆', '甜品师', '美食探店', '美食治愈系']
      },
      {
        id: 'modern-infrastructure',
        label: '现代基建',
        description: '以实业、空间和地方发展推动事业线。',
        topics: ['建筑师', '乡村振兴', '回乡创业', '实业建厂']
      },
      {
        id: 'urban-mystery',
        label: '灵异悬疑',
        description: '都市日常与异常案件交叠。',
        topics: ['女主阴阳眼', '捉鬼天师', '刑侦悬疑', '法医探案', '都市怪谈', '娱乐圈刑侦', '行业悬疑']
      },
      {
        id: 'modern-rebirth-system',
        label: '重生与系统',
        description: '以第二次机会或任务机制改变现实人生。',
        topics: ['校园重生·重回青年', '都市重生·改变人生', '穿搭系统', '美食系统', '赚钱系统', '好感系统']
      }
    ]
  },
  {
    id: 'fantasy-romance',
    label: '幻想言情',
    shortLabel: '幻想',
    description: '修仙、奇幻、星际、末世与无限世界，强调原创规则和宏大成长。',
    sections: [
      {
        id: 'xianxia',
        label: '修仙 / 仙侠',
        description: '仙门、飞升、仙魔秩序与修真事业。',
        topics: ['三界仙门', '渡劫飞升', '师徒恋', '仙魔大战', '灵根逆袭', '修真基建·开宗门', '修真基建·培育灵植', '修真基建·炼丹炼器', '发展修仙产业', '仙虐·仙魔对立', '仙虐·三生三世', '仙虐·历劫虐恋', '修仙甜宠·小师妹', '修仙甜宠·魔尊男主', '双向修仙', '穿书仙侠·修仙炮灰', '灵植单职业仙侠', '炼丹单职业仙侠', '御兽单职业仙侠']
      },
      {
        id: 'beast-world',
        label: '兽世文',
        description: '兽人文明、部落生存与蛮荒建设。',
        topics: ['远古兽人大陆', '兽人部落', '多兽夫', '兽世开荒种田', '兽世繁育向', '蛮荒基建']
      },
      {
        id: 'western-fantasy',
        label: '西幻言情',
        description: '西方魔法文明、种族与王权体系。',
        topics: ['魔法师', '骑士', '龙族', '吸血鬼', '精灵', '西幻宫廷王室', '魔法校园', '中世纪西方']
      },
      {
        id: 'supernatural',
        label: '灵异神怪',
        description: '神祇、妖灵与人间秩序相遇。',
        topics: ['地府判官', '九尾狐', '妖神', '山神', '幻想人鱼', '鬼怪甜宠', '聊斋风现代志怪']
      },
      {
        id: 'space',
        label: '星际科幻',
        description: '星际文明、科技制度和新世界经营。',
        topics: ['星际帝国', '机甲', '星际军校', '虫族', '星际人鱼', '星际基建', '外星领主', '穿越星际', '星际种田', '飞船经商']
      },
      {
        id: 'apocalypse',
        label: '末日丧尸',
        description: '灾后求生、秩序重建与高压关系。',
        topics: ['末世重生', '末世囤货基建', '丧尸异能', '末世基地建设', '生存恋爱', '高温天灾', '洪水天灾', '雪灾天灾', '地震天灾']
      },
      {
        id: 'infinite',
        label: '无限流 / 规则怪谈',
        description: '副本闯关、规则推理与循环生存。',
        topics: ['女主闯关副本', '惊悚密室', '规则怪谈', '灵异闯关', '副本恋爱', '无限流基建']
      },
      {
        id: 'system',
        label: '系统流全品类',
        description: '可叠加古代、现代与幻想世界的机制型题材。',
        topics: ['快穿', '穿书', '系统流重生', '任务系统', '锦鲤系统', '养老系统', '致富系统', '美貌系统', '功德系统', '虐渣快穿', '甜宠快穿', '事业快穿', '无 CP 快穿', '复仇快穿', '穿成恶毒女配', '穿成炮灰', '穿书自救', '原书男主爱上我']
      }
    ]
  },
  {
    id: 'no-romance',
    label: '无 CP 大女主',
    shortLabel: '无 CP',
    description: '保留用户与角色双主角，以共同事业和深厚羁绊为核心，不设置恋爱线。',
    sections: [
      {
        id: 'ancient-no-cp',
        label: '古言无 CP',
        description: '古代世界中的权力、技艺与个人道路。',
        topics: ['女帝', '女权臣', '无 CP 江湖侠女', '修仙独修', '无 CP 种田搞事业']
      },
      {
        id: 'modern-no-cp',
        label: '现言无 CP',
        description: '现代职业与社会议题中的独立成长。',
        topics: ['职场搞事业', '娱乐圈大女主', '科研大佬', '无 CP 刑侦法医']
      },
      {
        id: 'fantasy-no-cp',
        label: '幻想无 CP',
        description: '在宏大幻想世界中完成事业与使命。',
        topics: ['星际女王', '末世基地首领', '无限流单人闯关', '修仙独飞升']
      },
      {
        id: 'no-cp-principle',
        label: '无感情线方向',
        description: '不谈恋爱，把叙事重心完整交给事业与成长。',
        topics: ['纯事业线', '双主角战友情', '双主角知己线', '大女主复仇事业线']
      }
    ]
  },
  {
    id: 'niche',
    label: '小众特色',
    shortLabel: '小众',
    description: '跨世界观的稳定细分标签，可作为主赛道直接生成完整故事。',
    sections: [
      {
        id: 'food-cross',
        label: '美食文',
        description: '跨古代、现代与幻想世界的独立美食赛道。',
        topics: ['古代美食文', '现代美食文', '幻想美食文']
      },
      {
        id: 'pets',
        label: '养宠 / 御兽',
        description: '以照料、契约和共同成长连接人与非人伙伴。',
        topics: ['养猫狗', '养灵宠', '养神兽', '星际异兽']
      },
      {
        id: 'retirement',
        label: '养老治愈',
        description: '放慢节奏，在稳定生活中修复自我。',
        topics: ['佛系躺平', '种田养老', '修仙养老', '星际养老']
      },
      {
        id: 'infrastructure-cross',
        label: '全类型基建',
        description: '以资源规划、生产建设和群体生活改善推动剧情。',
        topics: ['古代基建流', '现代基建流', '星际基建流', '末世基建流']
      },
      {
        id: 'detective-romance',
        label: '悬疑探案言情',
        description: '案件调查与关系进展彼此推动。',
        topics: ['古代大理寺', '现代刑侦言情', '法医言情', '女捕快']
      },
      {
        id: 'full-dive-game',
        label: '游戏全息言情',
        description: '现实身份与虚拟世界关系交错。',
        topics: ['全息网游', '虚拟世界恋爱']
      },
      {
        id: 'fairy-tale',
        label: '童话改编言情',
        description: '借用公共领域母题重新设计世界规则与人物命运。',
        topics: ['白雪母题西幻改写', '灰姑娘母题西幻改写', '睡美人母题西幻改写', '小美人鱼母题西幻改写']
      },
      {
        id: 'game-character',
        label: '纸片人 / 穿游戏',
        description: '跨越媒介边界进入游戏世界。',
        topics: ['纸片人恋爱', '穿乙女游戏', '攻略 NPC']
      },
      {
        id: 'group-favorite',
        label: '团宠文',
        description: '稳定支持系统与群像关系带来安全感。',
        topics: ['全家宠爱女主', '世家团宠', '星际团宠', '修仙团宠']
      },
      {
        id: 'power-fantasy',
        label: '爽文标签',
        description: '强反馈、快成长与阶段性胜利。',
        topics: ['复仇虐渣', '打脸逆袭', '锦鲤好运', '金手指大女主']
      },
      {
        id: 'healing',
        label: '治愈系慢热',
        description: '无激烈冲突，以日常温情和缓慢信任推动故事。',
        topics: ['日常温情', '慢热陪伴', '低冲突治愈']
      },
      {
        id: 'be-aesthetic',
        label: 'BE 美学',
        description: '以遗憾、命运和余韵完成情绪表达。',
        topics: ['全员悲剧', '相爱不能相守', '开放式结局']
      }
    ]
  }
];

const groupStoryGuidance: Record<string, Pick<FanficTopic, 'setting' | 'conflict' | 'relationship'>> = {
  'ancient-romance': {
    setting: '使用完全原创的古风地域、制度、家族与生活细节，不照搬任何现成作品或人物原背景。',
    conflict: '两位主角必须在时代秩序、共同目标和个人选择之间找到全新的破局方式。',
    relationship: '双主角从利益或使命交点起步，在共同经历中建立平等、可信且循序渐进的关系。'
  },
  'modern-romance': {
    setting: '使用原创城市、机构、行业生态与生活空间，保持现实质感但不影射具体作品。',
    conflict: '职业目标、现实压力与双方不同的生活选择形成持续推进的核心矛盾。',
    relationship: '双主角以现实交集相识，在边界清晰的相处中逐步确认理解与爱意。'
  },
  'fantasy-romance': {
    setting: '从零建立世界规则、文明、地理、力量代价与社会制度，避免套用现成世界观。',
    conflict: '世界规则的代价、共同使命与双方成长方向彼此牵制，迫使两人不断作出选择。',
    relationship: '双主角在共同探索未知世界时形成互补关系，感情由行动、信任和牺牲自然推进。'
  },
  'no-romance': {
    setting: '使用完全原创的时代、组织、行业和规则，以事业成长与世界改变为主轴。',
    conflict: '两位主角面对同一事业目标和不同方法论，以合作、竞争与共同承担推动剧情。',
    relationship: '用户与角色仍是唯一双主角，保持知己、战友或事业伙伴羁绊，全程不设置恋爱线。'
  },
  niche: {
    setting: '围绕细分题材从零创造地点、行业、规则和社会关系，不复用人物原背景。',
    conflict: '细分题材的独特规则与两位主角的共同目标形成可持续升级的原创矛盾。',
    relationship: '双主角通过共同完成目标建立专属关系节奏，具体感情浓度服从所选题材。'
  }
};

export const builtInFanficTopics: FanficTopic[] = fanficGenreGroups.flatMap((group, groupIndex) =>
  group.sections.flatMap((section, sectionIndex) =>
    section.topics.map((title, topicIndex) => {
      const guidance = groupStoryGuidance[group.id];
      return {
        id: `fanfic_topic_${groupIndex + 1}_${sectionIndex + 1}_${topicIndex + 1}`,
        source: 'built-in' as const,
        title,
        hook: `以「${title}」为核心类型，让用户与角色从一次打破原有秩序的共同事件出发，发展只属于这本书的原创主线。`,
        setting: guidance.setting,
        conflict: guidance.conflict,
        relationship: guidance.relationship,
        tags: [group.shortLabel, section.label, title],
        trendKeywords: [],
        categoryId: group.id,
        categoryLabel: group.label,
        subcategory: section.label,
        builtIn: true,
        createdAt: builtInCreatedAt
      };
    })
  )
);

export function createFallbackTrendTopic(keyword: string, index: number): FanficTopic {
  const trendBases = builtInFanficTopics.filter((topic) => topic.categoryId !== 'no-romance');
  const base = trendBases[index % trendBases.length];
  const now = Date.now();
  return {
    ...base,
    id: `fanfic_trend_${now}_${index}`,
    source: 'trend',
    title: `${keyword} · 原创变奏`,
    hook: `只提取「${keyword}」的通用类型特征，重新设计人物身份、世界规则、关键事件与完整情节。`,
    tags: [...new Set([keyword, ...base.tags])].slice(0, 6),
    trendKeywords: [keyword],
    categoryId: undefined,
    categoryLabel: undefined,
    subcategory: undefined,
    builtIn: false,
    createdAt: now + index,
    expiresAt: now + 24 * 60 * 60 * 1000
  };
}