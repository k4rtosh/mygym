// Проверка обновлений — web (кэш) и Android APK (скачивание)
const UpdateCheck = {
  DISMISS_KEY: 'mygym_dismissed_version',

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
    return this.compareVersions(this.currentVersion(), manifest.version) < 0;
  },

  isBlocking(manifest) {
    const current = this.currentVersion();
    if (this.compareVersions(current, manifest.minVersion || '0.0.0') < 0) return true;
    if (manifest.critical && this.isUpdateAvailable(manifest)) return true;
    return false;
  },

  wasDismissed(version) {
    try {
      return localStorage.getItem(this.DISMISS_KEY) === version;
    } catch {
      return false;
    }
  },

  dismiss(version) {
    try {
      localStorage.setItem(this.DISMISS_KEY, version);
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

  openDownloadUrl(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async applyWebUpdate() {
    if (window.clearCacheAndReload) {
      await window.clearCacheAndReload();
    } else {
      location.reload();
    }
  },

  showModal(manifest, blocking) {
    if (document.getElementById('update-modal')) return;

    const isNative = !!window.MYGYM_CONFIG?.IS_NATIVE;
    const current = this.currentVersion();
    const latest = manifest.version;
    const notes = this.formatNotes(manifest.releaseNotes);
    const apkUrl = manifest.apkDownloadUrl || manifest.releasesPageUrl || 'https://github.com/k4rtosh/mygym/releases/latest';
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
          <div class="modal-header border-secondary ${blocking ? '' : ''}">
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
                Нажмите «Обновить» — страница перезагрузится с актуальной версией.
              </div>
            `}
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
      this.applyWebUpdate();
    });

    modal.addEventListener('hidden.bs.modal', () => {
      if (!blocking) this.dismiss(latest);
      modal.remove();
    });
  },

  async check() {
    try {
      const manifest = await this.fetchManifest();
      if (!manifest?.version) return null;

      if (!this.isUpdateAvailable(manifest)) return null;

      const blocking = this.isBlocking(manifest);
      if (!blocking && this.wasDismissed(manifest.version)) return null;

      this.showModal(manifest, blocking);
      return { manifest, blocking };
    } catch (e) {
      console.warn('UpdateCheck:', e.message || e);
      return null;
    }
  }
};

window.UpdateCheck = UpdateCheck;
