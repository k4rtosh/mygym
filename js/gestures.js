/**
 * Gesture helpers — intentionally conservative.
 *
 * 0.7.0 attached PTR / long-press / swipe-back too aggressively and broke
 * web scrolling, calendar taps, and navigation. This module keeps small
 * primitives available, but page chrome no longer wires them by default.
 * Calendar period changes use header chevrons; day plan uses a normal tap.
 */
const Gestures = {
  isNative() {
    return !!(window.MYGYM_CONFIG?.IS_NATIVE);
  },

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

  /** No-op on web — PTR hijacked scroll/clicks. Reserved for a later native pass. */
  bindPagePullToRefresh() {
    if (this._ptrDispose) {
      this._ptrDispose();
      this._ptrDispose = null;
    }
  },

  /** Swipe-back only fights browser UX on web — leave system/UI buttons. */
  onSwipeBack() {
    return () => {};
  }
};

window.Gestures = Gestures;
