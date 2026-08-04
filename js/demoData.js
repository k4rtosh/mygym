// Demo / test helpers for profile
const DemoData = {
  /** Bump when seed shape changes — demo login reseeds automatically. */
  SEED_VERSION: 4,
  SEED_VERSION_KEY: 'mygym_demo_seed_version',

  needsReseed() {
    const v = Number(localStorage.getItem(this.SEED_VERSION_KEY) || 0);
    return v < this.SEED_VERSION;
  },

  markSeeded() {
    localStorage.setItem(this.SEED_VERSION_KEY, String(this.SEED_VERSION));
  },

  async clearAll() {
    const user = Auth.getCurrentUser();
    if (!user) throw new Error('Нужен вход');

    const [sessions, templates, planned, weights] = await Promise.all([
      Api.listSessions(),
      Api.listTemplates(),
      Api.listPlanned(),
      Api.listBodyWeight().catch(() => [])
    ]);

    for (const s of sessions) {
      await Api.deleteSession(s.id);
    }
    for (const t of templates) {
      await Api.deleteTemplate(t.id);
    }
    for (const p of planned) {
      await Api.deletePlanned(p.workout_date);
    }
    for (const w of weights) {
      if (w.id) await Api.deleteBodyWeight(w.id);
    }
    await DB.clearActiveSession();
    try {
      localStorage.removeItem(this.SEED_VERSION_KEY);
    } catch (_) { /* ignore */ }

    // Demo profile persists across clear — reset birth/name so seed can re-apply.
    if (window.DemoMode?.isDemo?.()) {
      try {
        localStorage.setItem('mygym_demo_profile', JSON.stringify({
          id: 'demo-user-0000',
          display_name: 'Демо Атлет',
          birth_date: null,
          created_at: new Date().toISOString()
        }));
      } catch (_) { /* ignore */ }
    }
  },

  daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return Utils.toDateStr(d);
  },

  isoAt(dateStr, hour, minute) {
    return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).toISOString();
  },

  buildExerciseBlock(ids, base, opts = {}) {
    const setMult = opts.setMult != null ? opts.setMult : 1;
    const repsBase = opts.repsBase != null ? opts.repsBase : 8;
    return ids.map((exerciseId, idx) => {
      const w = Number((base + idx * 2.5).toFixed(1));
      const w2 = Number(Math.max(w - 2.5, 15).toFixed(1));
      const sets = [
        { weight: w, reps: repsBase },
        { weight: w, reps: Math.max(repsBase - 1, 5) },
        { weight: w2, reps: Math.max(repsBase - 2, 5) }
      ];
      if (setMult >= 1.2) {
        sets.push({ weight: w2, reps: Math.max(repsBase - 2, 4) });
      }
      return {
        exerciseId,
        completed: true,
        exerciseTime: 280 + idx * 45,
        sets
      };
    });
  },

  async seed() {
    await this.clearAll();

    const push = await Api.createTemplate({
      name: 'Демо · Жим / плечи',
      exercises: [
        { exerciseId: 'chest_1' },
        { exerciseId: 'chest_4' },
        { exerciseId: 'shoulders_1' }
      ]
    });

    const pull = await Api.createTemplate({
      name: 'Демо · Спина',
      exercises: [
        { exerciseId: 'back_1' },
        { exerciseId: 'back_3' },
        { exerciseId: 'back_5' }
      ]
    });

    const legs = await Api.createTemplate({
      name: 'Демо · Ноги',
      exercises: [
        { exerciseId: 'legs_1' },
        { exerciseId: 'legs_3' },
        { exerciseId: 'legs_5' }
      ]
    });

    const arms = await Api.createTemplate({
      name: 'Демо · Руки',
      exercises: [
        { exerciseId: 'arms_1' },
        { exerciseId: 'arms_3' },
        { exerciseId: 'arms_7' }
      ]
    });

    const core = await Api.createTemplate({
      name: 'Демо · Кор',
      exercises: [
        { exerciseId: 'core_1' },
        { exerciseId: 'core_2' }
      ]
    });

    // ~12 недель: ранняя полнота (все группы) → сильный mid → лёгкий recent + пропуски.
    // Это даёт коучу/подсказкам warn по простоям, объёму и весу.
    const plans = [
      // Недели 11–9: полный сплит
      { ago: 82, template: push, base: 55, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },
      { ago: 80, template: pull, base: 45, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'high' },
      { ago: 77, template: legs, base: 75, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'high' },
      { ago: 75, template: arms, base: 30, name: arms.name, ids: ['arms_1', 'arms_3', 'arms_7'], vol: 'mid' },
      { ago: 73, template: core, base: 0, name: core.name, ids: ['core_1', 'core_2'], vol: 'bw' },
      { ago: 70, template: push, base: 57.5, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },
      { ago: 68, template: pull, base: 47.5, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'high' },
      { ago: 66, template: legs, base: 77.5, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'high' },
      { ago: 63, template: arms, base: 32.5, name: arms.name, ids: ['arms_1', 'arms_3', 'arms_7'], vol: 'mid' },
      { ago: 61, template: core, base: 0, name: core.name, ids: ['core_1', 'core_2'], vol: 'bw' },

      // Недели 8–6: PPL + руки (кор уже реже — простой)
      { ago: 56, template: push, base: 60, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },
      { ago: 54, template: pull, base: 50, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'high' },
      { ago: 51, template: legs, base: 82.5, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'high' },
      { ago: 49, template: arms, base: 35, name: arms.name, ids: ['arms_1', 'arms_3', 'arms_7'], vol: 'mid' },
      { ago: 47, template: push, base: 62.5, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },
      { ago: 45, template: pull, base: 52.5, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'high' },
      { ago: 42, template: legs, base: 85, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'high' },

      // Prior window (~21–42 дн.): пик объёма PPL, руки/кор/плечи в истории уже «остывают»
      { ago: 39, template: push, base: 65, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },
      { ago: 36, template: pull, base: 55, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'high' },
      { ago: 33, template: legs, base: 90, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'high' },
      { ago: 30, template: push, base: 67.5, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },
      { ago: 27, template: pull, base: 57.5, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'high' },
      { ago: 24, template: legs, base: 92.5, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'high' },
      { ago: 22, template: push, base: 70, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'high' },

      // Recent window: реже и легче → volume regression + меньше частота
      { ago: 18, template: pull, base: 50, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'low' },
      { ago: 14, template: legs, base: 80, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'low' },
      { ago: 10, template: push, base: 60, name: push.name, ids: ['chest_1', 'chest_4', 'shoulders_1'], vol: 'low' },
      { ago: 7, template: pull, base: 47.5, name: pull.name, ids: ['back_1', 'back_3', 'back_5'], vol: 'low' },
      { ago: 5, template: legs, base: 75, name: legs.name, ids: ['legs_1', 'legs_3', 'legs_5'], vol: 'low' }
      // нет сессий за 1–3 дня — серия пропусков по плану
    ];

    for (const p of plans) {
      const date = this.daysAgo(p.ago);
      const start = this.isoAt(date, 18, 0);
      const endHour = p.vol === 'low' ? 18 : 19;
      const endMin = p.vol === 'low' ? 50 : 20;
      const end = this.isoAt(date, endHour, endMin);
      const durationMin = p.vol === 'low' ? 50 : (p.vol === 'bw' ? 35 : 80);

      let exercises;
      if (p.vol === 'bw') {
        exercises = p.ids.map((exerciseId, idx) => ({
          exerciseId,
          completed: true,
          exerciseTime: 200 + idx * 30,
          sets: [
            { weight: 0, reps: 15 },
            { weight: 0, reps: 12 },
            { weight: 0, reps: 10 }
          ]
        }));
      } else {
        const opts = p.vol === 'high'
          ? { setMult: 1.25, repsBase: 8 }
          : p.vol === 'low'
            ? { setMult: 1, repsBase: 6 }
            : { setMult: 1, repsBase: 8 };
        exercises = this.buildExerciseBlock(p.ids, p.base, opts);
      }

      await Api.upsertSession({
        id: Utils.generateId(),
        templateId: p.template.id,
        templateName: p.name,
        date,
        startTime: start,
        endTime: end,
        duration: durationMin * 60,
        completed: true,
        notes: p.vol === 'low' ? 'Лёгкая / укороченная' : 'Демо-тренировка',
        exercises
      });
    }

    // Планы: будущее + серия пропусков 1–3 дня назад + точечные старые пропуски
    await Api.upsertPlanned(this.daysAgo(-1), push.id);
    await Api.upsertPlanned(this.daysAgo(-3), pull.id);
    await Api.upsertPlanned(this.daysAgo(-5), legs.id);
    await Api.upsertPlanned(this.daysAgo(1), push.id);
    await Api.upsertPlanned(this.daysAgo(2), pull.id);
    await Api.upsertPlanned(this.daysAgo(3), legs.id);
    await Api.upsertPlanned(this.daysAgo(8), arms.id);
    await Api.upsertPlanned(this.daysAgo(12), core.id);
    await Api.upsertPlanned(this.daysAgo(16), push.id);
    await Api.upsertPlanned(this.daysAgo(20), pull.id);

    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 28);
    birth.setMonth(3);
    birth.setDate(12);
    await Api.updateProfile({
      displayName: 'Демо Атлет',
      birthDate: Utils.toDateStr(birth),
      coachGoal: {
        intent: 'strength',
        mode: 'normal',
        focusExerciseId: 'chest_1',
        targetFrequency: 3,
        periodFrom: null,
        periodTo: null,
        // Closed pause so coach shows «возврат после простоя»
        lastPause: {
          reason: 'travel',
          periodFrom: this.daysAgo(21),
          periodTo: this.daysAgo(11),
          closedAt: new Date().toISOString()
        }
      }
    });

    // Вес: лёгкий спад в mid → рост в recent при меньшей частоте зала
    const weightSeries = [
      { ago: 82, kg: 81.2 },
      { ago: 75, kg: 81.0 },
      { ago: 68, kg: 80.8 },
      { ago: 61, kg: 80.6 },
      { ago: 54, kg: 80.5 },
      { ago: 47, kg: 80.4 },
      { ago: 40, kg: 80.3 },
      { ago: 33, kg: 80.5 },
      { ago: 27, kg: 80.8 },
      { ago: 20, kg: 81.4 },
      { ago: 14, kg: 81.9 },
      { ago: 9, kg: 82.4 },
      { ago: 5, kg: 82.8 },
      { ago: 2, kg: 83.1 }
    ];
    for (const row of weightSeries) {
      await Api.upsertBodyWeight({
        weightKg: row.kg,
        measuredOn: this.daysAgo(row.ago),
        source: row.ago === 82 ? 'onboarding' : 'workout_end'
      });
    }

    this.markSeeded();

    return {
      templates: 5,
      sessions: plans.length,
      planned: 10,
      bodyWeight: weightSeries.length,
      seedVersion: this.SEED_VERSION
    };
  }
};

window.DemoData = DemoData;
