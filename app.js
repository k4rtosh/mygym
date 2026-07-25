const APP_VERSION = window.MYGYM_CONFIG?.APP_VERSION || '2.0.0';

async function clearCacheAndReload() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
      }
    }
    location.reload();
  } catch (e) {
    console.error(e);
    location.reload();
  }
}

async function initNativeShell() {
  if (!window.MYGYM_CONFIG?.IS_NATIVE) return;
  const plugins = window.Capacitor?.Plugins || {};
  try {
    if (plugins.StatusBar?.setBackgroundColor) {
      await plugins.StatusBar.setBackgroundColor({ color: '#0c1018' });
    }
    if (plugins.StatusBar?.setStyle) {
      await plugins.StatusBar.setStyle({ style: 'DARK' });
    }
  } catch (_) { /* optional */ }
  try {
    if (plugins.SplashScreen?.hide) {
      await plugins.SplashScreen.hide();
    }
  } catch (_) { /* optional */ }
}

window.APP_VERSION = APP_VERSION;
window.clearCacheAndReload = clearCacheAndReload;
window.exportData = () => SyncManager.exportData();
window.importData = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    if (e.target.files[0]) await SyncManager.importData(e.target.files[0]);
  };
  input.click();
};

async function initApp() {
  try {
    await initNativeShell();
    await DB.init();

    const draft = await DB.loadActiveSession();
    const loggedIn = await Auth.init();

    if (!loggedIn) {
      await Router.navigate('login');
      return;
    }

    // Warm exercise cache
    try {
      const exercises = await Api.listExercises();
      await DB.cacheExercises(exercises);
    } catch (e) {
      console.warn('Exercises prefetch failed', e);
    }

    if (draft && draft.id && !draft.endTime) {
      const resume = await Utils.confirm('Есть незавершённая тренировка. Продолжить?');
      if (resume) {
        await Router.navigate('active-workout', { sessionId: draft.id });
        return;
      }
      await DB.clearActiveSession();
    }

    await Router.navigate('home');
  } catch (error) {
    console.error(error);
    document.getElementById('app').innerHTML = `
      <div class="container mt-5 text-center">
        <h3>Ошибка запуска</h3>
        <div class="alert alert-danger mt-3"><strong>${Utils.escapeHtml(error.message)}</strong></div>
        <button class="btn btn-primary mt-2" onclick="location.reload()">Перезагрузить</button>
        <button class="btn btn-warning mt-2 ms-2" onclick="clearCacheAndReload()">Очистить кэш</button>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', initApp);
