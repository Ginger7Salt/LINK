import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { preloadRoutePages, router } from './router';
import { syncAppViewportHeight } from './app/viewport';
import { installRingtoneAudioUnlock } from './services/ringtone';
import { useAppStore } from './stores/appStore';
import { requestPersistentStorage, setupPwaInstallPrompt } from './utils/storageProtection';
import './styles/main.css';

syncAppViewportHeight();
installRingtoneAudioUnlock();
setupPwaInstallPrompt();

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
	navigator.serviceWorker.getRegistrations()
		.then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
		.catch(() => undefined);
}

function waitForWindowLoad() {
	if (document.readyState === 'complete') return Promise.resolve();
	return new Promise<void>((resolve) => {
		window.addEventListener('load', () => resolve(), { once: true });
	});
}

function getStartupErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim()) return error.message.trim();
	return '启动加载失败，请刷新后重试。';
}

async function bootstrap() {
	const app = createApp(App);
	const pinia = createPinia();

	app.use(pinia).use(router);

	const store = useAppStore(pinia);

	try {
		await Promise.all([
			store.hydrate(),
			preloadRoutePages(),
			router.isReady(),
			waitForWindowLoad()
		]);

		app.mount('#app');
		window.dispatchEvent(new Event('link:app-mounted'));
		void requestPersistentStorage();
	} catch (error) {
		console.error('Link startup failed.', error);
		window.dispatchEvent(new CustomEvent('link:app-load-failed', {
			detail: { message: getStartupErrorMessage(error) }
		}));
	}
}

void bootstrap();