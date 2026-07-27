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
      toastContainer.className = 'toast-container-app';
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

  formatDialogMessage(message) {
    return this.escapeHtml(message).replace(/\n/g, '<br>');
  },

  _createAppDialog({ id, title, bodyHtml, footerHtml, titleClass = '' }) {
    document.getElementById(id)?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal fade app-dialog';
    modal.id = id;
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-secondary">
          <div class="modal-header border-secondary">
            <h5 class="modal-title ${titleClass}">${this.escapeHtml(title)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          ${footerHtml ? `<div class="modal-footer border-secondary flex-wrap gap-2">${footerHtml}</div>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    return { modal, bsModal };
  },

  /**
   * @param {string} message
   * @param {object} [options]
   * @returns {Promise<boolean>}
   */
  confirm(message, options = {}) {
    const {
      title = 'Подтверждение',
      confirmText = 'ОК',
      cancelText = 'Отмена',
      confirmClass = 'btn-primary'
    } = options;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const { modal, bsModal } = this._createAppDialog({
        id: 'app-confirm-modal',
        title,
        bodyHtml: `<p class="mb-0 app-dialog-message">${this.formatDialogMessage(message)}</p>`,
        footerHtml: `
          <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">${this.escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${confirmClass}" id="app-confirm-ok">${this.escapeHtml(confirmText)}</button>
        `
      });

      modal.querySelector('#app-confirm-ok')?.addEventListener('click', () => {
        bsModal.hide();
        finish(true);
      });
      modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
        finish(false);
      });
      bsModal.show();
    });
  },

  /**
   * @param {string} label
   * @param {string} [defaultValue]
   * @param {object} [options]
   * @returns {Promise<string|null>}
   */
  prompt(label, defaultValue = '', options = {}) {
    const {
      title = label,
      placeholder = '',
      confirmText = 'Сохранить',
      cancelText = 'Отмена',
      required = true
    } = options;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const { modal, bsModal } = this._createAppDialog({
        id: 'app-prompt-modal',
        title,
        bodyHtml: `
          <label class="form-label" for="app-prompt-input">${this.escapeHtml(label)}</label>
          <input type="text" class="form-control form-control-lg" id="app-prompt-input"
            value="${this.escapeHtml(defaultValue)}"
            placeholder="${this.escapeHtml(placeholder)}"
            autocomplete="off" spellcheck="false">
        `,
        footerHtml: `
          <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">${this.escapeHtml(cancelText)}</button>
          <button type="button" class="btn btn-primary" id="app-prompt-ok">${this.escapeHtml(confirmText)}</button>
        `
      });

      const input = modal.querySelector('#app-prompt-input');
      const submit = () => {
        const value = input.value.trim();
        if (required && !value) {
          input.classList.add('is-invalid');
          input.focus();
          return;
        }
        bsModal.hide();
        finish(value || defaultValue || '');
      };

      input.addEventListener('input', () => input.classList.remove('is-invalid'));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
      modal.querySelector('#app-prompt-ok')?.addEventListener('click', submit);
      modal.addEventListener('shown.bs.modal', () => {
        input.focus();
        input.select();
      });
      modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
        finish(null);
      });
      bsModal.show();
    });
  },

  /**
   * @returns {Promise<boolean>}
   */
  confirmPhrase({ title, message, phrase, confirmText = 'Очистить данные' }) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const { modal, bsModal } = this._createAppDialog({
        id: 'confirm-phrase-modal',
        title,
        titleClass: 'text-danger',
        bodyHtml: `
          <p class="mb-3 app-dialog-message">${this.formatDialogMessage(message)}</p>
          <p class="small text-muted mb-2">Для подтверждения введите: <strong class="text-warning">${this.escapeHtml(phrase)}</strong></p>
          <input type="text" class="form-control form-control-lg" id="confirm-phrase-input" autocomplete="off" spellcheck="false" placeholder="${this.escapeHtml(phrase)}">
          <div class="text-danger small mt-2 d-none" id="confirm-phrase-error">Фраза введена неверно</div>
        `,
        footerHtml: `
          <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Отмена</button>
          <button type="button" class="btn btn-danger" id="confirm-phrase-submit" disabled>${this.escapeHtml(confirmText)}</button>
        `
      });

      const input = modal.querySelector('#confirm-phrase-input');
      const submitBtn = modal.querySelector('#confirm-phrase-submit');
      const errorEl = modal.querySelector('#confirm-phrase-error');

      const check = () => {
        const ok = input.value.trim() === phrase;
        submitBtn.disabled = !ok;
        errorEl.classList.toggle('d-none', !input.value.trim() || ok);
      };

      input.addEventListener('input', check);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !submitBtn.disabled) submitBtn.click();
      });
      modal.addEventListener('shown.bs.modal', () => input.focus());

      submitBtn.addEventListener('click', () => {
        if (input.value.trim() !== phrase) {
          errorEl.classList.remove('d-none');
          return;
        }
        bsModal.hide();
        finish(true);
      });

      modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
        finish(false);
      });

      bsModal.show();
    });
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
