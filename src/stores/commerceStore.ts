import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { deleteEntity, loadCommerceSnapshot, putEntity } from '@/data/db';
import { createCharacterProducts, createCharacterStorefronts, createDefaultShopMoments, createDefaultWalletAccounts, createDefaultWalletTransactions, defaultShopProducts, defaultShopStorefronts } from '@/data/commerceSeed';
import { chooseCharacterCommerceProduct, generateCharacterCommerceCatalog, generateCommerceProductImage } from '@/services/commerce';
import type { AppSettings, CharacterProfile, UserProfile } from '@/types/domain';
import type { ChatCommerceAttachment, CommerceSnapshot, ShopCartItem, ShopMoment, ShopOrder, ShopProduct, ShopStorefront, ShopWishlistItem, WalletAccount, WalletTransaction } from '@/types/commerce';
import { createId } from '@/utils/id';
import { externalizeLargeMediaRefs, hydrateStoredMediaRefs } from '@/utils/mediaStorage';

function centsFromAmount(amount: string) {
  const value = Number(String(amount).replace(/[￥¥,\s]/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : 0;
}

function parseItemPrice(price: string | undefined, totalCents: number, quantityTotal: number) {
  const cents = centsFromAmount(price ?? '');
  return cents > 0 ? cents : Math.max(0, Math.round(totalCents / Math.max(1, quantityTotal)));
}

export const useCommerceStore = defineStore('commerce', () => {
  const ready = ref(false);
  let hydratePromise: Promise<void> | null = null;
  const walletAccounts = ref<WalletAccount[]>([]);
  const walletTransactions = ref<WalletTransaction[]>([]);
  const storefronts = ref<ShopStorefront[]>([]);
  const products = ref<ShopProduct[]>([]);
  const cartItems = ref<ShopCartItem[]>([]);
  const wishlistItems = ref<ShopWishlistItem[]>([]);
  const orders = ref<ShopOrder[]>([]);
  const moments = ref<ShopMoment[]>([]);

  const featuredProducts = computed(() => products.value.filter((product) => product.stock > 0));
  const characterStorefronts = computed(() => storefronts.value.filter((storefront) => storefront.ownerType === 'character'));
  const recentOrders = computed(() => [...orders.value].sort((left, right) => right.createdAt - left.createdAt));
  const recentMoments = computed(() => [...moments.value].sort((left, right) => right.createdAt - left.createdAt));

  function applySnapshot(snapshot: CommerceSnapshot) {
    walletAccounts.value = snapshot.walletAccounts;
    walletTransactions.value = snapshot.walletTransactions;
    storefronts.value = snapshot.shopStorefronts;
    products.value = snapshot.shopProducts;
    cartItems.value = snapshot.shopCartItems;
    wishlistItems.value = snapshot.shopWishlistItems;
    orders.value = snapshot.shopOrders;
    moments.value = snapshot.shopMoments;
  }

  async function ensureSeedData(users: UserProfile[], characters: CharacterProfile[]) {
    const seedAccounts = createDefaultWalletAccounts(users, characters);
    const missingAccounts = seedAccounts.filter((account) => !walletAccounts.value.some((entry) => entry.id === account.id));
    if (missingAccounts.length) {
      walletAccounts.value.push(...missingAccounts);
      const openingEntries = createDefaultWalletTransactions(missingAccounts);
      walletTransactions.value.push(...openingEntries);
      await Promise.all([
        ...missingAccounts.map((account) => putEntity('walletAccounts', account)),
        ...openingEntries.map((entry) => putEntity('walletTransactions', entry))
      ]);
    }

    const allStorefronts = [...defaultShopStorefronts, ...createCharacterStorefronts(characters)];
    const missingStorefronts = allStorefronts.filter((storefront) => !storefronts.value.some((entry) => entry.id === storefront.id));
    if (missingStorefronts.length) {
      storefronts.value.push(...missingStorefronts);
      await Promise.all(missingStorefronts.map((storefront) => putEntity('shopStorefronts', storefront)));
    }

    const allProducts = [...defaultShopProducts, ...createCharacterProducts(characters)];
    const missingProducts = allProducts.filter((product) => !products.value.some((entry) => entry.id === product.id));
    const refreshedCharacterProducts = allProducts.flatMap((product) => {
      if (!product.id.startsWith('product_character_')) return [];
      const existing = products.value.find((entry) => entry.id === product.id);
      if (!existing || existing.storeId === product.storeId && existing.category === product.category && existing.kind === product.kind && existing.palette[0] === product.palette[0] && existing.palette[1] === product.palette[1]) return [];
      return [{ ...existing, storeId: product.storeId, category: product.category, kind: product.kind, palette: product.palette, updatedAt: Date.now() }];
    });
    if (missingProducts.length || refreshedCharacterProducts.length) {
      products.value.push(...missingProducts);
      for (const product of refreshedCharacterProducts) {
        const index = products.value.findIndex((entry) => entry.id === product.id);
        if (index >= 0) products.value[index] = product;
      }
      await Promise.all([...missingProducts, ...refreshedCharacterProducts].map((product) => putEntity('shopProducts', product)));
    }

    if (characters.length) {
      const seedMoments = createDefaultShopMoments(characters);
      const missingMoments = seedMoments.filter((moment) => !moments.value.some((entry) => entry.id === moment.id));
      const refreshedMoments = seedMoments.flatMap((moment) => {
        const existing = moments.value.find((entry) => entry.id === moment.id);
        if (!existing || existing.kind && existing.likedByUserIds && existing.savedByUserIds && typeof existing.commentCount === 'number') return [];
        return [{
          ...existing,
          kind: existing.kind ?? moment.kind,
          likedByUserIds: existing.likedByUserIds ?? [],
          savedByUserIds: existing.savedByUserIds ?? [],
          commentCount: existing.commentCount ?? moment.commentCount
        }];
      });
      moments.value.push(...missingMoments);
      for (const moment of refreshedMoments) {
        const index = moments.value.findIndex((entry) => entry.id === moment.id);
        if (index >= 0) moments.value[index] = moment;
      }
      await Promise.all([...missingMoments, ...refreshedMoments].map((moment) => putEntity('shopMoments', moment)));
    }
  }

  async function ensureReady(users: UserProfile[] = [], characters: CharacterProfile[] = []) {
    if (ready.value) {
      await ensureSeedData(users, characters);
      await refreshOrderStatuses();
      return;
    }
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      applySnapshot(await hydrateStoredMediaRefs(await loadCommerceSnapshot()));
      await ensureSeedData(users, characters);
      await refreshOrderStatuses();
      ready.value = true;
    })().finally(() => {
      hydratePromise = null;
    });
    return hydratePromise;
  }

  function walletForUser(userId: string) {
    return walletAccounts.value.find((account) => account.ownerType === 'user' && account.ownerId === userId) ?? null;
  }

  function walletForCharacter(characterId: string) {
    return walletAccounts.value.find((account) => account.ownerType === 'character' && account.ownerId === characterId) ?? null;
  }

  function transactionsForWallet(walletId: string) {
    return walletTransactions.value.filter((entry) => entry.walletId === walletId).sort((left, right) => right.createdAt - left.createdAt);
  }

  function cartForUser(userId: string) {
    return cartItems.value.filter((item) => item.userId === userId);
  }

  function wishlistForUser(userId: string) {
    return wishlistItems.value.filter((item) => item.userId === userId);
  }

  async function addToCart(userId: string, productId: string, characterId = '', note = '') {
    const existing = cartItems.value.find((item) => item.userId === userId && item.productId === productId);
    const now = Date.now();
    const item: ShopCartItem = existing
      ? { ...existing, quantity: existing.quantity + 1, selected: true, ...(note ? { note } : {}), updatedAt: now }
      : {
          id: createId('cart'),
          userId,
          productId,
          quantity: 1,
          selected: true,
          addedBy: characterId ? 'character' : 'user',
          ...(characterId ? { characterId } : {}),
          ...(note ? { note } : {}),
          createdAt: now,
          updatedAt: now
        };
    if (existing) cartItems.value[cartItems.value.indexOf(existing)] = item;
    else cartItems.value.push(item);
    await putEntity('shopCartItems', item);
    return item;
  }

  async function addCharacterPickToCart(userId: string, character: CharacterProfile, user: UserProfile | null, settings: AppSettings) {
    const existingProductIds = new Set(cartForUser(userId).map((item) => item.productId));
    const availableProducts = featuredProducts.value.filter((product) => !existingProductIds.has(product.id));
    if (!availableProducts.length) return null;
    const decision = await chooseCharacterCommerceProduct({ character, user, products: availableProducts, settings });
    const product = availableProducts.find((entry) => entry.id === decision.productId);
    if (!product) throw new Error('角色选择的商品已经不可购买，请再试一次。');
    await addToCart(userId, product.id, character.id, decision.reason);
    return { product, reason: decision.reason };
  }

  async function updateCartQuantity(itemId: string, quantity: number) {
    const item = cartItems.value.find((entry) => entry.id === itemId);
    if (!item) return;
    if (quantity <= 0) {
      cartItems.value = cartItems.value.filter((entry) => entry.id !== itemId);
      await deleteEntity('shopCartItems', itemId);
      return;
    }
    const nextItem = { ...item, quantity: Math.min(99, Math.max(1, Math.floor(quantity))), updatedAt: Date.now() };
    cartItems.value[cartItems.value.indexOf(item)] = nextItem;
    await putEntity('shopCartItems', nextItem);
  }

  async function toggleWishlist(userId: string, productId: string, characterId = '') {
    const existing = wishlistItems.value.find((item) => item.userId === userId && item.productId === productId);
    if (existing) {
      wishlistItems.value = wishlistItems.value.filter((item) => item.id !== existing.id);
      await deleteEntity('shopWishlistItems', existing.id);
      return false;
    }
    const item: ShopWishlistItem = {
      id: createId('wish'),
      userId,
      productId,
      addedBy: characterId ? 'character' : 'user',
      ...(characterId ? { characterId } : {}),
      createdAt: Date.now()
    };
    wishlistItems.value.push(item);
    await putEntity('shopWishlistItems', item);
    return true;
  }

  async function toggleMomentLike(momentId: string, userId: string) {
    const moment = moments.value.find((entry) => entry.id === momentId);
    if (!moment || !userId) return false;
    const likedByUserIds = new Set(moment.likedByUserIds ?? []);
    if (likedByUserIds.has(userId)) likedByUserIds.delete(userId);
    else likedByUserIds.add(userId);
    const nextMoment = { ...moment, likedByUserIds: [...likedByUserIds] };
    moments.value[moments.value.indexOf(moment)] = nextMoment;
    await putEntity('shopMoments', nextMoment);
    return likedByUserIds.has(userId);
  }

  async function generateCharacterCatalog(character: CharacterProfile, user: UserProfile | null, settings: AppSettings) {
    const catalog = await generateCharacterCommerceCatalog({ character, user, settings });
    const now = Date.now();
    const storeId = `shop_character_${character.id}`;
    const existingStorefront = storefronts.value.find((entry) => entry.id === storeId);
    const storefront: ShopStorefront = {
      id: storeId,
      ...catalog.storefront,
      rating: existingStorefront?.rating ?? 4.9,
      monthlySales: existingStorefront?.monthlySales ?? 218,
      ownerType: 'character',
      ownerCharacterId: character.id,
      generatedAt: now,
      createdAt: existingStorefront?.createdAt ?? now,
      updatedAt: now
    };
    const nextProducts: ShopProduct[] = catalog.products.map((product, index) => ({
      id: `product_ai_${character.id}_${now}_${index}`,
      storeId,
      ...product,
      generatedAt: now,
      createdAt: now + index,
      updatedAt: now + index
    }));
    const selectedProduct = nextProducts[catalog.moment.productIndex] ?? nextProducts[0];
    const moment: ShopMoment = {
      id: createId('shop-moment-ai'),
      characterId: character.id,
      characterName: character.nickname || character.name,
      kind: catalog.moment.kind,
      content: catalog.moment.content,
      productIds: selectedProduct ? [selectedProduct.id] : [],
      storeName: storefront.name,
      rating: catalog.moment.rating,
      likedByUserIds: [],
      savedByUserIds: [],
      commentCount: 0,
      mark: selectedProduct?.mark ?? storefront.mark,
      palette: selectedProduct?.palette ?? storefront.palette,
      generatedAt: now,
      createdAt: now
    };
    const previousAiProducts = products.value.filter((product) => product.storeId === storeId && product.id.startsWith(`product_ai_${character.id}_`));
    const previousAiProductIds = new Set(previousAiProducts.map((product) => product.id));
    const removedCartItems = cartItems.value.filter((item) => previousAiProductIds.has(item.productId));
    const removedWishlistItems = wishlistItems.value.filter((item) => previousAiProductIds.has(item.productId));
    const existingWallet = walletForCharacter(character.id);
    const wallet: WalletAccount = {
      id: existingWallet?.id ?? `wallet_character_${character.id}`,
      ownerType: 'character',
      ownerId: character.id,
      balanceCents: existingWallet?.generatedAt ? existingWallet.balanceCents : catalog.economy.balanceCents,
      monthlyIncomeCents: catalog.economy.monthlyIncomeCents,
      savingsGoalCents: catalog.economy.savingsGoalCents,
      giftAllowanceCents: existingWallet?.generatedAt ? existingWallet.giftAllowanceCents : catalog.economy.giftAllowanceCents,
      spendingTraits: catalog.economy.spendingTraits,
      generatedAt: now,
      updatedAt: now
    };

    const storefrontIndex = storefronts.value.findIndex((entry) => entry.id === storeId);
    if (storefrontIndex >= 0) storefronts.value[storefrontIndex] = storefront;
    else storefronts.value.push(storefront);
    products.value = [...products.value.filter((product) => !previousAiProductIds.has(product.id)), ...nextProducts];
    cartItems.value = cartItems.value.filter((item) => !previousAiProductIds.has(item.productId));
    wishlistItems.value = wishlistItems.value.filter((item) => !previousAiProductIds.has(item.productId));
    moments.value.push(moment);
    const walletIndex = walletAccounts.value.findIndex((entry) => entry.id === wallet.id);
    if (walletIndex >= 0) walletAccounts.value[walletIndex] = wallet;
    else walletAccounts.value.push(wallet);

    await Promise.all([
      putEntity('shopStorefronts', storefront),
      putEntity('walletAccounts', wallet),
      ...nextProducts.map((product) => putEntity('shopProducts', product)),
      putEntity('shopMoments', moment),
      ...previousAiProducts.map((product) => deleteEntity('shopProducts', product.id)),
      ...removedCartItems.map((item) => deleteEntity('shopCartItems', item.id)),
      ...removedWishlistItems.map((item) => deleteEntity('shopWishlistItems', item.id))
    ]);
    return { storefront, products: nextProducts, moment, wallet };
  }

  async function generateProductImage(productId: string, settings: AppSettings) {
    const product = products.value.find((entry) => entry.id === productId);
    if (!product) throw new Error('没有找到需要生图的商品。');
    const result = await generateCommerceProductImage({
      settings,
      title: product.title,
      subtitle: product.subtitle,
      imageGenerationPrompt: product.imageGenerationPrompt
    });
    const persistedProduct = await externalizeLargeMediaRefs({
      ...product,
      imageUrl: result.imageUrl,
      imageProvider: result.provider,
      updatedAt: Date.now()
    }, 1);
    const displayProduct = await hydrateStoredMediaRefs(persistedProduct, true);
    const productIndex = products.value.findIndex((entry) => entry.id === productId);
    if (productIndex >= 0) products.value[productIndex] = displayProduct;
    await putEntity('shopProducts', persistedProduct);
    return { product: displayProduct, ...result };
  }

  async function toggleMomentSave(momentId: string, userId: string) {
    const moment = moments.value.find((entry) => entry.id === momentId);
    if (!moment || !userId) return false;
    const savedByUserIds = new Set(moment.savedByUserIds ?? []);
    if (savedByUserIds.has(userId)) savedByUserIds.delete(userId);
    else savedByUserIds.add(userId);
    const nextMoment = { ...moment, savedByUserIds: [...savedByUserIds] };
    moments.value[moments.value.indexOf(moment)] = nextMoment;
    await putEntity('shopMoments', nextMoment);
    return savedByUserIds.has(userId);
  }

  async function refreshOrderStatuses() {
    const now = Date.now();
    const updates = orders.value.flatMap((order) => {
      if (order.status === 'cancelled' || order.status === 'delivered') return [];
      const elapsedMinutes = (now - order.createdAt) / 60_000;
      const nextStatus = order.kind === 'takeout'
        ? elapsedMinutes >= 50
          ? 'delivered'
          : elapsedMinutes >= 15
            ? 'delivering'
            : 'preparing'
        : elapsedMinutes >= 3 * 24 * 60
          ? 'delivered'
          : order.status;
      if (nextStatus === order.status) return [];
      const nextOrder: ShopOrder = { ...order, status: nextStatus, updatedAt: now };
      orders.value[orders.value.indexOf(order)] = nextOrder;
      return [putEntity('shopOrders', nextOrder)];
    });
    await Promise.all(updates);
  }

  async function checkoutCart(userId: string, userName: string) {
    const selectedItems = cartForUser(userId).filter((item) => item.selected);
    if (!selectedItems.length) throw new Error('共享购物车里还没有选中的商品。');
    const selectedProducts = selectedItems.flatMap((item) => {
      const product = products.value.find((entry) => entry.id === item.productId);
      return product ? [{ item, product }] : [];
    });
    const totalCents = selectedProducts.reduce((sum, entry) => sum + entry.product.priceCents * entry.item.quantity, 0);
    const wallet = walletForUser(userId);
    if (!wallet || wallet.balanceCents < totalCents) throw new Error('Wallet 余额不足。');
    const now = Date.now();
    const order: ShopOrder = {
      id: createId('order'),
      userId,
      purchaserType: 'user',
      purchaserId: userId,
      purchaserName: userName,
      storeName: '共享购物车',
      kind: 'shopping',
      status: 'paid',
      items: selectedProducts.map(({ item, product }) => ({ productId: product.id, title: product.title, quantity: item.quantity, unitPriceCents: product.priceCents, mark: product.mark })),
      totalCents,
      note: '共同挑选的生活小物',
      createdAt: now,
      updatedAt: now
    };
    const nextWallet = { ...wallet, balanceCents: wallet.balanceCents - totalCents, updatedAt: now };
    const transaction: WalletTransaction = {
      id: createId('wallet-tx'),
      walletId: wallet.id,
      type: 'purchase',
      amountCents: -totalCents,
      title: '共享购物车结算',
      subtitle: `${selectedProducts.length} 件商品`,
      relatedOrderId: order.id,
      createdAt: now
    };
    walletAccounts.value[walletAccounts.value.indexOf(wallet)] = nextWallet;
    walletTransactions.value.push(transaction);
    orders.value.push(order);
    cartItems.value = cartItems.value.filter((item) => !selectedItems.some((selected) => selected.id === item.id));
    await Promise.all([
      putEntity('walletAccounts', nextWallet),
      putEntity('walletTransactions', transaction),
      putEntity('shopOrders', order),
      ...selectedItems.map((item) => deleteEntity('shopCartItems', item.id))
    ]);
    return order;
  }

  async function recordChatPurchase(input: {
    attachment: ChatCommerceAttachment;
    userId: string;
    characterId: string;
    characterName: string;
    conversationId: string;
    sourceMessageId: string;
  }) {
    if (orders.value.some((order) => order.id === input.attachment.orderId)) return;
    const totalCents = centsFromAmount(input.attachment.totalAmount);
    const quantityTotal = input.attachment.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
    const now = Date.now();
    const order: ShopOrder = {
      id: input.attachment.orderId,
      userId: input.userId,
      purchaserType: 'character',
      purchaserId: input.characterId,
      purchaserName: input.characterName,
      storeName: input.attachment.storeName,
      kind: input.attachment.kind,
      status: input.attachment.status,
      items: input.attachment.items.map((item) => ({
        title: item.name,
        quantity: Math.max(1, item.quantity),
        unitPriceCents: parseItemPrice(item.price, totalCents, quantityTotal),
        mark: input.attachment.kind === 'takeout' ? '🥡' : input.attachment.kind === 'gift' ? '🎁' : '🛍️'
      })),
      totalCents,
      eta: input.attachment.eta,
      note: input.attachment.note,
      cardMessage: input.attachment.cardMessage,
      conversationId: input.conversationId,
      sourceMessageId: input.sourceMessageId,
      createdAt: now,
      updatedAt: now
    };
    orders.value.push(order);
    const wallet = walletForCharacter(input.characterId);
    const writes: Array<Promise<unknown>> = [putEntity('shopOrders', order)];
    if (wallet && totalCents > 0) {
      const nextWallet = {
        ...wallet,
        balanceCents: Math.max(0, wallet.balanceCents - totalCents),
        giftAllowanceCents: input.attachment.kind === 'gift' ? Math.max(0, wallet.giftAllowanceCents - totalCents) : wallet.giftAllowanceCents,
        updatedAt: now
      };
      const transaction: WalletTransaction = {
        id: createId('wallet-tx'),
        walletId: wallet.id,
        type: input.attachment.kind === 'gift' ? 'gift' : 'purchase',
        amountCents: -totalCents,
        title: input.attachment.kind === 'takeout' ? `给你点了 ${input.attachment.storeName}` : input.attachment.kind === 'gift' ? '送给你的礼物' : `在 ${input.attachment.storeName} 下单`,
        subtitle: input.attachment.items.map((item) => item.name).join('、'),
        relatedOrderId: order.id,
        createdAt: now
      };
      walletAccounts.value[walletAccounts.value.indexOf(wallet)] = nextWallet;
      walletTransactions.value.push(transaction);
      writes.push(putEntity('walletAccounts', nextWallet), putEntity('walletTransactions', transaction));
    }
    const moment: ShopMoment = {
      id: createId('shop-moment'),
      characterId: input.characterId,
      characterName: input.characterName,
      kind: 'purchase',
      orderId: order.id,
      content: input.attachment.kind === 'gift'
        ? input.attachment.cardMessage || `挑了很久，最后觉得这个最适合你。`
        : input.attachment.kind === 'takeout'
          ? `刚下单的，店家说会好好打包。`
          : `买到的时候第一反应是想给你看。`,
      productIds: [],
      storeName: input.attachment.storeName,
      rating: 5,
      likedByUserIds: [],
      savedByUserIds: [],
      commentCount: 0,
      mark: input.attachment.kind === 'takeout' ? '🥡' : input.attachment.kind === 'gift' ? '🎁' : '🛍️',
      palette: input.attachment.kind === 'takeout' ? ['#ead7c7', '#f5e8dc'] : input.attachment.kind === 'gift' ? ['#ecd8df', '#f5e9e2'] : ['#e3dfd7', '#dce5df'],
      createdAt: now
    };
    moments.value.push(moment);
    writes.push(putEntity('shopMoments', moment));
    await Promise.all(writes);
  }

  return {
    ready,
    walletAccounts,
    walletTransactions,
    storefronts,
    products,
    cartItems,
    wishlistItems,
    orders,
    moments,
    featuredProducts,
    characterStorefronts,
    recentOrders,
    recentMoments,
    ensureReady,
    walletForUser,
    walletForCharacter,
    transactionsForWallet,
    cartForUser,
    wishlistForUser,
    addToCart,
    addCharacterPickToCart,
    updateCartQuantity,
    toggleWishlist,
    toggleMomentLike,
    toggleMomentSave,
    generateCharacterCatalog,
    generateProductImage,
    checkoutCart,
    recordChatPurchase
  };
});