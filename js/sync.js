// Export / import JSON <-> cloud
class SyncManager {
  static DATA_SCHEMA_VERSION = '2.1.0';

  static async exportData() {
    const user = Auth.getCurrentUser();
    if (!user) {
      Utils.showToast('Пользователь не авторизован', 'danger');
      return;
    }

    try {
      const [sessions, templates, exercises, planned, bodyWeight, profile] = await Promise.all([
        Api.listSessions(),
        Api.listTemplates(),
        Api.listExercises(),
        Api.listPlanned(),
        Api.listBodyWeight().catch(() => []),
        Api.getProfile().catch(() => null)
      ]);

      const exportData = {
        meta: {
          exportDate: new Date().toISOString(),
          appVersion: window.MYGYM_CONFIG?.APP_VERSION || '1.3.1',
          dataSchemaVersion: this.DATA_SCHEMA_VERSION,
          exporter: 'MyGym PWA'
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          birth_date: profile?.birth_date || null,
          coach_goal: profile?.coach_goal || null,
          coach_inbox: profile?.coach_inbox || null
        },
        sessions,
        templates,
        planned_workouts: planned,
        body_weight_entries: bodyWeight,
        exercises
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mygym-backup-${Utils.getTodayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Utils.showToast(`Экспортировано: ${sessions.length} тренировок, ${templates.length} шаблонов`);
    } catch (error) {
      console.error(error);
      Utils.showToast('Ошибка экспорта: ' + error.message, 'danger');
    }
  }

  static async importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const user = Auth.getCurrentUser();
      if (!user) {
        Utils.showToast('Пользователь не авторизован', 'danger');
        return;
      }

      if (!data.sessions && !data.templates && !data.user && !data.body_weight_entries) {
        Utils.showToast('Файл не содержит данных', 'danger');
        return;
      }

      const bwCount = Array.isArray(data.body_weight_entries) ? data.body_weight_entries.length : 0;
      const confirmed = await Utils.confirm(
        `Импортировать в облако?\n\n` +
        `Тренировок: ${data.sessions ? data.sessions.length : 0}\n` +
        `Шаблонов: ${data.templates ? data.templates.length : 0}\n` +
        `Замеров веса: ${bwCount}\n\n` +
        `Существующие данные не удаляются — записи добавляются/обновляются.`,
        { title: 'Импорт данных', confirmText: 'Импортировать' }
      );
      if (!confirmed) return;

      Utils.showToast('Импорт...', 'info');

      const templateIdMap = {};

      if (data.templates && data.templates.length) {
        for (const t of data.templates) {
          const created = await Api.createTemplate({
            name: t.name || 'Импорт',
            description: t.description || '',
            exercises: (t.exercises || [])
              .map((ex) => ({ exerciseId: ex.exerciseId }))
              .filter((ex) => ex.exerciseId)
          });
          if (t.id) templateIdMap[t.id] = created.id;
        }
      }

      if (data.sessions && data.sessions.length) {
        for (const s of data.sessions) {
          const oldTemplateId = s.templateId || s.template_id;
          const session = {
            id: Utils.generateId(),
            templateId: (oldTemplateId && templateIdMap[oldTemplateId]) || null,
            templateName: s.templateName || s.template_name || 'Импорт',
            date: s.date || s.workout_date || (s.startTime || s.start_time || '').slice(0, 10),
            startTime: s.startTime || s.start_time || new Date().toISOString(),
            endTime: s.endTime || s.end_time || null,
            duration: s.duration || s.duration_sec || 0,
            completed: s.completed !== false && !!(s.endTime || s.end_time),
            notes: s.notes || '',
            exercises: s.exercises || []
          };
          if (!session.date) continue;
          await Api.upsertSession(session);
        }
      }

      if (data.planned_workouts && data.planned_workouts.length) {
        for (const p of data.planned_workouts) {
          const date = p.workout_date || p.date;
          if (!date) continue;
          const tid = p.template_id || p.templateId;
          await Api.upsertPlanned(date, (tid && templateIdMap[tid]) || null);
        }
      }

      if (bwCount) {
        for (const e of data.body_weight_entries) {
          const weightKg = e.weightKg ?? e.weight_kg;
          const measuredOn = e.measuredOn || e.measured_on;
          if (weightKg == null || !measuredOn) continue;
          try {
            await Api.upsertBodyWeight({
              weightKg,
              measuredOn,
              sessionId: e.sessionId || e.session_id || null,
              source: e.source === 'onboarding' ? 'onboarding' : 'workout_end'
            });
          } catch (err) {
            console.warn('body weight import skip', measuredOn, err);
          }
        }
      }

      if (data.user) {
        const patch = {};
        if (data.user.birth_date) patch.birthDate = data.user.birth_date;
        if (data.user.coach_goal) patch.coachGoal = data.user.coach_goal;
        if (data.user.coach_inbox) patch.coachInbox = data.user.coach_inbox;
        if (Object.keys(patch).length) {
          try {
            const updated = await Api.updateProfile(patch);
            if (window.Auth) Auth.profile = updated;
          } catch (err) {
            console.warn('profile import partial', err);
          }
        }
      }

      Utils.showToast('Импорт в облако завершён');
      setTimeout(() => Router.navigate('home'), 400);
    } catch (error) {
      console.error(error);
      Utils.showToast('Ошибка импорта: ' + error.message, 'danger');
    }
  }
}

window.SyncManager = SyncManager;
