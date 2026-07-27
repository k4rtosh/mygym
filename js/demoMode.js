// Demo Mode — local-only storage, no Supabase required
(function () {
  const DEMO_KEY = 'mygym_demo_mode';
  const DEMO_USER_ID = 'demo-user-0000';
  const STORE_PREFIX = 'mygym_demo_';

  function isDemo() {
    return sessionStorage.getItem(DEMO_KEY) === '1';
  }

  function enableDemo() {
    sessionStorage.setItem(DEMO_KEY, '1');
  }

  function disableDemo() {
    sessionStorage.removeItem(DEMO_KEY);
  }

  // LocalStorage-backed CRUD
  function store(key) { return STORE_PREFIX + key; }

  function getAll(key) {
    try { return JSON.parse(localStorage.getItem(store(key)) || '[]'); }
    catch { return []; }
  }

  function putAll(key, arr) {
    localStorage.setItem(store(key), JSON.stringify(arr));
  }

  // Demo API — mirrors real Api interface but uses localStorage
  const DemoApi = {
    async requireUser() {
      return { id: DEMO_USER_ID, email: 'test@demo' };
    },

    async getProfile() {
      return { id: DEMO_USER_ID, display_name: 'Demo User', created_at: new Date().toISOString() };
    },

    async updateProfile(displayName) {
      return { id: DEMO_USER_ID, display_name: displayName };
    },

    async listExercises() {
      const cached = await DB.loadExercisesCache();
      if (Array.isArray(cached) && cached.length) return cached;
      const resp = await fetch('data/exercises.json');
      if (!resp.ok) return [];
      const raw = await resp.json();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.exercises) ? raw.exercises : []);
      await DB.cacheExercises(list);
      return list;
    },

    async listTemplates() {
      return getAll('templates');
    },

    async getTemplate(id) {
      return getAll('templates').find(t => t.id === id) || null;
    },

    async createTemplate(partial = {}) {
      const templates = getAll('templates');
      const row = {
        id: Utils.generateId(),
        user_id: DEMO_USER_ID,
        name: partial.name || 'Новый шаблон',
        description: partial.description || '',
        exercises: partial.exercises || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      templates.unshift(row);
      putAll('templates', templates);
      return row;
    },

    async updateTemplate(id, patch) {
      const templates = getAll('templates');
      const idx = templates.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Шаблон не найден');
      Object.assign(templates[idx], patch, { updated_at: new Date().toISOString() });
      delete templates[idx].user_id;
      templates[idx].user_id = DEMO_USER_ID;
      putAll('templates', templates);
      return templates[idx];
    },

    async deleteTemplate(id) {
      putAll('templates', getAll('templates').filter(t => t.id !== id));
    },

    async listSessions() {
      return getAll('sessions').map(r => this.normalizeSession(r));
    },

    async getSession(id) {
      const row = getAll('sessions').find(s => s.id === id);
      return this.normalizeSession(row);
    },

    async upsertSession(session) {
      const sessions = getAll('sessions');
      const row = {
        id: session.id || Utils.generateId(),
        user_id: DEMO_USER_ID,
        template_id: session.templateId || session.template_id || null,
        template_name: session.templateName || session.template_name || 'Свободная тренировка',
        workout_date: session.date || session.workout_date,
        start_time: session.startTime || session.start_time,
        end_time: session.endTime || session.end_time || null,
        duration_sec: session.duration ?? session.duration_sec ?? 0,
        completed: !!session.completed,
        notes: session.notes || '',
        exercises: session.exercises || []
      };
      const idx = sessions.findIndex(s => s.id === row.id);
      if (idx >= 0) sessions[idx] = row; else sessions.unshift(row);
      putAll('sessions', sessions);
      return this.normalizeSession(row);
    },

    async deleteSession(id) {
      putAll('sessions', getAll('sessions').filter(s => s.id !== id));
    },

    normalizeSession(row) {
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        templateId: row.template_id,
        templateName: row.template_name,
        date: row.workout_date,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration_sec,
        completed: row.completed,
        notes: row.notes || '',
        exercises: row.exercises || []
      };
    },

    async listPlanned(fromDate, toDate) {
      let arr = getAll('planned');
      if (fromDate) arr = arr.filter(p => p.workout_date >= fromDate);
      if (toDate) arr = arr.filter(p => p.workout_date <= toDate);
      return arr.map(p => {
        const tpl = getAll('templates').find(t => t.id === p.template_id);
        return { ...p, templates: tpl ? { id: tpl.id, name: tpl.name } : null };
      });
    },

    async getPlannedForDate(dateStr) {
      const p = getAll('planned').find(x => x.workout_date === dateStr);
      if (!p) return null;
      const tpl = getAll('templates').find(t => t.id === p.template_id);
      return { ...p, templates: tpl ? { id: tpl.id, name: tpl.name } : null };
    },

    async upsertPlanned(dateStr, templateId) {
      const arr = getAll('planned');
      const existing = arr.findIndex(x => x.workout_date === dateStr);
      const row = { user_id: DEMO_USER_ID, workout_date: dateStr, template_id: templateId || null };
      if (existing >= 0) arr[existing] = row; else arr.push(row);
      putAll('planned', arr);
      const tpl = getAll('templates').find(t => t.id === templateId);
      return { ...row, templates: tpl ? { id: tpl.id, name: tpl.name } : null };
    },

    async deletePlanned(dateStr) {
      putAll('planned', getAll('planned').filter(x => x.workout_date !== dateStr));
    },

    async getExerciseProgress(exerciseId) {
      const rows = await this.listSessions();
      const points = [];
      for (const s of rows) {
        if (!s.completed || !s.endTime) continue;
        const ex = (s.exercises || []).find(e => e.exerciseId === exerciseId);
        if (!ex || !ex.sets || !ex.sets.length) continue;
        let maxWeight = 0, volume = 0;
        for (const set of ex.sets) {
          const w = Number(set.weight) || 0;
          const r = Number(set.reps) || 0;
          if (w > maxWeight) maxWeight = w;
          volume += w * r;
        }
        points.push({ date: s.date, maxWeight, volume, sessionId: s.id });
      }
      points.sort((a, b) => (a.date < b.date ? -1 : 1));
      return points;
    }
  };

  // Demo Auth — static test/test credentials
  const DemoAuth = {
    currentUser: null,
    profile: null,

    async init() {
      if (!isDemo()) return false;
      this.currentUser = { id: DEMO_USER_ID, email: 'test@demo', user_metadata: { display_name: 'Demo User' } };
      this.profile = { id: DEMO_USER_ID, display_name: 'Demo User', created_at: new Date().toISOString() };
      return true;
    },

    async signIn(login, password) {
      if (login === 'test' && password === 'test') {
        enableDemo();
        this.currentUser = { id: DEMO_USER_ID, email: 'test@demo', user_metadata: { display_name: 'Demo User' } };
        this.profile = { id: DEMO_USER_ID, display_name: 'Demo User', created_at: new Date().toISOString() };
        return this.currentUser;
      }
      throw new Error('Неверный логин/пароль');
    },

    async signUp() { throw new Error('Регистрация недоступна в демо-режиме'); },

    async logout() {
      // Сначала чистим демо-черновик, пока ещё активен demo scope.
      await DB.clearActiveSession();
      disableDemo();
      this.currentUser = null;
      this.profile = null;
      // Перезагрузка — чтобы вернуть настоящие Api/Auth
      location.reload();
    },

    getCurrentUser() {
      if (!this.currentUser) return null;
      return { id: DEMO_USER_ID, email: 'test@demo', name: 'Demo User', joinDate: new Date().toISOString() };
    },

    isLoggedIn() { return this.currentUser !== null; }
  };

  // Activate demo shims — mutate existing Api/Auth in place
  // (scripts use lexical `const Api`/`const Auth`, not window.Api/Auth)
  function activateDemoShims() {
    if (window.Api) {
      Object.keys(DemoApi).forEach((key) => {
        const val = DemoApi[key];
        window.Api[key] = typeof val === 'function' ? val.bind(DemoApi) : val;
      });
    }
    if (window.Auth) {
      window.Auth.signIn = DemoAuth.signIn.bind(DemoAuth);
      window.Auth.signUp = DemoAuth.signUp.bind(DemoAuth);
      window.Auth.logout = DemoAuth.logout.bind(DemoAuth);
      window.Auth.init = DemoAuth.init.bind(DemoAuth);
      window.Auth.getCurrentUser = DemoAuth.getCurrentUser.bind(DemoAuth);
      window.Auth.isLoggedIn = DemoAuth.isLoggedIn.bind(DemoAuth);
      // Keep Auth.currentUser/profile in sync with DemoAuth
      Object.defineProperty(window.Auth, 'currentUser', {
        get() { return DemoAuth.currentUser; },
        set(v) { DemoAuth.currentUser = v; },
        configurable: true
      });
      Object.defineProperty(window.Auth, 'profile', {
        get() { return DemoAuth.profile; },
        set(v) { DemoAuth.profile = v; },
        configurable: true
      });
    }
  }

  // Expose
  window.DemoMode = {
    isDemo,
    enableDemo,
    disableDemo,
    activateDemoShims,
    DemoApi,
    DemoAuth
  };
})();
