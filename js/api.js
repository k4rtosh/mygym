// Cloud API — Supabase is source of truth
const Api = {
  /** In-memory list cache — cuts repeat Supabase roundtrips between screens. */
  _cache: {
    user: null,
    userAt: 0,
    sessions: null,
    sessionsAt: 0,
    sessionsPromise: null,
    templates: null,
    templatesAt: 0,
    templatesPromise: null,
    exercises: null,
    exercisesAt: 0,
    exercisesPromise: null,
    planned: Object.create(null), // key -> { at, data, promise }
    bodyWeight: null,
    bodyWeightAt: 0,
    bodyWeightPromise: null,
    latestBw: null,
    latestBwAt: 0
  },

  LIST_TTL_MS: 45000,
  EXERCISES_TTL_MS: 10 * 60 * 1000,
  USER_TTL_MS: 5 * 60 * 1000,

  client() {
    if (!window.supabaseClient) {
      throw new Error('Нет подключения к облаку');
    }
    return window.supabaseClient;
  },

  invalidateCache(keys) {
    const c = this._cache;
    const all = !keys || keys === 'all' || (Array.isArray(keys) && keys.includes('all'));
    const has = (k) => all || keys === k || (Array.isArray(keys) && keys.includes(k));
    if (has('user')) {
      c.user = null;
      c.userAt = 0;
    }
    if (has('sessions')) {
      c.sessions = null;
      c.sessionsAt = 0;
      c.sessionsPromise = null;
    }
    if (has('templates')) {
      c.templates = null;
      c.templatesAt = 0;
      c.templatesPromise = null;
    }
    if (has('exercises')) {
      c.exercises = null;
      c.exercisesAt = 0;
      c.exercisesPromise = null;
    }
    if (has('planned')) {
      c.planned = Object.create(null);
    }
    if (has('bodyWeight')) {
      c.bodyWeight = null;
      c.bodyWeightAt = 0;
      c.bodyWeightPromise = null;
      c.latestBw = null;
      c.latestBwAt = 0;
    }
  },

  /**
   * Prefer Auth / local session — avoid auth.getUser() network on every CRUD.
   */
  async requireUser() {
    if (window.Auth?.currentUser) {
      this._cache.user = Auth.currentUser;
      this._cache.userAt = Date.now();
      return Auth.currentUser;
    }

    const now = Date.now();
    if (this._cache.user && now - this._cache.userAt < this.USER_TTL_MS) {
      return this._cache.user;
    }

    const { data: { session }, error } = await this.client().auth.getSession();
    if (error || !session?.user) throw new Error('Нужен вход в аккаунт');

    this._cache.user = session.user;
    this._cache.userAt = now;
    if (window.Auth) Auth.currentUser = session.user;
    return session.user;
  },

  async getProfile() {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data || {
      id: user.id,
      display_name: user.email,
      birth_date: null,
      created_at: null
    };
  },

  /**
   * @param {string|{displayName?: string, birthDate?: string|null}} patch
   * birthDate can only be set when currently empty (immutable afterwards).
   */
  async updateProfile(patch) {
    const user = await this.requireUser();
    const current = await this.getProfile();
    const payload = { id: user.id };

    if (typeof patch === 'string') {
      payload.display_name = patch;
    } else if (patch && typeof patch === 'object') {
      if (patch.displayName != null) payload.display_name = patch.displayName;
      if (patch.birthDate !== undefined && patch.birthDate !== null && patch.birthDate !== '') {
        if (current.birth_date && current.birth_date !== patch.birthDate) {
          throw new Error('Дата рождения уже задана и не меняется');
        }
        if (!current.birth_date) payload.birth_date = String(patch.birthDate).slice(0, 10);
      }
    }

    if (payload.display_name == null) {
      payload.display_name = current.display_name || user.email || '';
    }

    const { data, error } = await this.client()
      .from('profiles')
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  normalizeBodyWeight(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      weightKg: Number(row.weight_kg),
      measuredOn: row.measured_on,
      sessionId: row.session_id || null,
      source: row.source || 'workout_end',
      createdAt: row.created_at
    };
  },

  async listBodyWeight(opts = {}) {
    const force = !!opts.force;
    const c = this._cache;
    const now = Date.now();
    if (!force && c.bodyWeight && now - c.bodyWeightAt < this.LIST_TTL_MS) {
      return c.bodyWeight.slice();
    }
    if (!force && c.bodyWeightPromise) return c.bodyWeightPromise;

    c.bodyWeightPromise = (async () => {
      try {
        const user = await this.requireUser();
        const { data, error } = await this.client()
          .from('body_weight_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('measured_on', { ascending: true });
        if (error) throw error;
        const rows = (data || []).map((r) => this.normalizeBodyWeight(r));
        c.bodyWeight = rows;
        c.bodyWeightAt = Date.now();
        if (rows.length) {
          c.latestBw = rows[rows.length - 1];
          c.latestBwAt = c.bodyWeightAt;
        }
        return rows.slice();
      } finally {
        c.bodyWeightPromise = null;
      }
    })();
    return c.bodyWeightPromise;
  },

  async getLatestBodyWeight(opts = {}) {
    const force = !!opts.force;
    const c = this._cache;
    const now = Date.now();
    if (!force && c.latestBw && now - c.latestBwAt < this.LIST_TTL_MS) {
      return c.latestBw;
    }
    if (!force && c.bodyWeight && now - c.bodyWeightAt < this.LIST_TTL_MS) {
      const last = c.bodyWeight.length ? c.bodyWeight[c.bodyWeight.length - 1] : null;
      c.latestBw = last;
      c.latestBwAt = now;
      return last;
    }

    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('body_weight_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('measured_on', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = this.normalizeBodyWeight(data);
    c.latestBw = row;
    c.latestBwAt = Date.now();
    return row;
  },

  /**
   * Upsert one entry per calendar day.
   * @param {{ weightKg: number, measuredOn?: string, sessionId?: string|null, source?: string }} entry
   */
  async upsertBodyWeight(entry) {
    const user = await this.requireUser();
    const weightKg = Number(entry.weightKg);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg >= 500) {
      throw new Error('Укажи вес от 1 до 499 кг');
    }
    const measuredOn = entry.measuredOn || Utils.getTodayStr();
    const source = entry.source === 'onboarding' ? 'onboarding' : 'workout_end';
    const row = {
      user_id: user.id,
      weight_kg: Math.round(weightKg * 100) / 100,
      measured_on: measuredOn,
      session_id: entry.sessionId || null,
      source
    };
    const { data, error } = await this.client()
      .from('body_weight_entries')
      .upsert(row, { onConflict: 'user_id,measured_on' })
      .select()
      .single();
    if (error) throw error;
    this.invalidateCache('bodyWeight');
    return this.normalizeBodyWeight(data);
  },

  async deleteBodyWeight(id) {
    const { error } = await this.client()
      .from('body_weight_entries')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.invalidateCache('bodyWeight');
  },

  async listExercises(opts = {}) {
    const force = !!opts.force;
    const c = this._cache;
    const now = Date.now();
    if (!force && c.exercises && now - c.exercisesAt < this.EXERCISES_TTL_MS) {
      return c.exercises.slice();
    }
    if (!force && c.exercisesPromise) return c.exercisesPromise;

    c.exercisesPromise = (async () => {
      try {
        const { data, error } = await this.client()
          .from('exercises')
          .select('*')
          .order('category')
          .order('name');
        if (error) throw error;
        const rows = data || [];
        c.exercises = rows;
        c.exercisesAt = Date.now();
        return rows.slice();
      } finally {
        c.exercisesPromise = null;
      }
    })();
    return c.exercisesPromise;
  },

  async listTemplates(opts = {}) {
    const force = !!opts.force;
    const c = this._cache;
    const now = Date.now();
    if (!force && c.templates && now - c.templatesAt < this.LIST_TTL_MS) {
      return c.templates.slice();
    }
    if (!force && c.templatesPromise) return c.templatesPromise;

    c.templatesPromise = (async () => {
      try {
        const user = await this.requireUser();
        const { data, error } = await this.client()
          .from('templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const rows = data || [];
        c.templates = rows;
        c.templatesAt = Date.now();
        return rows.slice();
      } finally {
        c.templatesPromise = null;
      }
    })();
    return c.templatesPromise;
  },

  async getTemplate(id) {
    const cached = this._cache.templates?.find((t) => t.id === id);
    if (cached) return cached;
    const { data, error } = await this.client()
      .from('templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createTemplate(partial = {}) {
    const user = await this.requireUser();
    const row = {
      user_id: user.id,
      name: partial.name || 'Новый шаблон',
      description: partial.description || '',
      exercises: partial.exercises || []
    };
    const { data, error } = await this.client()
      .from('templates')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    this.invalidateCache(['templates', 'planned']);
    return data;
  },

  async updateTemplate(id, patch) {
    const payload = { ...patch, updated_at: new Date().toISOString() };
    delete payload.id;
    delete payload.user_id;
    const { data, error } = await this.client()
      .from('templates')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    this.invalidateCache(['templates', 'planned']);
    return data;
  },

  async deleteTemplate(id) {
    const { error } = await this.client().from('templates').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache(['templates', 'planned']);
  },

  async listSessions(opts = {}) {
    const force = !!opts.force;
    const c = this._cache;
    const now = Date.now();
    if (!force && c.sessions && now - c.sessionsAt < this.LIST_TTL_MS) {
      return c.sessions.slice();
    }
    if (!force && c.sessionsPromise) return c.sessionsPromise;

    c.sessionsPromise = (async () => {
      try {
        const user = await this.requireUser();
        const { data, error } = await this.client()
          .from('sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('start_time', { ascending: false });
        if (error) throw error;
        const rows = (data || []).map((r) => this.normalizeSession(r));
        c.sessions = rows;
        c.sessionsAt = Date.now();
        return rows.slice();
      } finally {
        c.sessionsPromise = null;
      }
    })();
    return c.sessionsPromise;
  },

  async getSession(id) {
    const cached = this._cache.sessions?.find((s) => s.id === id);
    if (cached) return { ...cached, exercises: cached.exercises };
    const { data, error } = await this.client()
      .from('sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return this.normalizeSession(data);
  },

  async upsertSession(session) {
    const user = await this.requireUser();
    const row = {
      id: session.id,
      user_id: user.id,
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
    const { data, error } = await this.client()
      .from('sessions')
      .upsert(row)
      .select()
      .single();
    if (error) throw error;
    this.invalidateCache('sessions');
    return this.normalizeSession(data);
  },

  async deleteSession(id) {
    const { error } = await this.client().from('sessions').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache('sessions');
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

  _plannedKey(fromDate, toDate) {
    return `${fromDate || ''}|${toDate || ''}`;
  },

  async listPlanned(fromDate, toDate, opts = {}) {
    const force = !!opts.force;
    const key = this._plannedKey(fromDate, toDate);
    const c = this._cache;
    const now = Date.now();
    const hit = c.planned[key];
    if (!force && hit?.data && now - hit.at < this.LIST_TTL_MS) {
      return hit.data.slice();
    }
    if (!force && hit?.promise) return hit.promise;

    const entry = hit || (c.planned[key] = { at: 0, data: null, promise: null });
    entry.promise = (async () => {
      try {
        const user = await this.requireUser();
        let q = this.client()
          .from('planned_workouts')
          .select('*, templates(id, name)')
          .eq('user_id', user.id)
          .order('workout_date');
        if (fromDate) q = q.gte('workout_date', fromDate);
        if (toDate) q = q.lte('workout_date', toDate);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data || [];
        entry.data = rows;
        entry.at = Date.now();
        return rows.slice();
      } finally {
        entry.promise = null;
      }
    })();
    return entry.promise;
  },

  async getPlannedForDate(dateStr) {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('planned_workouts')
      .select('*, templates(id, name)')
      .eq('user_id', user.id)
      .eq('workout_date', dateStr)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertPlanned(dateStr, templateId) {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('planned_workouts')
      .upsert(
        {
          user_id: user.id,
          workout_date: dateStr,
          template_id: templateId || null
        },
        { onConflict: 'user_id,workout_date' }
      )
      .select('*, templates(id, name)')
      .single();
    if (error) throw error;
    this.invalidateCache('planned');
    return data;
  },

  async deletePlanned(dateStr) {
    const user = await this.requireUser();
    const { error } = await this.client()
      .from('planned_workouts')
      .delete()
      .eq('user_id', user.id)
      .eq('workout_date', dateStr);
    if (error) throw error;
    this.invalidateCache('planned');
  },

  async getExerciseProgress(exerciseId) {
    const rows = await this.listSessions();
    const points = [];
    for (const s of rows) {
      if (!s.completed || !s.endTime) continue;
      const ex = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
      if (!ex || !ex.sets || !ex.sets.length) continue;
      let maxWeight = 0;
      let volume = 0;
      for (const set of ex.sets) {
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;
        if (w > maxWeight) maxWeight = w;
        volume += w * r;
      }
      points.push({
        date: s.date,
        maxWeight,
        volume,
        sessionId: s.id
      });
    }
    points.sort((a, b) => (a.date < b.date ? -1 : 1));
    return points;
  }
};

window.Api = Api;
