// Cloud API — Supabase is source of truth
const Api = {
  client() {
    if (!window.supabaseClient) {
      throw new Error('Нет подключения к облаку');
    }
    return window.supabaseClient;
  },

  async requireUser() {
    const { data: { user }, error } = await this.client().auth.getUser();
    if (error || !user) throw new Error('Нужен вход в аккаунт');
    return user;
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

  async listBodyWeight() {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('body_weight_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('measured_on', { ascending: true });
    if (error) throw error;
    return (data || []).map((r) => this.normalizeBodyWeight(r));
  },

  async getLatestBodyWeight() {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('body_weight_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('measured_on', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return this.normalizeBodyWeight(data);
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
    return this.normalizeBodyWeight(data);
  },

  async deleteBodyWeight(id) {
    const { error } = await this.client()
      .from('body_weight_entries')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async listExercises() {
    const { data, error } = await this.client()
      .from('exercises')
      .select('*')
      .order('category')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async listTemplates() {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getTemplate(id) {
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
    return data;
  },

  async deleteTemplate(id) {
    const { error } = await this.client().from('templates').delete().eq('id', id);
    if (error) throw error;
  },

  async listSessions() {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => this.normalizeSession(r));
  },

  async getSession(id) {
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
    return this.normalizeSession(data);
  },

  async deleteSession(id) {
    const { error } = await this.client().from('sessions').delete().eq('id', id);
    if (error) throw error;
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
    return data || [];
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
