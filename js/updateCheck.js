// Проверка обновлений — web (кэш) и Android APK (скачивание)
const UpdateCheck = {
  DISMISS_KEY: 'mygym_dismissed_update',
  REMIND_AFTER_MS: 24 * 60 * 60 * 1000,
  _cachedStatus: null,

  currentVersion() {
    return window.MYGYM_CONFIG?.APP_VERSION || window.APP_VERSION || '0.0.0';
  },

  manifestUrl() {
    const cfg = window.MYGYM_CONFIG || {};
    if (cfg.IS_NATIVE) {
      return 'https://k4rtosh.github.io/mygym/version.json';
    }
    const base = cfg.BASE_PATH || '';
    return `${base}/version.json`.replace(/\/{2,}/g, '/');
  },

  parseVersion(v) {
    return String(v || '0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  },

  compareVersions(a, b) {
    const pa = this.parseVersion(a);
    const pb = this.parseVersion(b);
    const len = Math.max(pa.length, pb.length, 3);
    for (let i = 0; i < len; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  },

  isUpdateAvailable(manifest) {
    return manifest?.version && this.compareVersions(this.currentVersion(), manifest.version) < 0;
  },

  isBlocking(manifest) {
    const current = this.currentVersion();
    if (this.compareVersions(current, manifest.minVersion || '0.0.0') < 0) return true;
    if (manifest.critical && this.isUpdateAvailable(manifest)) return true;
    return false;
  },

  getDismissInfo() {
    try {
      const raw = localStorage.getItem(this.DISMISS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version) return parsed;
      // legacy: plain version string
      return { version: raw, at: 0 };
    } catch {
      return null;
    }
  },

  wasDismissedRecently(version) {
    const info = this.getDismissInfo();
    if (!info || info.version !== version) return false;
    if (!info.at) return true;
    return (Date.now() - info.at) < this.REMIND_AFTER_MS;
  },

  dismiss(version) {
    try {
      localStorage.setItem(this.DISMISS_KEY, JSON.stringify({ version, at: Date.now() }));
    } catch { /* ignore */ }
  },

  clearDismiss() {
    try {
      localStorage.removeItem(this.DISMISS_KEY);
    } catch { /* ignore */ }
  },

  async fetchManifest() {
    const url = `${this.manifestUrl()}?t=${Date.now()}`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  formatNotes(notes) {
    if (!notes) return 'Исправления и улучшения.';
    if (Array.isArray(notes)) return notes.map((n) => `• ${n}`).join('\n');
    return String(notes);
  },

  apkUrl(manifest) {
    return manifest.apkDownloadUrl || manifest.releasesPageUrl || 'https://github.com/k4rtosh/mygym/releases/latest';
  },

  openDownloadUrl(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async applyWebUpdate() {
    if (window.MYGYM_CONFIG?.IS_NATIVE) return;
    this.clearDismiss();
    this._cachedStatus = null;
    if (window.clearCacheAndReload) {
      await window.clearCacheAndReload();
      return;
    }
    const target = new URL(window.location.href);
    target.searchParams.set('_v', String(Date.now()));
    window.location.replace(target.toString());
  },

  async applyUpdate(manifest) {
    if (!manifest) return;
    if (window.MYGYM_CONFIG?.IS_NATIVE) {
      this.openDownloadUrl(this.apkUrl(manifest));
      Utils.showToast('Скачай APK и установи поверх текущей версии', 'info');
      return;
    }
    Utils.showToast('Загружаю новую версию...', 'info');
    await this.applyWebUpdate();
  },

  buildStatus(manifest) {
    const available = this.isUpdateAvailable(manifest);
    return {
      manifest,
      available,
      blocking: available && this.isBlocking(manifest),
      current: this.currentVersion(),
      latest: manifest?.version || this.currentVersion(),
      checkedAt: Date.now()
    };
  },

  async getStatus({ force = false } = {}) {
    if (!force && this._cachedStatus && (Date.now() - this._cachedStatus.checkedAt) < 5 * 60 * 1000) {
      return this._cachedStatus;
    }
    const manifest = await this.fetchManifest();
    this._cachedStatus = this.buildStatus(manifest);
    return this._cachedStatus;
  },

  shouldShowModal(status) {
    if (!status?.available) return false;
    if (status.blocking) return true;
    return !this.wasDismissedRecently(status.latest);
  },

  showModal(manifest, blocking) {
    if (document.getElementById('update-modal')) return;

    const isNative = !!window.MYGYM_CONFIG?.IS_NATIVE;
    const current = this.currentVersion();
    const latest = manifest.version;
    const notes = this.formatNotes(manifest.releaseNotes);
    const apkUrl = this.apkUrl(manifest);
    const title = blocking ? 'Требуется обновление' : 'Доступно обновление';

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'update-modal';
    modal.tabIndex = -1;
    if (blocking) {
      modal.setAttribute('data-bs-backdrop', 'static');
      modal.setAttribute('data-bs-keyboard', 'false');
    }

    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-secondary update-modal-content">
          <div class="modal-header border-secondary">
            <h5 class="modal-title ${blocking ? 'text-danger' : 'text-warning'}">
              <i class="bi bi-${blocking ? 'exclamation-octagon' : 'arrow-up-circle'}"></i>
              ${Utils.escapeHtml(title)}
            </h5>
            ${blocking ? '' : '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>'}
          </div>
          <div class="modal-body">
            <div class="update-version-row mb-3">
              <span class="badge bg-secondary">Сейчас: v${Utils.escapeHtml(current)}</span>
              <i class="bi bi-arrow-right mx-2 text-muted"></i>
              <span class="badge bg-primary">Новая: v${Utils.escapeHtml(latest)}</span>
            </div>
            ${blocking ? '<p class="text-danger small mb-2">Эта версия больше не поддерживается. Обновите приложение, чтобы продолжить.</p>' : ''}
            <p class="text-muted small mb-1">Что нового:</p>
            <div class="update-notes">${Utils.escapeHtml(notes).replace(/\n/g, '<br>')}</div>
            ${isNative ? `
              <div class="alert alert-info mt-3 mb-0 small">
                <i class="bi bi-phone"></i>
                Скачайте APK и установите поверх текущей версии. Данные в облаке сохранятся.
              </div>
            ` : `
              <div class="alert alert-info mt-3 mb-0 small">
                <i class="bi bi-globe"></i>
                Нажмите «Обновить» — кэш очистится и загрузится актуальная версия с сервера.
              </div>
            `}
            ${!blocking ? '<p class="text-muted small mt-3 mb-0">Напомним снова через 24 часа или в профиле.</p>' : ''}
          </div>
          <div class="modal-footer border-secondary flex-wrap gap-2">
            ${isNative ? `
              <button type="button" class="btn btn-primary" id="update-download-btn">
                <i class="bi bi-download"></i> Скачать APK
              </button>
            ` : `
              <button type="button" class="btn btn-primary" id="update-apply-btn">
                <i class="bi bi-arrow-clockwise"></i> Обновить
              </button>
            `}
            ${!blocking ? '<button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Позже</button>' : ''}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal, { backdrop: blocking ? 'static' : true, keyboard: !blocking });
    bsModal.show();

    modal.querySelector('#update-download-btn')?.addEventListener('click', () => {
      this.openDownloadUrl(apkUrl);
    });

    modal.querySelector('#update-apply-btn')?.addEventListener('click', () => {
      this.applyUpdate(manifest);
    });

    modal.addEventListener('hidden.bs.modal', () => {
      if (!blocking) this.dismiss(latest);
      modal.remove();
    });
  },

  async check({ showModal = true } = {}) {
    try {
      const status = await this.getStatus({ force: true });
      if (!status.available) return status;

      if (showModal && this.shouldShowModal(status)) {
        this.showModal(status.manifest, status.blocking);
      }
      return status;
    } catch (e) {
      console.warn('UpdateCheck:', e.message || e);
      return { available: false, error: e.message };
    }
  },

  async refreshProfileUI() {
    const statusEl = document.getElementById('profile-update-status');
    const notesEl = document.getElementById('profile-update-notes');
    const btn = document.getElementById('update-app-btn');
    const recheckBtn = document.getElementById('check-updates-btn');
    if (!statusEl || !btn) return;

    statusEl.textContent = 'Проверяю обновления...';
    btn.disabled = true;
    btn.classList.add('d-none');
    recheckBtn?.classList.add('d-none');
    if (notesEl) notesEl.classList.add('d-none');

    try {
      const status = await this.getStatus({ force: true });
      const isNative = !!window.MYGYM_CONFIG?.IS_NATIVE;

      if (status.available) {
        statusEl.innerHTML = `
          <span class="text-warning">Доступна версия <strong>v${Utils.escapeHtml(status.latest)}</strong></span>
          <span class="text-muted"> · сейчас v${Utils.escapeHtml(status.current)}</span>
        `;
        if (notesEl) {
          notesEl.textContent = this.formatNotes(status.manifest.releaseNotes);
          notesEl.classList.remove('d-none');
        }
        btn.innerHTML = isNative
          ? '<i class="bi bi-download"></i> Обновить приложение (скачать APK)'
          : '<i class="bi bi-arrow-clockwise"></i> Обновить приложение';
        btn.className = 'btn btn-primary w-100';
        btn.disabled = false;
        btn.classList.remove('d-none');
        recheckBtn?.classList.remove('d-none');
        btn.onclick = () => this.applyUpdate(status.manifest);
      } else {
        statusEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> У вас актуальная версия v${Utils.escapeHtml(status.current)}</span>`;
        btn.classList.add('d-none');
        recheckBtn?.classList.remove('d-none');
      }
    } catch (e) {
      statusEl.textContent = 'Не удалось проверить обновления. Проверьте интернет.';
      recheckBtn?.classList.remove('d-none');
    }

    if (recheckBtn) {
      recheckBtn.onclick = () => this.refreshProfileUI();
    }
  }
};

window.UpdateCheck = UpdateCheck;
