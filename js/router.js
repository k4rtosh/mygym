class AppRouter {
  constructor() {
    this.currentPage = null;
    this.currentParams = {};
    this.appContainer = null;
    /** @type {Array<{path:string, params:object}>} */
    this.stack = [];
    this._popHandling = false;
    this._historyReady = false;
  }

  get container() {
    if (!this.appContainer) this.appContainer = document.getElementById('app');
    return this.appContainer;
  }

  isRootTab(path) {
    return ['home', 'calendar', 'templates', 'progress', 'profile', 'login'].includes(path);
  }

  parentOf(path) {
    const map = {
      'history-detail': 'history',
      history: 'home',
      'template-edit': 'templates',
      workout: 'home',
      'active-workout': 'home',
      exercises: 'profile',
      'progress-exercises': 'progress',
      'progress-body-weight': 'progress',
      'progress-missed': 'progress',
      'progress-insights': 'progress'
    };
    return map[path] || null;
  }

  /**
   * @param {string} path
   * @param {object} [params]
   * @param {{ replace?: boolean, fromPop?: boolean, silent?: boolean }} [options]
   * silent: re-enter same page without pushing history (PTR).
   */
  async navigate(path, params = {}, options = {}) {
    const { replace = false, fromPop = false, silent = false } = options;

    if (path !== 'login' && !Auth.isLoggedIn()) {
      path = 'login';
    }

    // Leaving active workout must kill intervals — otherwise they become orphans
    if (this.currentPage === 'active-workout' && path !== 'active-workout') {
      if (window.WorkoutManager?.pauseSessionUi) {
        WorkoutManager.pauseSessionUi();
      }
    }

    try {
      switch (path) {
        case 'login':
          this.container.innerHTML = await this.fetchPage('pages/login.html');
          await this.initLoginPage();
          break;
        case 'home':
          this.container.innerHTML = await this.fetchPage('pages/home.html');
          await this.initHomePage();
          break;
        case 'templates':
          await TemplatesManager.loadTemplatesList();
          break;
        case 'template-edit':
          await TemplatesManager.loadTemplateEditor(params.id);
          break;
        case 'workout':
          await WorkoutManager.loadStartWorkout();
          break;
        case 'active-workout':
          await WorkoutManager.startActiveWorkout(params.sessionId);
          break;
        case 'history':
          await HistoryManager.loadHistoryList();
          break;
        case 'history-detail':
          await HistoryManager.loadHistoryDetail(params.sessionId);
          break;
        case 'exercises':
          await ExercisesManager.loadExercisesList();
          break;
        case 'profile':
          this.container.innerHTML = await this.fetchPage('pages/profile.html');
          await this.initProfilePage();
          break;
        case 'calendar':
          await CalendarManager.load();
          break;
        case 'progress':
          await ProgressManager.loadHub();
          break;
        case 'progress-exercises':
          await ProgressManager.loadExercises();
          break;
        case 'progress-body-weight':
          await ProgressManager.loadBodyWeight();
          break;
        case 'progress-missed':
          await ProgressManager.loadMissed();
          break;
        case 'progress-insights':
          await ProgressManager.loadInsights();
          break;
        default:
          await this.navigate('home', {}, { replace: true });
          return;
      }
      this.currentPage = path;
      this.currentParams = { ...params };
      document.body.classList.toggle('is-workout-session', path === 'active-workout');
      if (path === 'login' || path === 'active-workout') {
        Utils.hideShellNav();
      } else {
        Utils.setShellNav(Utils.shellNavActiveFor(path));
      }
      if (window.DemoMode?.isDemo?.() && window.showDemoBadge) {
        window.showDemoBadge();
      }

      if (!fromPop && !silent) {
        this.syncHistory(path, params, replace || this.isRootTab(path));
      }
    } catch (error) {
      console.error(error);
      this.container.innerHTML = `
        <div class="container mt-5 text-center">
          <h3>Ошибка</h3>
          <p>${Utils.escapeHtml(error.message)}</p>
          <button class="btn btn-primary" onclick="Router.navigate('home')">На главную</button>
        </div>
      `;
      Utils.setShellNav('home');
      return;
    }

    // Never let gesture chrome fail a successful page render.
    try {
      this.bindPageGestures();
    } catch (gestureErr) {
      console.warn('bindPageGestures', gestureErr);
    }
  }

  syncHistory(path, params, replace) {
    const entry = { path, params: { ...params } };
    if (replace || !this.stack.length) {
      this.stack = [entry];
      try {
        history.replaceState({ mygym: true, path, params: entry.params }, '');
      } catch { /* ignore */ }
    } else {
      this.stack.push(entry);
      try {
        history.pushState({ mygym: true, path, params: entry.params }, '');
      } catch { /* ignore */ }
    }
    this._historyReady = true;
  }

  bindPageGestures() {
    // Aggressive PTR / swipe-back removed — they degraded web UX.
    if (window.Gestures?.bindPagePullToRefresh) {
      Gestures.bindPagePullToRefresh();
    }
    if (this._swipeBackDispose) {
      this._swipeBackDispose();
      this._swipeBackDispose = null;
    }
  }

  /** Browser / Android WebView history pop. */
  async handlePopState(state) {
    if (this._popHandling) return;
    this._popHandling = true;
    try {
      // Browser already popped. If a modal was open, dismiss and re-push
      // current route so history stays in sync with the UI.
      if (this.dismissOpenModal()) {
        const cur = this.stack[this.stack.length - 1] || {
          path: this.currentPage || 'home',
          params: this.currentParams || {}
        };
        try {
          history.pushState(
            { mygym: true, path: cur.path, params: cur.params || {} },
            ''
          );
        } catch { /* ignore */ }
        return;
      }

      if (state?.mygym && state.path) {
        if (this.stack.length > 1) this.stack.pop();
        await this.navigate(state.path, state.params || {}, { fromPop: true });
        return;
      }

      if (this.stack.length > 1) {
        this.stack.pop();
        const prev = this.stack[this.stack.length - 1];
        await this.navigate(prev.path, prev.params || {}, { fromPop: true });
        return;
      }

      const parent = this.parentOf(this.currentPage);
      if (parent) {
        await this.navigate(parent, {}, { replace: true });
      }
    } finally {
      this._popHandling = false;
    }
  }

  dismissOpenModal() {
    const open = document.querySelector('.modal.show');
    if (!open) return false;
    const inst = bootstrap.Modal.getInstance(open);
    if (inst) inst.hide();
    else open.querySelector('[data-bs-dismiss="modal"]')?.click();
    return true;
  }

  /**
   * System back / swipe-back.
   * @returns {boolean} true if handled
   */
  handleHardwareBack() {
    if (this.dismissOpenModal()) return true;

    if (this.currentPage === 'active-workout' && window.WorkoutManager) {
      if (WorkoutManager.sessionView === 'exercise') {
        WorkoutManager.backToList();
        return true;
      }
      WorkoutManager.minimizeSession();
      return true;
    }

    if (this.stack.length > 1) {
      history.back();
      return true;
    }

    const parent = this.parentOf(this.currentPage);
    if (parent && parent !== this.currentPage) {
      this.navigate(parent, {}, { replace: true });
      return true;
    }

    if (this.currentPage && this.currentPage !== 'home' && this.currentPage !== 'login') {
      this.navigate('home', {}, { replace: true });
      return true;
    }
    return false;
  }

  back() {
    return this.handleHardwareBack();
  }

  initHistory() {
    window.addEventListener('popstate', (e) => {
      this.handlePopState(e.state);
    });

    // Capacitor App plugin (if installed) — otherwise WebView uses history.
    try {
      const App = window.Capacitor?.Plugins?.App;
      if (App?.addListener) {
        App.addListener('backButton', () => {
          if (!this.handleHardwareBack()) {
            App.exitApp?.();
          }
        });
      }
    } catch { /* optional */ }
  }

  async fetchPage(url) {
    const path = String(url || '').replace(/^\//, '');
    const resolved = window.MYGYM_CONFIG?.url
      ? MYGYM_CONFIG.url(path)
      : url;
    const response = await fetch(resolved);
    if (!response.ok) throw new Error('Не удалось загрузить страницу');
    return response.text();
  }

  async initLoginPage() {
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    const showLogin = () => {
      loginForm.classList.remove('d-none');
      signupForm.classList.add('d-none');
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
    };
    const showSignup = () => {
      signupForm.classList.remove('d-none');
      loginForm.classList.add('d-none');
      tabSignup.classList.add('active');
      tabLogin.classList.remove('active');
    };

    tabLogin?.addEventListener('click', showLogin);
    tabSignup?.addEventListener('click', showSignup);

    const ver = window.MYGYM_CONFIG?.APP_VERSION || '2.5.1';
    const verEl = document.getElementById('login-version');
    if (verEl) verEl.textContent = ver;

    document.getElementById('login-submit')?.addEventListener('click', async () => {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      try {
        await Auth.signIn(email, password);
        Utils.showToast('Добро пожаловать!');
        await Router.navigate('home');
        if (window.Onboarding?.maybePrompt) Onboarding.maybePrompt().catch(() => {});
      } catch (e) {
        Utils.showToast(e.message || 'Ошибка входа', 'danger');
      }
    });

    document.getElementById('demo-login-btn')?.addEventListener('click', async () => {
      try {
        window.DemoMode.enableDemo();
        window.DemoMode.activateDemoShims();
        await Auth.signIn('test', 'test');
        // Auto-seed demo data if empty or seed schema bumped
        const sessions = await Api.listSessions();
        if (!sessions.length || DemoData.needsReseed?.()) {
          Utils.showToast('Заполняю демо-данные...', 'info');
          await DemoData.seed();
        }
        if (window.showDemoBadge) window.showDemoBadge();
        Utils.showToast('Добро пожаловать в демо!');
        await Router.navigate('home');
      } catch (e) {
        console.error(e);
        Utils.showToast(e.message || 'Ошибка демо', 'danger');
      }
    });

    // Если ввели test/test в обычные поля — тоже открываем демо
    document.getElementById('login-submit')?.addEventListener('click', async (e) => {
      const email = (document.getElementById('login-email')?.value || '').trim();
      const password = document.getElementById('login-password')?.value || '';
      if (email === 'test' && password === 'test') {
        e.stopImmediatePropagation();
        document.getElementById('demo-login-btn')?.click();
      }
    }, true);

    document.getElementById('signup-submit')?.addEventListener('click', async () => {
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      if (!password || password.length < 6) {
        Utils.showToast('Пароль минимум 6 символов', 'warning');
        return;
      }
      try {
        const result = await Auth.signUp(email, password, name);
        if (result.needsConfirmation) {
          Utils.showToast('Проверь почту для подтверждения, затем войди', 'info');
          showLogin();
        } else {
          Utils.showToast('Аккаунт создан!');
          await Router.navigate('home');
          if (window.Onboarding?.maybePrompt) Onboarding.maybePrompt().catch(() => {});
        }
      } catch (e) {
        Utils.showToast(e.message || 'Ошибка регистрации', 'danger');
      }
    });
  }

  async initHomePage() {
    const user = Auth.getCurrentUser();
    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = `Привет, ${user?.name || ''}!`;

    const draft = await DB.loadActiveSession();
    const banner = document.getElementById('active-workout-banner');
    const startBtn = document.getElementById('start-workout-btn');

    if (banner) {
      if (draft && draft.id && !draft.endTime) {
        banner.innerHTML = `
          <div class="card active-resume-card mb-3">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="home-last-label">Тренировка в процессе</div>
                  <div class="home-last-title">${Utils.escapeHtml(draft.templateName || 'Тренировка')}</div>
                </div>
                <span class="badge bg-warning">Активна</span>
              </div>
              <button class="btn btn-primary w-100 mt-3" id="resume-workout-btn">
                <i class="bi bi-play-fill"></i> Продолжить тренировку
              </button>
            </div>
          </div>
        `;
        document.getElementById('resume-workout-btn')?.addEventListener('click', () => {
          Router.navigate('active-workout', { sessionId: draft.id });
        });
        if (startBtn) {
          startBtn.innerHTML = '<i class="bi bi-exclamation-circle"></i> Есть активная · начать новую?';
        }
      } else {
        banner.innerHTML = '';
      }
    }

    try {
      const sessions = await Api.listSessions();
      const today = Utils.getTodayStr();
      const todaySessions = sessions.filter((s) => s.date === today && s.completed);
      const weekSessions = this.getThisWeekSessions(sessions.filter((s) => s.completed));

      const statToday = document.getElementById('stat-today');
      const statWeek = document.getElementById('stat-week');
      const statTotal = document.getElementById('stat-total');
      if (statToday) statToday.textContent = todaySessions.length;
      if (statWeek) statWeek.textContent = weekSessions.length;
      if (statTotal) statTotal.textContent = sessions.filter((s) => s.completed).length;

      const lastWorkoutInfo = document.getElementById('last-workout-info');
      const completed = sessions.filter((s) => s.completed && s.endTime);
      if (lastWorkoutInfo) {
        if (completed.length) {
          const last = completed.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0];
          lastWorkoutInfo.innerHTML = `
            <button type="button" class="home-last card home-last-clickable w-100 text-start"
              id="last-workout-open" data-session-id="${Utils.escapeHtml(last.id)}">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <div class="home-last-label">Последняя тренировка</div>
                    <div class="home-last-title">${Utils.escapeHtml(last.templateName)}</div>
                    <div class="home-last-meta">
                      ${Utils.formatDate(last.date + 'T12:00:00')} · ${Utils.formatTime(last.duration || 0)}
                    </div>
                  </div>
                  <i class="bi bi-chevron-right home-last-chevron" aria-hidden="true"></i>
                </div>
              </div>
            </button>
          `;
          document.getElementById('last-workout-open')?.addEventListener('click', () => {
            Router.navigate('history-detail', { sessionId: last.id });
          });
        } else {
          lastWorkoutInfo.innerHTML = Utils.emptyStateHtml({
            icon: 'bi-flag',
            title: 'Ещё нет завершённых тренировок',
            text: 'После первой сохранённой сессии здесь появится быстрый доступ к ней.'
          });
        }
      }

      const planned = await Api.getPlannedForDate(today);
      const planSlot = document.getElementById('today-plan');
      if (planSlot) {
        if (planned) {
          planSlot.innerHTML = `
            <div class="home-today-card has-plan">
              <div class="home-today-label">Сегодня в плане</div>
              <div class="home-today-title">${Utils.escapeHtml(planned.templates?.name || 'Свободная тренировка')}</div>
              <button type="button" class="btn btn-link btn-sm text-muted px-0 home-today-link"
                onclick="Router.navigate('calendar')">
                Открыть календарь
              </button>
            </div>
          `;
        } else {
          planSlot.innerHTML = `
            <div class="home-today-card">
              <div class="home-today-label">Сегодня</div>
              <div class="home-today-title">Плана пока нет</div>
              <div class="home-today-actions">
                <button type="button" class="btn btn-outline-light btn-sm" id="home-plan-today-btn">
                  <i class="bi bi-calendar-plus"></i> Запланировать
                </button>
                <button type="button" class="btn btn-link btn-sm text-muted" onclick="Router.navigate('calendar')">
                  Календарь
                </button>
              </div>
            </div>
          `;
          document.getElementById('home-plan-today-btn')?.addEventListener('click', () => {
            if (window.CalendarManager?.quickPlan) {
              CalendarManager.quickPlan(today);
            } else {
              Router.navigate('calendar');
            }
          });
        }
      }
    } catch (e) {
      Utils.showToast(e.message || 'Нет сети', 'warning');
    }

    startBtn?.addEventListener('click', async () => {
      const gate = await WorkoutManager.guardActiveWorkout();
      if (gate === 'resumed' || gate === 'abort') return;
      Router.navigate('workout');
    });
  }

  getThisWeekSessions(sessions) {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = (now.getDay() + 6) % 7;
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);
    return sessions.filter((s) => {
      const d = new Date(s.date + 'T12:00:00');
      return d >= startOfWeek;
    });
  }

  async initProfilePage() {
    const user = Auth.getCurrentUser();
    const profileName = document.getElementById('profile-name');
    const profileJoinDate = document.getElementById('profile-join-date');
    if (profileName) profileName.textContent = user?.name || '';
    if (profileJoinDate) {
      profileJoinDate.textContent = user?.joinDate
        ? Utils.formatDate(user.joinDate)
        : '—';
    }

    const version = window.MYGYM_CONFIG?.APP_VERSION || '2.0.0';
    const versionLabel = version.startsWith('v') ? version : `v${version}`;
    document.querySelectorAll('#app-version-display, #update-version-display, #footer-version-display')
      .forEach((el) => { if (el) el.textContent = version; });
    const updateBadge = document.getElementById('profile-update-badge');
    if (updateBadge) updateBadge.textContent = versionLabel;

    const footerNote = document.querySelector('#profile-footer-note');
    if (footerNote) {
      const isDemo = window.DemoMode?.isDemo?.();
      footerNote.textContent = isDemo ? 'данные хранятся локально' : 'данные в Supabase';
    }

    await this.refreshProfileMetrics();

    if (window.UpdateCheck) {
      UpdateCheck.refreshProfileUI().catch(() => {});
    }

    document.getElementById('profile-fill-metrics-btn')?.addEventListener('click', async () => {
      if (!window.Onboarding) return;
      const ok = await Onboarding.maybePrompt({ force: true });
      if (ok) await this.refreshProfileMetrics();
    });

    document.getElementById('export-data-btn')?.addEventListener('click', () => SyncManager.exportData());
    document.getElementById('import-data-btn')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) await SyncManager.importData(file);
      };
      input.click();
    });

    document.getElementById('open-exercises-btn')?.addEventListener('click', () => {
      Router.navigate('exercises');
    });

    document.getElementById('clear-data-btn')?.addEventListener('click', async () => {
      const confirmed = await Utils.confirmPhrase({
        title: 'Очистить все данные?',
        message: 'Будут удалены все шаблоны, тренировки, планы и замеры веса. Восстановить данные будет невозможно.',
        phrase: 'ОЧИСТКА'
      });
      if (!confirmed) return;
      try {
        Utils.showToast('Очищаю...', 'info');
        await DemoData.clearAll();
        Utils.showToast('Данные очищены');
        Router.navigate('home');
      } catch (e) {
        Utils.showToast(e.message || 'Ошибка очистки', 'danger');
      }
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      if (!(await Utils.confirm('Выйти из аккаунта?', { title: 'Выход', confirmText: 'Выйти' }))) return;
      await Auth.logout();
      Router.navigate('login');
    });
  }

  async refreshProfileMetrics() {
    const ageEl = document.getElementById('profile-age');
    const weightEl = document.getElementById('profile-weight');
    const fillBtn = document.getElementById('profile-fill-metrics-btn');
    const note = document.getElementById('profile-metrics-note');
    if (!ageEl && !weightEl) return;

    let profile = null;
    let latest = null;
    try {
      profile = await Api.getProfile();
      latest = await Api.getLatestBodyWeight();
    } catch (e) {
      console.warn('profile metrics', e);
    }

    const age = window.AnalyticsProfile?.ageFromBirthDate?.(profile?.birth_date);
    if (ageEl) {
      ageEl.textContent = age != null ? `${age}` : '—';
    }
    if (weightEl) {
      weightEl.textContent = latest?.weightKg != null ? `${latest.weightKg} кг` : '—';
    }

    const gaps = window.AnalyticsProfile
      ? AnalyticsProfile.profileMetricsGaps(profile, latest)
      : [];
    const incomplete = gaps.length > 0;
    fillBtn?.classList.toggle('d-none', !incomplete);
    note?.classList.toggle('d-none', false);
  }
}

const Router = new AppRouter();
window.Router = Router;
Router.initHistory();
