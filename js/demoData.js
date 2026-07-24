// Demo / test helpers for profile
const DemoData = {
  async clearAll() {
    const user = Auth.getCurrentUser();
    if (!user) throw new Error('Нужен вход');

    const [sessions, templates, planned] = await Promise.all([
      Api.listSessions(),
      Api.listTemplates(),
      Api.listPlanned()
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
    await DB.clearActiveSession();
  },

  daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return Utils.toDateStr(d);
  },

  isoAt(dateStr, hour, minute) {
    return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).toISOString();
  },

  async seed() {
    await this.clearAll();

    const push = await Api.createTemplate({
      name: 'Тест · Жим / грудь',
      exercises: [
        { exerciseId: 'chest_1', plannedSets: 4, plannedReps: 8 },
        { exerciseId: 'chest_4', plannedSets: 3, plannedReps: 10 },
        { exerciseId: 'chest_2', plannedSets: 3, plannedReps: 10 }
      ]
    });

    const pull = await Api.createTemplate({
      name: 'Тест · Спина',
      exercises: [
        { exerciseId: 'back_1', plannedSets: 4, plannedReps: 8 },
        { exerciseId: 'back_3', plannedSets: 3, plannedReps: 10 },
        { exerciseId: 'back_5', plannedSets: 3, plannedReps: 12 }
      ]
    });

    const legs = await Api.createTemplate({
      name: 'Тест · Ноги',
      exercises: [
        { exerciseId: 'legs_1', plannedSets: 4, plannedReps: 8 },
        { exerciseId: 'legs_3', plannedSets: 3, plannedReps: 10 },
        { exerciseId: 'legs_5', plannedSets: 3, plannedReps: 12 }
      ]
    });

    // Progressive sessions over ~6 weeks (different days — one completed/day)
    const plans = [
      { ago: 42, template: push, base: 60, name: 'Тест · Жим / грудь', ids: ['chest_1', 'chest_4', 'chest_2'] },
      { ago: 39, template: pull, base: 50, name: 'Тест · Спина', ids: ['back_1', 'back_3', 'back_5'] },
      { ago: 35, template: legs, base: 80, name: 'Тест · Ноги', ids: ['legs_1', 'legs_3', 'legs_5'] },
      { ago: 32, template: push, base: 62.5, name: 'Тест · Жим / грудь', ids: ['chest_1', 'chest_4', 'chest_2'] },
      { ago: 28, template: pull, base: 52.5, name: 'Тест · Спина', ids: ['back_1', 'back_3', 'back_5'] },
      { ago: 25, template: legs, base: 85, name: 'Тест · Ноги', ids: ['legs_1', 'legs_3', 'legs_5'] },
      { ago: 21, template: push, base: 65, name: 'Тест · Жим / грудь', ids: ['chest_1', 'chest_4', 'chest_2'] },
      { ago: 18, template: pull, base: 55, name: 'Тест · Спина', ids: ['back_1', 'back_3', 'back_5'] },
      { ago: 14, template: legs, base: 90, name: 'Тест · Ноги', ids: ['legs_1', 'legs_3', 'legs_5'] },
      { ago: 11, template: push, base: 67.5, name: 'Тест · Жим / грудь', ids: ['chest_1', 'chest_4', 'chest_2'] },
      { ago: 7, template: pull, base: 57.5, name: 'Тест · Спина', ids: ['back_1', 'back_3', 'back_5'] },
      { ago: 4, template: legs, base: 95, name: 'Тест · Ноги', ids: ['legs_1', 'legs_3', 'legs_5'] },
      { ago: 2, template: push, base: 70, name: 'Тест · Жим / грудь', ids: ['chest_1', 'chest_4', 'chest_2'] }
    ];

    for (const p of plans) {
      const date = this.daysAgo(p.ago);
      const start = this.isoAt(date, 18, 0);
      const end = this.isoAt(date, 19, 15);
      const exercises = p.ids.map((exerciseId, idx) => {
        const w = p.base + idx * 2.5;
        return {
          exerciseId,
          plannedSets: 3,
          plannedReps: 8,
          completed: true,
          exerciseTime: 300 + idx * 40,
          sets: [
            { weight: w, reps: 8 },
            { weight: w, reps: 7 },
            { weight: Math.max(w - 2.5, 20), reps: 6 }
          ]
        };
      });

      await Api.upsertSession({
        id: Utils.generateId(),
        templateId: p.template.id,
        templateName: p.name,
        date,
        startTime: start,
        endTime: end,
        duration: 75 * 60,
        completed: true,
        notes: 'Тестовая тренировка',
        exercises
      });
    }

    // Future plan + one missed plan
    await Api.upsertPlanned(this.daysAgo(-2), push.id);
    await Api.upsertPlanned(this.daysAgo(1), pull.id);

    return {
      templates: 3,
      sessions: plans.length,
      planned: 2
    };
  }
};

window.DemoData = DemoData;
