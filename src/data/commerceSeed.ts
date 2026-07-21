import type { CharacterProfile, UserProfile } from '@/types/domain';
import type { ShopMoment, ShopProduct, ShopStorefront, WalletAccount, WalletTransaction } from '@/types/commerce';

const seedTime = new Date('2026-07-20T10:00:00+08:00').getTime();

export const defaultShopStorefronts: ShopStorefront[] = [
  { id: 'shop_mood_table', name: 'Mood Table', category: 'lifestyle', tagline: 'slow objects for soft days', description: '餐桌、织物与安静生活小物。', mark: '☁️', palette: ['#f4e8e6', '#d8e6df'], rating: 4.9, monthlySales: 3268, ownerType: 'system', createdAt: seedTime, updatedAt: seedTime },
  { id: 'shop_bloom_letter', name: 'Bloom Letter', category: 'gift', tagline: 'flowers with a tiny letter', description: '花束、纪念日礼盒与手写卡片。', mark: '💐', palette: ['#f3d9df', '#f6eee4'], rating: 4.9, monthlySales: 1886, ownerType: 'system', createdAt: seedTime, updatedAt: seedTime },
  { id: 'shop_seoul_bowl', name: 'Seoul Bowl', category: 'takeout', tagline: 'warm bowls, late nights', description: '热饭、汤面和适合深夜的温暖食物。', mark: '🍲', palette: ['#ead6c8', '#f5e8d9'], rating: 4.8, monthlySales: 6892, ownerType: 'system', createdAt: seedTime, updatedAt: seedTime },
  { id: 'shop_mono_archive', name: 'Mono Archive', category: 'fashion', tagline: 'daily silhouettes', description: '低饱和日常穿搭与小众配饰。', mark: '🧺', palette: ['#deddd8', '#ece6df'], rating: 4.8, monthlySales: 2417, ownerType: 'system', createdAt: seedTime, updatedAt: seedTime },
  { id: 'shop_paper_room', name: 'Paper Room', category: 'lifestyle', tagline: 'notes, books, quiet time', description: '纸品、书籍与桌面收纳。', mark: '📚', palette: ['#e7dfd1', '#dce6e3'], rating: 4.9, monthlySales: 1539, ownerType: 'system', createdAt: seedTime, updatedAt: seedTime },
  { id: 'shop_link_studio', name: 'LINK Studio', category: 'digital', tagline: 'made for your little world', description: '主题、头像框和数字纪念品。', mark: '✨', palette: ['#ddd8ee', '#f1e4ea'], rating: 5, monthlySales: 4721, ownerType: 'system', createdAt: seedTime, updatedAt: seedTime }
];

export const defaultShopProducts: ShopProduct[] = [
  { id: 'product_cloud_mug', storeId: 'shop_mood_table', category: 'lifestyle', kind: 'shopping', title: '云朵奶白马克杯', subtitle: '手作感釉面 · 320ml', priceCents: 5900, originalPriceCents: 6900, mark: '☕', palette: ['#eee7df', '#d9e5df'], tags: ['ins风', '日常'], stock: 86, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_linen_set', storeId: 'shop_mood_table', category: 'lifestyle', kind: 'shopping', title: '燕麦色床品四件套', subtitle: '柔软水洗棉 · 低饱和', priceCents: 26900, mark: '🛏️', palette: ['#e5ddd2', '#f3eee7'], tags: ['家居', '治愈'], stock: 24, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_anniversary_bouquet', storeId: 'shop_bloom_letter', category: 'gift', kind: 'gift', title: '纪念日雾粉花束', subtitle: '附专属卡片与丝带包装', priceCents: 19900, originalPriceCents: 22900, mark: '🌷', palette: ['#efd4dc', '#f7ebe7'], tags: ['纪念日', '送礼'], stock: 32, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_birthday_box', storeId: 'shop_bloom_letter', category: 'gift', kind: 'gift', title: 'Birthday Tiny Box', subtitle: '香薰、照片夹与祝福卡', priceCents: 16800, mark: '🎁', palette: ['#e8dcea', '#f4e7df'], tags: ['生日', '礼盒'], stock: 48, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_beef_bowl', storeId: 'shop_seoul_bowl', category: 'takeout', kind: 'takeout', title: '温泉蛋牛肉拌饭', subtitle: '牛肉双份 · 海苔碎 · 泡菜', priceCents: 4280, mark: '🍛', palette: ['#e6cdbd', '#f5e5d5'], tags: ['热销', '外卖'], stock: 999, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_rice_cake', storeId: 'shop_seoul_bowl', category: 'takeout', kind: 'takeout', title: '芝士辣炒年糕', subtitle: '微辣 · 鱼饼 · 溏心蛋', priceCents: 3380, mark: '🍢', palette: ['#edc5bc', '#f2ddd1'], tags: ['韩式', '夜宵'], stock: 999, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_cardigan', storeId: 'shop_mono_archive', category: 'fashion', kind: 'shopping', title: '奶灰薄针织开衫', subtitle: '宽松落肩 · 春秋叠穿', priceCents: 18900, mark: '🧶', palette: ['#d9d7d1', '#eee8e1'], tags: ['穿搭', '低饱和'], stock: 41, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_canvas_bag', storeId: 'shop_mono_archive', category: 'fashion', kind: 'shopping', title: 'Daily Canvas Bag', subtitle: '米杏色 · 内置小口袋', priceCents: 9900, mark: '👜', palette: ['#e7ddcf', '#d7dfdc'], tags: ['通勤', '百搭'], stock: 59, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_memory_book', storeId: 'shop_paper_room', category: 'gift', kind: 'gift', title: '两个人的回忆手账', subtitle: '纪念日页 · 照片位 · 约定清单', priceCents: 7900, mark: '📔', palette: ['#e8dfd2', '#d8e4df'], tags: ['情侣', '愿望单'], stock: 75, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_book_light', storeId: 'shop_paper_room', category: 'lifestyle', kind: 'shopping', title: '奶油夹页阅读灯', subtitle: '三档暖光 · USB-C', priceCents: 6200, mark: '💡', palette: ['#efe1c9', '#e8e7df'], tags: ['阅读', '桌面'], stock: 63, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_profile_theme', storeId: 'shop_link_studio', category: 'digital', kind: 'digital', title: 'Soft Archive 主页主题', subtitle: '韩系拼贴 · 奶油灰粉', priceCents: 1800, mark: '🪞', palette: ['#e4dce8', '#f1e3e5'], tags: ['数字商品', '主题'], stock: 9999, createdAt: seedTime, updatedAt: seedTime },
  { id: 'product_memory_frame', storeId: 'shop_link_studio', category: 'digital', kind: 'digital', title: 'Together 纪念头像框', subtitle: '双人限定 · 低调动态微光', priceCents: 1200, mark: '🫧', palette: ['#d8e4e3', '#eadde5'], tags: ['头像框', '纪念'], stock: 9999, createdAt: seedTime, updatedAt: seedTime }
];

function stableNumber(value: string) {
  return [...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
}

export function createDefaultWalletAccounts(users: UserProfile[], characters: CharacterProfile[]): WalletAccount[] {
  const userAccounts = users.map((user) => ({
    id: `wallet_user_${user.id}`,
    ownerType: 'user' as const,
    ownerId: user.id,
    balanceCents: 528020,
    monthlyIncomeCents: 0,
    savingsGoalCents: 1200000,
    giftAllowanceCents: 0,
    spendingTraits: ['日常消费', '共同购物'],
    updatedAt: seedTime
  }));
  const characterAccounts = characters.map((character) => {
    const seed = stableNumber(character.id);
    return {
      id: `wallet_character_${character.id}`,
      ownerType: 'character' as const,
      ownerId: character.id,
      balanceCents: 800000 + seed % 2200000,
      monthlyIncomeCents: 650000 + seed % 1800000,
      savingsGoalCents: 3000000 + seed % 9000000,
      giftAllowanceCents: 120000 + seed % 480000,
      spendingTraits: [['会为喜欢的东西果断付款', '偏爱有纪念意义的礼物', '平时克制，偶尔冲动消费'][seed % 3], ['注重质感', '习惯货比三家', '愿意为体验买单'][seed % 3]],
      updatedAt: seedTime
    };
  });
  return [...userAccounts, ...characterAccounts];
}

export function createDefaultWalletTransactions(accounts: WalletAccount[]): WalletTransaction[] {
  return accounts.map((account, index) => ({
    id: `wallet_opening_${account.id}`,
    walletId: account.id,
    type: 'opening',
    amountCents: account.balanceCents,
    title: account.ownerType === 'user' ? 'Wallet 初始余额' : '本月可用资金',
    subtitle: account.ownerType === 'user' ? '用于商城中的个人消费' : '角色独立经济账户',
    createdAt: seedTime - index * 60_000
  }));
}

export function createCharacterStorefronts(characters: CharacterProfile[]): ShopStorefront[] {
  const categories: ShopStorefront['category'][] = ['takeout', 'gift', 'lifestyle', 'fashion', 'digital'];
  const shopTypes = [
    { suffix: 'Coffee Room', tagline: 'coffee, bread and slow afternoons', description: '角色经营的咖啡与烘焙小店。', mark: '🥐', palette: ['#e7d6c6', '#f4e7dc'] as [string, string] },
    { suffix: 'Flower Note', tagline: 'a flower for every small day', description: '角色亲自挑选花材与礼物卡片。', mark: '🌼', palette: ['#ead8df', '#f3e8dc'] as [string, string] },
    { suffix: 'Book Corner', tagline: 'books chosen with a reason', description: '角色收藏的书、纸品与阅读清单。', mark: '📖', palette: ['#ddd9cc', '#dce5df'] as [string, string] },
    { suffix: 'Daily Closet', tagline: 'wearable everyday moods', description: '角色审美里的日常服装与配饰。', mark: '🧥', palette: ['#dbd9d5', '#ede5df'] as [string, string] },
    { suffix: 'Tiny Studio', tagline: 'small digital things, made personally', description: '角色制作的主题、声音与数字纪念品。', mark: '🎧', palette: ['#ded9ea', '#eedfe6'] as [string, string] }
  ];
  return characters.map((character, index) => {
    const type = shopTypes[index % shopTypes.length];
    return {
      id: `shop_character_${character.id}`,
      name: `${character.nickname || character.name}’s ${type.suffix}`,
      category: categories[index % categories.length],
      tagline: type.tagline,
      description: type.description,
      mark: type.mark,
      palette: type.palette,
      rating: 4.8 + index % 3 * 0.1,
      monthlySales: 218 + index * 97,
      ownerType: 'character',
      ownerCharacterId: character.id,
      createdAt: seedTime + index,
      updatedAt: seedTime + index
    };
  });
}

export function createCharacterProducts(characters: CharacterProfile[]): ShopProduct[] {
  const storefronts = createCharacterStorefronts(characters);
  const templates = [
    { title: '店主私藏咖啡组合', subtitle: '手冲豆 · 小面包 · 今日卡片', mark: '🥯', category: 'takeout' as const, kind: 'takeout' as const },
    { title: '亲手搭配的小花束', subtitle: '当日花材 · 店主手写卡片', mark: '🌿', category: 'gift' as const, kind: 'gift' as const },
    { title: '店主本月书单礼盒', subtitle: '一本书 · 书签 · 阅读便笺', mark: '📚', category: 'lifestyle' as const, kind: 'gift' as const },
    { title: '店主同款日常单品', subtitle: '低饱和 · 舒适剪裁', mark: '🧢', category: 'fashion' as const, kind: 'shopping' as const },
    { title: '专属语音纪念卡', subtitle: '角色店铺限定数字收藏', mark: '🎙️', category: 'digital' as const, kind: 'digital' as const }
  ];
  return characters.map((character, index) => {
    const template = templates[index % templates.length];
    const storefront = storefronts[index];
    return {
      id: `product_character_${character.id}`,
      storeId: `shop_character_${character.id}`,
      category: storefront.category,
      kind: template.kind,
      title: template.title,
      subtitle: template.subtitle,
      priceCents: 4800 + index * 1700,
      mark: template.mark,
      palette: storefront.palette,
      tags: ['角色店铺', character.nickname || character.name],
      stock: 99,
      createdAt: seedTime + index,
      updatedAt: seedTime + index
    };
  });
}

export function createDefaultShopMoments(characters: CharacterProfile[]): ShopMoment[] {
  return characters.slice(0, 3).map((character, index) => ({
    id: `shop_moment_seed_${character.id}`,
    characterId: character.id,
    characterName: character.nickname || character.name,
    kind: ['purchase', 'review', 'favorite'][index] as NonNullable<ShopMoment['kind']>,
    content: ['路过时买下来的，实物比照片更安静一点。', '包装拆到一半才想起来拍照，今天的心情很适合它。', '放进收藏夹很久，最后还是带回来了。'][index],
    productIds: [defaultShopProducts[index * 2]?.id].filter(Boolean),
    storeName: defaultShopStorefronts[index]?.name ?? 'LINK Shop',
    rating: 5,
    likedByUserIds: [],
    savedByUserIds: [],
    commentCount: index + 1,
    mark: defaultShopProducts[index * 2]?.mark ?? '🛍️',
    palette: defaultShopProducts[index * 2]?.palette ?? ['#e8e0dc', '#dce5df'],
    createdAt: seedTime - index * 7_200_000
  }));
}