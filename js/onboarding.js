// First-run profile metrics: birth date + starting body weight
const Onboarding = {
  skipKey(userId) {
    return `mygym_onboarding_skip:${userId || 'anon'}`;
  },

  isSkipped(userId) {
    try {
      return sessionStorage.getItem(this.skipKey(userId)) === '1';
    } catch {
      return false;
    }
  },

  markSkipped(userId) {
    try {
      sessionStorage.setItem(this.skipKey(userId), '1');
    } catch { /* ignore */ }
  },

  clearSkip(userId) {
    try {
      sessionStorage.removeItem(this.skipKey(userId));
    } catch { /* ignore */ }
  },

  async loadState() {
    const profile = await Api.getProfile();
    const latest = await Api.getLatestBodyWeight().catch(() => null);
    const gaps = window.AnalyticsProfile
      ? AnalyticsProfile.profileMetricsGaps(profile, latest)
      : [
          ...(profile?.birth_date ? [] : ['birth_date']),
          ...(latest ? [] : ['weight'])
        ];
    return { profile, latest, gaps, complete: gaps.length === 0 };
  },

  async maybePrompt({ force = false } = {}) {
    if (!Auth.isLoggedIn()) return false;
    const user = Auth.getCurrentUser();
    if (!force && this.isSkipped(user?.id)) return false;

    let state;
    try {
      state = await this.loadState();
    } catch (e) {
      console.warn('onboarding check failed', e);
      return false;
    }
    if (state.complete) return false;

    return this.showForm(state, { force });
  },

  async showForm(state, { force = false } = {}) {
    const needBirth = state.gaps.includes('birth_date');
    const needWeight = state.gaps.includes('weight');
    const fields = [];

    if (needBirth) {
      fields.push({
        name: 'birthDate',
        label: 'Дата рождения',
        type: 'date',
        required: false,
        max: Utils.getTodayStr()
      });
    }
    if (needWeight) {
      fields.push({
        name: 'weightKg',
        label: 'Текущий вес, кг',
        type: 'number',
        required: false,
        min: 30,
        max: 300,
        step: 0.1,
        placeholder: 'например 78.5'
      });
    }
    if (!fields.length) return false;

    const values = await Utils.formModal({
      title: 'Первичные данные',
      message:
        'Укажи дату рождения и текущий вес — это база для графиков и возраста в профиле.\n\n' +
        'Дату рождения потом изменить нельзя. Вес дальше фиксируется только после тренировки.',
      fields,
      confirmText: 'Сохранить',
      cancelText: 'Позже',
      requireAny: true
    });

    const user = Auth.getCurrentUser();
    if (!values) {
      if (!force) this.markSkipped(user?.id);
      return false;
    }

    try {
      if (values.birthDate) {
        await Api.updateProfile({ birthDate: values.birthDate });
        if (Auth.profile) Auth.profile.birth_date = values.birthDate;
      }
      if (values.weightKg != null) {
        await Api.upsertBodyWeight({
          weightKg: values.weightKg,
          measuredOn: Utils.getTodayStr(),
          source: 'onboarding'
        });
      }
      this.clearSkip(user?.id);
      Utils.showToast('Данные сохранены');
      return true;
    } catch (e) {
      Utils.showToast(e.message || 'Не удалось сохранить', 'danger');
      return false;
    }
  },

  async promptBodyWeightAfterWorkout(session) {
    const last = await Api.getLatestBodyWeight().catch(() => null);
    const values = await Utils.formModal({
      title: 'Вес после тренировки',
      message: 'Запиши текущий вес — он попадёт в график «Собственный вес». Можно пропустить.',
      fields: [
        {
          name: 'weightKg',
          label: 'Вес, кг',
          type: 'number',
          required: true,
          min: 30,
          max: 300,
          step: 0.1,
          value: last?.weightKg != null ? String(last.weightKg) : '',
          placeholder: 'кг'
        }
      ],
      confirmText: 'Сохранить',
      cancelText: 'Пропустить'
    });

    if (!values || values.weightKg == null) return null;

    try {
      const saved = await Api.upsertBodyWeight({
        weightKg: values.weightKg,
        measuredOn: session?.date || Utils.getTodayStr(),
        sessionId: session?.id || null,
        source: 'workout_end'
      });
      Utils.showToast(`Вес ${saved.weightKg} кг сохранён`);
      return saved;
    } catch (e) {
      Utils.showToast(e.message || 'Не удалось сохранить вес', 'danger');
      return null;
    }
  }
};

window.Onboarding = Onboarding;
