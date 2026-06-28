import type { CharacterProfile, UserProfile, UserVisualProfile, VisualProfile } from '@/types/domain';
import momoAvatar from '@/assets/profile/momo-avatar.png';
import momoHighlightCafe from '@/assets/profile/momo-highlight-cafe.png';
import momoHighlightLook from '@/assets/profile/momo-highlight-look.png';
import momoHighlightDiary from '@/assets/profile/momo-highlight-diary.png';
import momoBackground from '@/assets/profile/momo-background.jpg';
import momoMomentToday from '@/assets/profile/momo-moment-today.png';
import momoMomentOotd from '@/assets/profile/momo-moment-ootd.png';
import momoMomentRoom from '@/assets/profile/momo-moment-room.png';
import momoMomentCafe from '@/assets/profile/momo-moment-cafe.png';
import momoMomentNight from '@/assets/profile/momo-moment-night.png';
import momoMomentNote from '@/assets/profile/momo-moment-note.png';
import momoMomentPost from '@/assets/profile/momo-moment-post.png';
import momoMomentCrush from '@/assets/profile/momo-moment-crush.png';
import momoMomentPov from '@/assets/profile/momo-moment-POV.png';

export const profileAccentOptions = ['#f49ab5', '#b6d7a8', '#f7d66d', '#9bb8d9', '#b9a4cf', '#e6e6e6'];

type VisualProfileOwner = Partial<Pick<UserProfile, 'id' | 'nickname' | 'name' | 'avatar' | 'signature'>>;
type UserVisualProfileOwner = VisualProfileOwner & Partial<Pick<VisualProfile, 'handle'>>;

const legacySeanAvatar = 'https://api.dicebear.com/9.x/thumbs/svg?seed=Sean&backgroundColor=06c755';
const legacyMomoAvatar = 'https://api.dicebear.com/9.x/thumbs/svg?seed=momo&backgroundColor=f2f2f2';
const legacyMomoGreenAvatar = 'https://api.dicebear.com/9.x/thumbs/svg?seed=momo&backgroundColor=06c755';
const legacyNewUserAvatar = 'https://api.dicebear.com/9.x/thumbs/svg?seed=NewUser&backgroundColor=f2f2f2';
const legacySvgAvatar = '/src/assets/profile/momo-avatar.svg';
const legacySvgBackground = '/src/assets/profile/momo-background.svg';
const legacyPhotoBackground = 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?auto=format&fit=crop&w=1200&q=80';
const legacyMomentToday = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=500&q=80';
const legacySvgMomentToday = '/src/assets/profile/momo-moment-today.svg';
export const defaultProfileAvatar = momoAvatar;
const fallbackAvatar = defaultProfileAvatar;
const fallbackBackground = momoBackground;
const legacyProfileBio = 'link to your excutive character';
const defaultProfileBio = 'link with your exclusive Char';
const legacyDefaultStats = {
  posts: 128,
  postsLabel: 'Posts',
  followers: '8.6k',
  followersLabel: 'Followers',
  following: 216,
  followingLabel: 'Following'
};

const defaultHighlightImages = new Map([
  ['profile_highlight_cafe', momoHighlightCafe],
  ['profile_highlight_look', momoHighlightLook],
  ['profile_highlight_diary', momoHighlightDiary]
]);

const defaultMomentImages = new Map([
  ['profile_moment_today', momoMomentToday],
  ['profile_moment_ootd', momoMomentOotd],
  ['profile_moment_room', momoMomentRoom],
  ['profile_moment_cafe', momoMomentCafe],
  ['profile_moment_night', momoMomentNight],
  ['profile_moment_note', momoMomentNote],
  ['profile_moment_post', momoMomentPost],
  ['profile_moment_crush', momoMomentCrush],
  ['profile_moment_pov', momoMomentPov]
]);

function cloneProfile(profile: VisualProfile): VisualProfile {
  return {
    ...profile,
    stats: { ...profile.stats },
    tags: [...profile.tags],
    chips: [...profile.chips],
    links: profile.links.map((link) => ({ ...link })),
    highlights: profile.highlights.map((highlight) => ({ ...highlight })),
    moments: profile.moments.map((moment) => ({ ...moment }))
  };
}

function normalizeStats(stats: Partial<VisualProfile['stats']> | undefined, fallbackStats: VisualProfile['stats']): VisualProfile['stats'] {
  if (!stats) return { ...fallbackStats };

  const mergedStats = { ...fallbackStats, ...stats };
  const isLegacyStats =
    mergedStats.posts === legacyDefaultStats.posts &&
    mergedStats.postsLabel === legacyDefaultStats.postsLabel &&
    mergedStats.followers === legacyDefaultStats.followers &&
    mergedStats.followersLabel === legacyDefaultStats.followersLabel &&
    mergedStats.following === legacyDefaultStats.following &&
    mergedStats.followingLabel === legacyDefaultStats.followingLabel;

  return isLegacyStats ? { ...fallbackStats } : mergedStats;
}

function isBundledProfileImage(image: string, assetName: string) {
  return !image || image.includes(`src/assets/profile/${assetName}.svg`) || image.includes(`src/assets/profile/${assetName}.png`);
}

function normalizeProfileAvatar(avatar: string | undefined) {
  const trimmed = avatar?.trim() ?? '';
  return ['', legacySeanAvatar, legacyMomoAvatar, legacyMomoGreenAvatar, legacyNewUserAvatar, legacySvgAvatar].includes(trimmed)
    || isBundledProfileImage(trimmed, 'momo-avatar')
    ? fallbackAvatar
    : trimmed;
}

function withPngProfileAssets(profile: VisualProfile): VisualProfile {
  const fallback = createVisualProfile();
  const momentsById = new Map(profile.moments.map((moment) => [moment.id, moment]));

  return {
    ...profile,
    avatar: normalizeProfileAvatar(profile.avatar),
    backgroundImage: profile.backgroundImage === legacyPhotoBackground || profile.backgroundImage === legacySvgBackground || profile.backgroundImage === momoMomentPost || isBundledProfileImage(profile.backgroundImage, 'momo-background') ? fallbackBackground : profile.backgroundImage,
    highlights: profile.highlights.map((highlight) => {
      const image = defaultHighlightImages.get(highlight.id);
      const assetName = highlight.id.replace('profile_highlight_', 'momo-highlight-');
      return image && isBundledProfileImage(highlight.image, assetName) ? { ...highlight, image } : highlight;
    }),
    moments: fallback.moments.map((fallbackMoment) => {
      const moment = momentsById.get(fallbackMoment.id) ?? fallbackMoment;
      const image = defaultMomentImages.get(moment.id);
      const assetName = moment.id.replace('profile_moment_', 'momo-moment-');
      const shouldUseDefaultImage = image && (isBundledProfileImage(moment.image, assetName) || moment.image === legacyMomentToday || moment.image === legacySvgMomentToday);
      return shouldUseDefaultImage ? { ...moment, image } : moment;
    })
  };
}

export function createVisualProfile(user?: VisualProfileOwner): VisualProfile {
  return {
    nickname: user?.nickname || user?.name || 'Linker',
    handle: 'linker.app',
    avatar: user?.avatar || fallbackAvatar,
    bio: user?.signature || defaultProfileBio,
    backgroundImage: fallbackBackground,
    location: 'Seoul / Shanghai',
    mood: 'private signal',
    archiveLabel: 'Daily Archive',
    editLabel: '编辑',
    editorTitle: '编辑个人资料',
    messageLabel: 'message',
    momentsLabel: 'Moments',
    accentColor: '#f49ab5',
    textColor: '#f5f3f1',
    avatarBorderColor: '#090c0f',
    stats: {
      posts: 520,
      postsLabel: 'Posts',
      followers: '1.3k',
      followersLabel: 'Followers',
      following: 1400,
      followingLabel: 'Following'
    },
    tags: ['daily', 'film', 'cafe'],
    chips: ['private link', 'exclusive char', 'signal room'],
    links: [
      { id: 'profile_link_main', label: 'link.app/linker', url: '' }
    ],
    highlights: [
      { id: 'profile_highlight_cafe', title: 'cafe', image: momoHighlightCafe },
      { id: 'profile_highlight_look', title: 'look', image: momoHighlightLook },
      { id: 'profile_highlight_diary', title: 'diary', image: momoHighlightDiary }
    ],
    moments: [
      { id: 'profile_moment_today', title: 'today', image: momoMomentToday },
      { id: 'profile_moment_ootd', title: 'ootd', image: momoMomentOotd },
      { id: 'profile_moment_room', title: 'room', image: momoMomentRoom },
      { id: 'profile_moment_cafe', title: 'cafe', image: momoMomentCafe },
      { id: 'profile_moment_night', title: 'night', image: momoMomentNight },
      { id: 'profile_moment_note', title: 'note', image: momoMomentNote },
      { id: 'profile_moment_post', title: 'post', image: momoMomentPost },
      { id: 'profile_moment_crush', title: 'crush', image: momoMomentCrush },
      { id: 'profile_moment_pov', title: 'POV', image: momoMomentPov }
    ]
  };
}

function removeVisualProfileAvatar(profile: Partial<VisualProfile> | undefined) {
  if (!profile) return undefined;
  const { avatar, ...profileWithoutAvatar } = profile;
  return profileWithoutAvatar;
}

export function toUserVisualProfile(profile: VisualProfile): UserVisualProfile {
  const { avatar, ...profileWithoutAvatar } = profile;
  return profileWithoutAvatar;
}

export function createUserVisualProfile(user?: UserVisualProfileOwner): UserVisualProfile {
  const profile = createVisualProfile(user);
  return toUserVisualProfile({
    ...profile,
    handle: user?.handle || profile.handle
  });
}

function isLegacyDefaultUser(user: UserProfile) {
  return (
    user.id === '1008600001' &&
    user.name === 'Sean' &&
    (!user.nickname || user.nickname === 'Sean') &&
    user.avatar === legacySeanAvatar &&
    user.description === 'Im sean :-) I love my life'
  );
}

function isLegacyDefaultVisualProfile(profile: Partial<VisualProfile> | undefined) {
  if (!profile) return true;

  if (profile.nickname === 'Sean' && (profile.handle === 'user.0001' || profile.avatar === legacySeanAvatar)) {
    return true;
  }

  const legacyNicknames = new Set(['', 'Sean', 'momo', 'Linker']);
  const legacyHandles = new Set(['', 'user.0001', 'momo.zip', 'linker.app']);
  const legacyBios = new Set(['', '在线', 'Im sean :-) I love my life', legacyProfileBio, defaultProfileBio]);
  const legacyAvatars = new Set(['', legacySeanAvatar, legacyMomoAvatar, legacyMomoGreenAvatar, legacyNewUserAvatar, legacySvgAvatar, fallbackAvatar]);
  const legacyBackgrounds = new Set(['', legacyPhotoBackground, legacySvgBackground, momoMomentPost, fallbackBackground]);
  const tagsAreDefault = !profile.tags || profile.tags.join(',') === 'daily,film,cafe';
  const chipsAreDefault = !profile.chips || ['seoul,cafe day,film', 'private link,exclusive char,signal room'].includes(profile.chips.join(','));
  const statsAreDefault =
    !profile.stats ||
    (profile.stats.posts === 128 &&
      profile.stats.postsLabel === 'Posts' &&
      profile.stats.followers === '8.6k' &&
      profile.stats.followersLabel === 'Followers' &&
      profile.stats.following === 216 &&
      profile.stats.followingLabel === 'Following') ||
    (profile.stats.posts === 520 &&
      profile.stats.postsLabel === 'Posts' &&
      profile.stats.followers === '1.3k' &&
      profile.stats.followersLabel === 'Followers' &&
      profile.stats.following === 1400 &&
      profile.stats.followingLabel === 'Following');
  const linksAreDefault = !profile.links || ['link.app/momo,OOTD,playlist', 'link.app/linker'].includes(profile.links.map((link) => link.label).join(','));
  const highlightsAreDefault = !profile.highlights || profile.highlights.map((highlight) => highlight.title).join(',') === 'cafe,look,diary';
  const momentsAreDefault =
    !profile.moments ||
    (['today,ootd,room,cafe,night,note', 'today,ootd,room,cafe,night,note,post,crush,POV'].includes(profile.moments.map((moment) => moment.title).join(',')) &&
      (!profile.moments[0]?.image || profile.moments[0].image === legacyMomentToday || profile.moments[0].image === legacySvgMomentToday || profile.moments[0].image === momoMomentToday));

  return (
    legacyNicknames.has(profile.nickname ?? '') &&
    legacyHandles.has(profile.handle ?? '') &&
    legacyBios.has(profile.bio ?? '') &&
    legacyAvatars.has(profile.avatar ?? '') &&
    legacyBackgrounds.has(profile.backgroundImage ?? '') &&
    (profile.location ?? 'Seoul / Shanghai') === 'Seoul / Shanghai' &&
    ['soft mood', 'private signal'].includes(profile.mood ?? 'private signal') &&
    (profile.archiveLabel ?? 'Daily Archive') === 'Daily Archive' &&
    (profile.editLabel ?? '编辑') === '编辑' &&
    (profile.editorTitle ?? '编辑个人资料') === '编辑个人资料' &&
    (profile.messageLabel ?? 'message') === 'message' &&
    (profile.momentsLabel ?? 'Moments') === 'Moments' &&
    (profile.accentColor ?? '#f49ab5') === '#f49ab5' &&
    (profile.textColor ?? '#f5f3f1') === '#f5f3f1' &&
    (profile.avatarBorderColor ?? '#090c0f') === '#090c0f' &&
    tagsAreDefault &&
    chipsAreDefault &&
    statsAreDefault &&
    linksAreDefault &&
    highlightsAreDefault &&
    momentsAreDefault
  );
}

function createDefaultLinkerProfile() {
  return createVisualProfile({
    name: 'Linker',
    nickname: 'Linker',
    signature: defaultProfileBio
  });
}

export function normalizeVisualProfile(profile?: Partial<VisualProfile>, user?: VisualProfileOwner): VisualProfile {
  const fallback = createVisualProfile(user);
  const nextProfile = profile ?? {};

  return withPngProfileAssets(cloneProfile({
    ...fallback,
    ...nextProfile,
    stats: {
      ...normalizeStats(nextProfile.stats, fallback.stats)
    },
    tags: Array.isArray(nextProfile.tags) ? nextProfile.tags.filter(Boolean) : fallback.tags,
    chips: Array.isArray(nextProfile.chips) ? nextProfile.chips.filter(Boolean) : fallback.chips,
    links: Array.isArray(nextProfile.links) ? nextProfile.links.filter((link) => link.label || link.url) : fallback.links,
    highlights: Array.isArray(nextProfile.highlights) ? nextProfile.highlights.filter((highlight) => highlight.title || highlight.image) : fallback.highlights,
    moments: Array.isArray(nextProfile.moments) ? nextProfile.moments.filter((moment) => moment.title || moment.image) : fallback.moments
  }));
}

export function normalizeUserProfile(user: UserProfile): UserProfile {
  const avatar = normalizeProfileAvatar(user.avatar) || defaultProfileAvatar;
  const profileOwner = { ...user, avatar };
  const profile = isLegacyDefaultUser(user) && isLegacyDefaultVisualProfile(user.profile)
    ? createDefaultLinkerProfile()
    : normalizeVisualProfile(removeVisualProfileAvatar(user.profile as Partial<VisualProfile>), profileOwner);

  return {
    ...user,
    avatar,
    nickname: user.nickname?.trim() || user.name,
    signature: user.signature?.trim() || defaultProfileBio,
    boundCharacterIds: Array.isArray(user.boundCharacterIds) ? [...new Set(user.boundCharacterIds.filter(Boolean))] : [],
    profile: {
      ...toUserVisualProfile(profile),
      nickname: user.nickname?.trim() || user.name,
      bio: user.signature?.trim() || profile.bio
    }
  };
}

export function getVisualProfile(user: UserProfile | null): VisualProfile | null {
  if (!user) return null;
  return normalizeVisualProfile(removeVisualProfileAvatar(user.profile as Partial<VisualProfile>), user);
}

export function getCharacterVisualProfile(character: CharacterProfile | null): VisualProfile | null {
  if (!character) return null;
  return normalizeVisualProfile(character.profile, character);
}