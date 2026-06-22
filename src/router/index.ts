import { createRouter, createWebHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import ChatsPage from '@/pages/ChatsPage.vue';
import ChatSettingsPage from '@/pages/ChatSettingsPage.vue';
import ChatRoomPage from '@/pages/ChatRoomPage.vue';
import OfflineRoomPage from '@/pages/OfflineRoomPage.vue';
import VoomPage from '@/pages/VoomPage.vue';
import MusicPage from '@/pages/MusicPage.vue';
import FanficPage from '@/pages/FanficPage.vue';
import ProfilePage from '@/pages/ProfilePage.vue';
import AddFriendPage from '@/pages/AddFriendPage.vue';
import ServicesPage from '@/pages/ServicesPlaceholderPage.vue';
import ImageGalleryPage from '@/pages/settings/ImageGalleryPage.vue';
import ImageModuleSettingsPage from '@/pages/settings/ImageModuleSettingsPage.vue';
import SettingsPage from '@/pages/settings/SettingsPage.vue';
import StickersPage from '@/pages/StickersPage.vue';
import StickerManagePage from '@/pages/StickerManagePage.vue';
import WorldBookPage from '@/pages/WorldBookPage.vue';
import WorldBookEditorPage from '@/pages/WorldBookEditorPage.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/home' },
    { path: '/home', name: 'home', component: HomePage },
    { path: '/profile', redirect: '/account' },
    { path: '/account', name: 'account', component: ProfilePage },
    { path: '/friends/add', name: 'add-friend', component: AddFriendPage },
    { path: '/services', name: 'services', component: ServicesPage },
    { path: '/stickers', name: 'stickers', component: StickersPage },
    { path: '/stickers/manage', name: 'stickers-manage', component: StickerManagePage },
    { path: '/world-book', name: 'world-book', component: WorldBookPage },
    { path: '/world-book/new', name: 'world-book-new', component: WorldBookEditorPage },
    { path: '/world-book/:id/edit', name: 'world-book-edit', component: WorldBookEditorPage },
    { path: '/world-book/:id/delete', redirect: (to) => ({ name: 'world-book-edit', params: { id: String(to.params.id) } }) },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/settings/image/:module/gallery', name: 'image-gallery', component: ImageGalleryPage },
    { path: '/settings/image/:module', name: 'image-module-settings', component: ImageModuleSettingsPage },
    { path: '/chats', name: 'chats', component: ChatsPage },
    { path: '/chats/:id/settings', name: 'chat-settings', component: ChatSettingsPage, props: true },
    { path: '/chats/:id', name: 'chat-room', component: ChatRoomPage, props: true },
    { path: '/offline/:id/settings', name: 'offline-chat-settings', component: ChatSettingsPage, props: true },
    { path: '/offline/:id', name: 'offline-room', component: OfflineRoomPage, props: true },
    { path: '/voom', name: 'voom', component: VoomPage },
    { path: '/music', name: 'music', component: MusicPage },
    { path: '/fanfic', name: 'fanfic', component: FanficPage }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});