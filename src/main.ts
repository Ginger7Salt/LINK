import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { syncAppViewportHeight } from './app/viewport';
import './styles/main.css';

syncAppViewportHeight();

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
	navigator.serviceWorker.getRegistrations()
		.then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
		.catch(() => undefined);
}

createApp(App).use(createPinia()).use(router).mount('#app');

window.dispatchEvent(new Event('link:app-mounted'));