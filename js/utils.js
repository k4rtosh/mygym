// Helpers
const Utils = {
  formatDate(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date || '');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  },

  formatDateTime(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const dateStr = this.formatDate(d);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}`;
  },

  formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  generateId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },

  // Local calendar date YYYY-MM-DD (not UTC)
  getTodayStr() {
    return this.toDateStr(new Date());
  },

  toDateStr(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  getDayOfWeek(date) {
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(date + 'T12:00:00')
      : new Date(date);
    return days[d.getDay()];
  },

  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `alert alert-${type} alert-dismissible fade show`;
    toast.style.cssText = 'min-width:250px;';
    toast.innerHTML = `${this.escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  async confirm(message) {
    return window.confirm(message);
  },

  navItems() {
    return [
      { id: 'home', icon: 'bi-house', label: 'Главная' },
      { id: 'calendar', icon: 'bi-calendar3', label: 'Календарь' },
      { id: 'templates', icon: 'bi-collection', label: 'Шаблоны' },
      { id: 'progress', icon: 'bi-graph-up', label: 'Прогресс' },
      { id: 'profile', icon: 'bi-person', label: 'Профиль' }
    ];
  },

  // Legacy helper (pages may still call it — returns empty to avoid duplicate nav)
  bottomNav(_active) {
    return '';
  },

  ensureShellNav() {
    return document.getElementById('shell-nav');
  },

  setShellNav(active) {
    const nav = this.ensureShellNav();
    if (!nav) return;
    nav.classList.remove('is-hidden');
    document.body.classList.add('has-shell-nav');
    nav.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === active);
    });
  },

  hideShellNav() {
    const nav = document.getElementById('shell-nav');
    if (nav) nav.classList.add('is-hidden');
    document.body.classList.remove('has-shell-nav');
  },

  shellNavActiveFor(path) {
    const map = {
      home: 'home',
      workout: 'home',
      'active-workout': 'home',
      history: 'home',
      'history-detail': 'home',
      calendar: 'calendar',
      templates: 'templates',
      'template-edit': 'templates',
      progress: 'progress',
      profile: 'profile',
      exercises: 'profile'
    };
    return map[path] || 'home';
  }
};

window.Utils = Utils;
