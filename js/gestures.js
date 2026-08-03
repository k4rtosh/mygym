/**
 * Lightweight pointer gestures — no external libs.
 * Swipe / long-press / pull-to-refresh for in-context surfaces only
 * (not bottom-tab switching).
 */
const Gestures = {
  SWIPE_MIN_DX: 64,
  SWIPE_MAX_DY: 52,
  LONG_PRESS_MS: 460,
  PTR_THRESHOLD: 70,

  buzz(style = 'Light') {
    try {
      const haptics = window.Capacitor?.Plugins?.Haptics;
      if (haptics?.impact) {
        haptics.impact({ style: style.toUpperCase() });
        return;
      }
    } catch { /* optional */ }
    try {
      if (navigator.vibrate) navigator.vibrate(28);
    } catch { /* ignore */ }
  },

  /**
   * Horizontal swipe on element.
   * @returns {() => void} dispose
   */
  onHorizontalSwipe(el, { onSwipeLeft, onSwipeRight, shouldIgnore } = {}) {
    if (!el) return () => {};
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pointerId = null;

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (typeof shouldIgnore === 'function' && shouldIgnore(e)) return;
      tracking = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    };

    const onUp = (e) => {
      if (!tracking || (pointerId != null && e.pointerId !== pointerId)) return;
      tracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      pointerId = null;
      if (Math.abs(dx) < this.SWIPE_MIN_DX) return;
      if (Math.abs(dy) > this.SWIPE_MAX_DY) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    };

    const onCancel = () => {
      tracking = false;
      pointerId = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  },

  /**
   * Long-press on matching descendants of root.
   * Suppresses the subsequent click after a successful long-press.
   * @returns {() => void} dispose
   */
  onLongPress(root, selector, handler) {
    if (!root || !selector || !handler) return () => {};
    let timer = null;
    let target = null;
    let startX = 0;
    let startY = 0;
    let armed = false;
    let suppressClick = false;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      target = null;
      armed = false;
    };

    const onDown = (e) => {
      const hit = e.target.closest?.(selector);
      if (!hit || !root.contains(hit)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clear();
      target = hit;
      startX = e.clientX;
      startY = e.clientY;
      armed = true;
      timer = setTimeout(() => {
        if (!armed || !target) return;
        suppressClick = true;
        this.buzz('Medium');
        handler(target, e);
        clear();
      }, this.LONG_PRESS_MS);
    };

    const onMove = (e) => {
      if (!armed) return;
      if (Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12) {
        clear();
      }
    };

    const onUp = () => clear();

    const onClickCapture = (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('click', onClickCapture, true);
    return () => {
      clear();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClickCapture, true);
    };
  },

  /**
   * Swipe right → back (detail screens). Keeps buttons as primary affordance.
   * @returns {() => void} dispose
   */
  onSwipeBack(el, onBack) {
    return this.onHorizontalSwipe(el, {
      onSwipeRight: () => onBack?.(),
      shouldIgnore: (e) => {
        const t = e.target;
        if (t.closest?.('input, textarea, select, button, a, .modal')) return true;
        return false;
      }
    });
  },

  /**
   * Pull-to-refresh on a scrollable page root (usually #app).
   * @returns {() => void} dispose
   */
  attachPullToRefresh(root, onRefresh) {
    if (!root || typeof onRefresh !== 'function') return () => {};

    let startY = 0;
    let pulling = false;
    let armed = false;
    let indicator = null;

    const ensureIndicator = () => {
      if (indicator?.isConnected) return indicator;
      indicator = document.createElement('div');
      indicator.className = 'ptr-indicator';
      indicator.innerHTML = '<span class="ptr-indicator-label">Обновить</span>';
      root.prepend(indicator);
      return indicator;
    };
    ensureIndicator();

    const setProgress = (dy) => {
      const el = ensureIndicator();
      const p = Math.min(1, Math.max(0, dy / this.PTR_THRESHOLD));
      el.style.opacity = String(0.35 + p * 0.65);
      el.style.transform = `translate(-50%, ${Math.min(dy, this.PTR_THRESHOLD + 12)}px)`;
      el.classList.toggle('is-ready', dy >= this.PTR_THRESHOLD);
      el.querySelector('.ptr-indicator-label').textContent =
        dy >= this.PTR_THRESHOLD ? 'Отпусти' : 'Потяни';
    };

    const reset = () => {
      pulling = false;
      armed = false;
      if (!indicator?.isConnected) {
        indicator = null;
        return;
      }
      indicator.classList.remove('is-ready', 'is-loading');
      indicator.style.opacity = '0';
      indicator.style.transform = 'translate(-50%, -100%)';
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const scrollTop = root.scrollTop || document.scrollingElement?.scrollTop || 0;
      if (scrollTop > 2) return;
      if (e.target.closest?.('input, textarea, select, button, .modal, .ex-focus-btn')) return;
      startY = e.clientY;
      armed = true;
      pulling = false;
    };

    const onMove = (e) => {
      if (!armed) return;
      const dy = e.clientY - startY;
      if (dy < 8) return;
      const scrollTop = root.scrollTop || document.scrollingElement?.scrollTop || 0;
      if (scrollTop > 2) {
        reset();
        return;
      }
      pulling = true;
      if (e.cancelable) e.preventDefault();
      setProgress(dy);
    };

    const onUp = async (e) => {
      if (!armed) return;
      const dy = e.clientY - startY;
      const shouldRefresh = pulling && dy >= this.PTR_THRESHOLD;
      armed = false;
      pulling = false;
      if (!shouldRefresh) {
        reset();
        return;
      }
      indicator = ensureIndicator();
      indicator.classList.add('is-loading');
      indicator.querySelector('.ptr-indicator-label').textContent = 'Обновляю…';
      indicator.style.transform = `translate(-50%, ${this.PTR_THRESHOLD}px)`;
      indicator.style.opacity = '1';
      this.buzz('Light');
      try {
        await onRefresh();
      } finally {
        // Page re-renders often wipe #app children — recreate host chrome.
        ensureIndicator();
        reset();
      }
    };

    root.classList.add('ptr-host');
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove, { passive: false });
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', reset);
    reset();

    return () => {
      root.classList.remove('ptr-host');
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', reset);
      indicator.remove();
    };
  },

  /** Map current route → reload function for pull-to-refresh. */
  refreshForPage(page) {
    switch (page) {
      case 'home':
        return () => Router.navigate('home', {}, { replace: true, silent: true });
      case 'history':
        return () => HistoryManager.loadHistoryList();
      case 'templates':
        return () => TemplatesManager.loadTemplatesList();
      case 'exercises':
        return () => ExercisesManager.loadExercisesList();
      case 'progress':
        return () => ProgressManager.loadHub();
      case 'progress-exercises':
        return () => ProgressManager.loadExercises();
      case 'progress-body-weight':
        return () => ProgressManager.loadBodyWeight();
      case 'progress-missed':
        return () => ProgressManager.loadMissed();
      case 'calendar':
        return () => CalendarManager.render();
      default:
        return null;
    }
  },

  /** Attach PTR when the current page supports it. */
  bindPagePullToRefresh() {
    const page = Router?.currentPage;
    const fn = this.refreshForPage(page);
    const app = document.getElementById('app');
    if (!app || !fn) return;
    if (this._ptrDispose) {
      this._ptrDispose();
      this._ptrDispose = null;
    }
    // Skip during active workout (gestures would fight steppers).
    if (page === 'active-workout' || page === 'login') return;
    this._ptrDispose = this.attachPullToRefresh(app, fn);
  }
};

window.Gestures = Gestures;
