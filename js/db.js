// IndexedDB — только черновик активной тренировки и мелкий кэш
class DraftDatabase {
  constructor() {
    this.dbName = 'mygym_draft';
    this.version = 1;
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    if (this.db) return;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initPromise = null;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('draft')) {
          db.createObjectStore('draft', { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  async ensureReady() {
    if (!this.db) await this.init();
  }

  async get(key) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['draft'], 'readonly');
      const req = tx.objectStore('draft').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(key, value) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['draft'], 'readwrite');
      const req = tx.objectStore('draft').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(key) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['draft'], 'readwrite');
      const req = tx.objectStore('draft').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async saveActiveSession(session) {
    const scope = this.getActiveScope();
    if (!scope) {
      await this.put('activeSession', session);
      return;
    }
    const map = (await this.get('activeSessionByScope')) || {};
    map[scope] = session;
    await this.put('activeSessionByScope', map);
  }

  async loadActiveSession() {
    const scope = this.getActiveScope();
    if (!scope) return this.get('activeSession');
    const map = (await this.get('activeSessionByScope')) || {};
    return map[scope] || null;
  }

  async clearActiveSession() {
    const scope = this.getActiveScope();
    if (!scope) {
      await this.delete('activeSession');
      return;
    }
    const map = (await this.get('activeSessionByScope')) || {};
    if (Object.prototype.hasOwnProperty.call(map, scope)) {
      delete map[scope];
      await this.put('activeSessionByScope', map);
    }
  }

  async cacheExercises(list) {
    const normalized = Array.isArray(list) ? list : (Array.isArray(list?.exercises) ? list.exercises : []);
    await this.put('exercisesCache', { at: Date.now(), list: normalized });
  }

  async loadExercisesCache() {
    const cached = await this.get('exercisesCache');
    return cached && Array.isArray(cached.list) ? cached.list : null;
  }

  getActiveScope() {
    const isDemo = !!window.DemoMode?.isDemo?.();
    if (isDemo) return 'demo';
    const userId = window.Auth?.getCurrentUser?.()?.id;
    return userId ? `user:${userId}` : null;
  }
}

const DB = new DraftDatabase();
window.DB = DB;
