class AppRouter {
  constructor() {
    this.currentPage = null;
    this.appContainer = null;
  }

  get container() {
    if (!this.appContainer) this.appContainer = document.getElementById('app');
    return this.appContainer;
  }

  async navigate(path, params = {}) {
    if (path !== 'login' && !Auth.isLoggedIn()) {
      path = 'login';
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
          await ProgressManager.load();
          break;
        default:
          await this.navigate('home');
          return;
      }
      this.currentPage = path;
      if (path === 'login') {
        Utils.hideShellNav();
      } else {
        Utils.setShellNav(Utils.shellNavActiveFor(path));
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
    }
  }

  async fetchPage(url) {
    const response = await fetch(url);
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

    document.getElementById('login-submit')?.addEventListener('click', async () => {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      try {
        await Auth.signIn(email, password);
        Utils.showToast('Добро пожаловать!');
        await Router.navigate('home');
      } catch (e) {
        Utils.showToast(e.message || 'Ошибка входа', 'danger');
      }
    });

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
      if (lastWorkoutInfo && completed.length) {
        const last = completed.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0];
        lastWorkoutInfo.innerHTML = `
          <div class="home-last card">
            <div class="card-body">
              <div class="home-last-label">Последняя тренировка</div>
              <div class="home-last-title">${Utils.escapeHtml(last.templateName)}</div>
              <div class="home-last-meta">
                ${Utils.formatDate(last.date + 'T12:00:00')} · ${Utils.formatTime(last.duration || 0)}
              </div>
            </div>
          </div>
        `;
      }

      const planned = await Api.getPlannedForDate(today);
      const planSlot = document.getElementById('today-plan');
      if (planSlot) {
        if (planned) {
          planSlot.innerHTML = `
            <div class="plan-chip">
              <i class="bi bi-calendar-check"></i>
              Сегодня в плане: <strong>${Utils.escapeHtml(planned.templates?.name || 'свободная')}</strong>
            </div>
          `;
        } else {
          planSlot.innerHTML = '';
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
    document.querySelectorAll('#app-version-display, #update-version-display, #footer-version-display')
      .forEach((el) => { if (el) el.textContent = version; });

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

    document.getElementById('update-app-btn')?.addEventListener('click', () => {
      if (window.clearCacheAndReload) window.clearCacheAndReload();
    });

    document.getElementById('seed-demo-btn')?.addEventListener('click', async () => {
      if (!(await Utils.confirm(
        'Заполнить тестовыми данными?\n\nТекущие шаблоны, тренировки и планы профиля будут удалены и заменены демо-набором.'
      ))) return;
      try {
        Utils.showToast('Заполняю демо...', 'info');
        const res = await DemoData.seed();
        Utils.showToast(`Готово: ${res.templates} шаблона, ${res.sessions} тренировок`);
        Router.navigate('progress');
      } catch (e) {
        Utils.showToast(e.message || 'Ошибка демо', 'danger');
      }
    });

    document.getElementById('clear-data-btn')?.addEventListener('click', async () => {
      if (!(await Utils.confirm(
        'Очистить все данные профиля?\nШаблоны, тренировки и планы будут удалены безвозвратно.'
      ))) return;
      try {
        Utils.showToast('Очищаю...', 'info');
        await DemoData.clearAll();
        Utils.showToast('Данные профиля очищены');
        Router.navigate('home');
      } catch (e) {
        Utils.showToast(e.message || 'Ошибка очистки', 'danger');
      }
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      if (!(await Utils.confirm('Выйти?'))) return;
      await Auth.logout();
      Router.navigate('login');
    });
  }
}

const Router = new AppRouter();
window.Router = Router;
