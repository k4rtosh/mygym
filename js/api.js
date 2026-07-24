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
    return data || { id: user.id, display_name: user.email, created_at: null };
  },

  async updateProfile(displayName) {
    const user = await this.requireUser();
    const { data, error } = await this.client()
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName })
      .select()
      .single();
    if (error) throw error;
    return data;
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
