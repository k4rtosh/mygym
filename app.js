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

function markNativeShell() {
  const cfg = window.MYGYM_CONFIG;
  if (!cfg?.IS_NATIVE) return;
  document.documentElement.classList.add('is-native');
  try {
    const platform = window.Capacitor?.getPlatform?.() || '';
    if (platform === 'android') document.documentElement.classList.add('is-native-android');
    if (platform === 'ios') document.documentElement.classList.add('is-native-ios');
  } catch (_) { /* ignore */ }
}

async function initNativeShell() {
  markNativeShell();
  if (!window.MYGYM_CONFIG?.IS_NATIVE) return;
  const plugins = window.Capacitor?.Plugins || {};
  try {
    // Keep WebView below the status bar (fixes header under clock/battery)
    if (plugins.StatusBar?.setOverlaysWebView) {
      await plugins.StatusBar.setOverlaysWebView({ overlay: false });
    }
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

function showDemoBadge() {
  if (document.getElementById('demo-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'demo-badge';
  badge.textContent = 'DEMO';
  badge.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;background:#f59e0b;color:#000;font-size:0.65rem;font-weight:800;padding:2px 8px;border-radius:6px;letter-spacing:0.5px;pointer-events:none;';
  document.body.appendChild(badge);
}
window.showDemoBadge = showDemoBadge;

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

    if (window.DemoMode && window.DemoMode.isDemo()) {
      window.DemoMode.activateDemoShims();
    }

    const draft = await DB.loadActiveSession();
    const loggedIn = await Auth.init();

    if (!loggedIn) {
      await Router.navigate('login');
      return;
    }

    if (window.DemoMode && window.DemoMode.isDemo()) {
      showDemoBadge();
    }

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
