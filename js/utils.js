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

  /**
   * Russian plural: Utils.pluralRu(n, ['шаблон', 'шаблона', 'шаблонов'])
   */
  pluralRu(n, forms) {
    const abs = Math.abs(Number(n) || 0);
    const m10 = abs % 10;
    const m100 = abs % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  },

  /**
   * Shared empty state block.
   * @param {{ icon?: string, title: string, text?: string, ctaHtml?: string }} opts
   */
  emptyStateHtml(opts = {}) {
    const icon = opts.icon || 'bi-inbox';
    const title = this.escapeHtml(opts.title || 'Пока пусто');
    const text = opts.text
      ? `<p class="empty-state-text">${this.escapeHtml(opts.text)}</p>`
      : '';
    const cta = opts.ctaHtml || '';
    return `
      <div class="empty-state fade-in" role="status">
        <i class="bi ${this.escapeHtml(icon)} empty-state-icon" aria-hidden="true"></i>
        <p class="empty-state-title">${title}</p>
        ${text}
        ${cta}
      </div>
    `;
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
    toast.innerHTML = `${this.escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Закрыть"></button>`;
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
   * Multi-field modal form.
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.message]
   * @param {Array<{name:string,label:string,type?:string,required?:boolean,value?:string,placeholder?:string,min?:string|number,max?:string|number,step?:string|number}>} options.fields
   * @returns {Promise<object|null>}
   */
  formModal(options = {}) {
    const {
      title = 'Форма',
      message = '',
      fields = [],
      confirmText = 'Сохранить',
      cancelText = 'Отмена',
      requireAny = false
    } = options;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const fieldsHtml = fields.map((f) => {
        const type = f.type || 'text';
        const req = f.required ? 'required' : '';
        const min = f.min != null ? `min="${this.escapeHtml(String(f.min))}"` : '';
        const max = f.max != null ? `max="${this.escapeHtml(String(f.max))}"` : '';
        const step = f.step != null ? `step="${this.escapeHtml(String(f.step))}"` : '';
        const showWhen = f.showWhen && f.showWhen.field
          ? `data-show-when-field="${this.escapeHtml(f.showWhen.field)}" data-show-when-equals="${this.escapeHtml(
            Array.isArray(f.showWhen.in)
              ? f.showWhen.in.join('|')
              : String(f.showWhen.equals ?? '')
          )}" data-show-when-mode="${Array.isArray(f.showWhen.in) ? 'in' : 'equals'}"`
          : '';
        let controlHtml = '';
        if (type === 'select') {
          const opts = (f.options || []).map((o) => {
            const val = typeof o === 'string' ? o : o.value;
            const label = typeof o === 'string' ? o : (o.label || o.value);
            const selected = String(f.value ?? '') === String(val) ? 'selected' : '';
            return `<option value="${this.escapeHtml(String(val))}" ${selected}>${this.escapeHtml(String(label))}</option>`;
          }).join('');
          controlHtml = `
            <label class="form-label" for="form-field-${this.escapeHtml(f.name)}">${this.escapeHtml(f.label)}</label>
            <select class="form-select form-select-lg" id="form-field-${this.escapeHtml(f.name)}"
              name="${this.escapeHtml(f.name)}" ${req}>
              ${opts}
            </select>
            <div class="invalid-feedback">Проверь поле</div>`;
        } else if (type === 'search-select') {
          const allItems = (f.searchItems || f.options || []).map((o) => (
            typeof o === 'string' ? { value: o, label: o } : { value: String(o.value ?? ''), label: String(o.label ?? o.value ?? '') }
          ));
          const currentVal = f.value != null ? String(f.value) : '';
          const currentHit = currentVal ? allItems.find((o) => o.value === currentVal) : null;
          const labelText = currentHit ? currentHit.label : '';
          controlHtml = `
            <label class="form-label" for="form-field-${this.escapeHtml(f.name)}-q">${this.escapeHtml(f.label)}</label>
            <div class="search-select" data-search-select="${this.escapeHtml(f.name)}">
              <input type="hidden" id="form-field-${this.escapeHtml(f.name)}"
                name="${this.escapeHtml(f.name)}" value="${this.escapeHtml(currentVal)}" ${req}>
              <input type="search" class="form-control form-control-lg search-select-input"
                id="form-field-${this.escapeHtml(f.name)}-q"
                value="${this.escapeHtml(labelText)}"
                placeholder="${this.escapeHtml(f.placeholder || 'Поиск упражнения…')}"
                autocomplete="off" spellcheck="false">
              <div class="search-select-menu d-none" role="listbox"></div>
              <div class="invalid-feedback">Выбери упражнение из списка</div>
              <div class="form-text search-select-hint">Частые из дневника — или начни вводить название</div>
            </div>`;
        } else {
          controlHtml = `
            <label class="form-label" for="form-field-${this.escapeHtml(f.name)}">${this.escapeHtml(f.label)}</label>
            <input class="form-control form-control-lg" id="form-field-${this.escapeHtml(f.name)}"
              name="${this.escapeHtml(f.name)}" type="${this.escapeHtml(type)}"
              value="${this.escapeHtml(f.value || '')}"
              placeholder="${this.escapeHtml(f.placeholder || '')}"
              ${req} ${min} ${max} ${step} autocomplete="off">
            <div class="invalid-feedback">Проверь поле</div>`;
        }
        return `<div class="mb-3 form-field-wrap" data-field-wrap="${this.escapeHtml(f.name)}" ${showWhen}>${controlHtml}</div>`;
      }).join('');

      const { modal, bsModal } = this._createAppDialog({
        id: 'app-form-modal',
        title,
        bodyHtml: `
          ${message ? `<p class="mb-3 app-dialog-message">${this.formatDialogMessage(message)}</p>` : ''}
          <form id="app-form-modal-form" novalidate>${fieldsHtml}</form>
        `,
        footerHtml: `
          <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">${this.escapeHtml(cancelText)}</button>
          <button type="button" class="btn btn-primary" id="app-form-ok">${this.escapeHtml(confirmText)}</button>
        `
      });

      const form = modal.querySelector('#app-form-modal-form');

      const normalizeOption = (o) => {
        if (typeof o === 'string') return { value: o, label: o };
        return {
          value: String(o.value ?? ''),
          label: String(o.label ?? o.value ?? ''),
          meta: o.meta ? String(o.meta) : ''
        };
      };

      const initSearchSelect = (f) => {
        const root = form.querySelector(`[data-search-select="${f.name}"]`);
        if (!root) return;
        const hidden = root.querySelector(`#form-field-${f.name}`);
        const input = root.querySelector('.search-select-input');
        const menu = root.querySelector('.search-select-menu');
        if (!hidden || !input || !menu) return;

        const suggested = (f.options || []).map(normalizeOption);
        const catalog = (f.searchItems || f.options || []).map(normalizeOption);
        const allowEmpty = f.allowEmpty !== false;
        const emptyLabel = f.emptyLabel || 'Не важно';
        let blurTimer = null;

        const renderMenu = (query) => {
          const q = String(query || '').trim().toLowerCase();
          let rows = [];
          if (!q) {
            rows = suggested.slice();
          } else {
            rows = catalog.filter((item) => {
              if (!item.value) return false;
              const hay = `${item.label} ${item.meta}`.toLowerCase();
              return hay.includes(q);
            }).slice(0, 24);
          }
          if (allowEmpty && (!q || emptyLabel.toLowerCase().includes(q))) {
            rows = [{ value: '', label: emptyLabel, meta: '' }, ...rows.filter((r) => r.value)];
          }
          // dedupe by value
          const seen = new Set();
          rows = rows.filter((r) => {
            const key = r.value || '__empty__';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          if (!rows.length) {
            menu.innerHTML = `<div class="search-select-empty">Ничего не найдено</div>`;
            menu.classList.remove('d-none');
            return;
          }

          menu.innerHTML = rows.map((item) => `
            <button type="button" class="search-select-option" role="option"
              data-value="${this.escapeHtml(item.value)}"
              data-label="${this.escapeHtml(item.label)}">
              <span class="search-select-option-label">${this.escapeHtml(item.label)}</span>
              ${item.meta ? `<span class="search-select-option-meta">${this.escapeHtml(item.meta)}</span>` : ''}
            </button>
          `).join('');
          menu.classList.remove('d-none');
        };

        const pick = (value, label) => {
          hidden.value = value;
          input.value = value ? label : '';
          menu.classList.add('d-none');
          input.classList.remove('is-invalid');
          hidden.classList.remove('is-invalid');
        };

        input.addEventListener('focus', () => renderMenu(input.value));
        input.addEventListener('input', () => {
          // Typing invalidates previous id until a pick (unless exact match later on submit)
          if (!input.value.trim()) {
            hidden.value = '';
          } else if (hidden.value) {
            const cur = catalog.find((c) => c.value === hidden.value);
            if (!cur || cur.label !== input.value.trim()) hidden.value = '';
          }
          renderMenu(input.value);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            menu.classList.add('d-none');
            e.stopPropagation();
          }
          if (e.key === 'Enter') {
            const first = menu.querySelector('.search-select-option');
            if (!menu.classList.contains('d-none') && first) {
              e.preventDefault();
              pick(first.getAttribute('data-value') || '', first.getAttribute('data-label') || '');
            }
          }
        });
        menu.addEventListener('mousedown', (e) => {
          const btn = e.target.closest('.search-select-option');
          if (!btn) return;
          e.preventDefault();
          pick(btn.getAttribute('data-value') || '', btn.getAttribute('data-label') || '');
        });
        input.addEventListener('blur', () => {
          blurTimer = setTimeout(() => {
            menu.classList.add('d-none');
            // Resolve typed exact label → id
            const typed = input.value.trim().toLowerCase();
            if (!typed) {
              pick('', '');
              return;
            }
            if (hidden.value) return;
            const hit = catalog.find((c) => c.label.toLowerCase() === typed);
            if (hit) pick(hit.value, hit.label);
          }, 150);
        });
        input.addEventListener('focus', () => {
          if (blurTimer) clearTimeout(blurTimer);
        });
      };

      fields.filter((f) => f.type === 'search-select').forEach((f) => initSearchSelect(f));

      const isFieldVisible = (f) => {
        if (!f.showWhen?.field) return true;
        const wrap = form.querySelector(`[data-field-wrap="${f.name}"]`);
        return !!(wrap && wrap.style.display !== 'none');
      };

      const syncShowWhen = () => {
        form.querySelectorAll('[data-show-when-field]').forEach((wrap) => {
          const dep = wrap.getAttribute('data-show-when-field');
          const mode = wrap.getAttribute('data-show-when-mode') || 'equals';
          const raw = wrap.getAttribute('data-show-when-equals') || '';
          const depEl = form.querySelector(`#form-field-${dep}`);
          const depVal = depEl ? String(depEl.value) : '';
          let show = false;
          if (mode === 'in') {
            show = raw.split('|').includes(depVal);
          } else {
            show = depVal === raw;
          }
          wrap.style.display = show ? '' : 'none';
          if (!show) {
            wrap.querySelectorAll('input, select').forEach((el) => el.classList.remove('is-invalid'));
          }
        });
      };
      syncShowWhen();
      form.addEventListener('change', (e) => {
        if (e.target?.matches?.('select, input')) syncShowWhen();
      });

      const submit = () => {
        const values = {};
        let valid = true;
        let anyFilled = false;
        for (const f of fields) {
          const input = form.querySelector(`#form-field-${f.name}`);
          if (!input) continue;
          if (!isFieldVisible(f)) {
            values[f.name] = null;
            continue;
          }

          if (f.type === 'search-select') {
            let raw = String(input.value || '').trim();
            const q = form.querySelector(`#form-field-${f.name}-q`);
            if (!raw && q?.value?.trim()) {
              const typed = q.value.trim().toLowerCase();
              const catalog = (f.searchItems || f.options || []).map(normalizeOption);
              const hit = catalog.find((c) => c.label.toLowerCase() === typed);
              if (hit) {
                raw = hit.value;
                input.value = hit.value;
              }
            }
            if (raw) anyFilled = true;
            if (f.required && !raw) {
              q?.classList.add('is-invalid');
              input.classList.add('is-invalid');
              valid = false;
              continue;
            }
            // Typed garbage without pick
            if (q?.value?.trim() && !raw && f.allowEmpty !== false) {
              // treat as invalid only if they typed something that isn't empty-label
              const emptyLabel = (f.emptyLabel || 'Не важно').toLowerCase();
              if (q.value.trim().toLowerCase() !== emptyLabel) {
                q.classList.add('is-invalid');
                valid = false;
                continue;
              }
            }
            q?.classList.remove('is-invalid');
            input.classList.remove('is-invalid');
            values[f.name] = raw || null;
            continue;
          }

          const raw = input.value.trim();
          if (raw) anyFilled = true;
          if (f.required && !raw) {
            input.classList.add('is-invalid');
            valid = false;
            continue;
          }
          input.classList.remove('is-invalid');
          if (f.type === 'number' && raw) {
            const num = Number(raw.replace(',', '.'));
            if (!Number.isFinite(num)) {
              input.classList.add('is-invalid');
              valid = false;
              continue;
            }
            if (f.min != null && num < Number(f.min)) {
              input.classList.add('is-invalid');
              valid = false;
              continue;
            }
            if (f.max != null && num > Number(f.max)) {
              input.classList.add('is-invalid');
              valid = false;
              continue;
            }
            values[f.name] = num;
          } else {
            values[f.name] = raw || null;
          }
        }
        if (requireAny && !anyFilled) {
          form.querySelectorAll('input, select').forEach((el) => {
            const wrap = el.closest('[data-field-wrap]');
            if (wrap && wrap.style.display === 'none') return;
            el.classList.add('is-invalid');
          });
          valid = false;
        }
        if (!valid) return;
        bsModal.hide();
        finish(values);
      };

      form?.addEventListener('input', (e) => {
        if (e.target?.classList) e.target.classList.remove('is-invalid');
      });
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        submit();
      });
      modal.querySelector('#app-form-ok')?.addEventListener('click', submit);
      modal.addEventListener('shown.bs.modal', () => {
        form?.querySelector('input')?.focus();
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

  ensureShellNav() {
    return document.getElementById('shell-nav');
  },

  setShellNav(active) {
    const nav = this.ensureShellNav();
    if (!nav) return;
    nav.classList.remove('is-hidden');
    document.body.classList.add('has-shell-nav');
    nav.querySelectorAll('[data-nav]').forEach((btn) => {
      const on = btn.dataset.nav === active;
      btn.classList.toggle('active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
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
      'progress-exercises': 'progress',
      'progress-body-weight': 'progress',
      'progress-missed': 'progress',
      'progress-insights': 'progress',
      profile: 'profile',
      exercises: 'profile'
    };
    return map[path] || 'home';
  }
};

window.Utils = Utils;
