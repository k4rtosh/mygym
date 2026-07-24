// Простой роутер для SPA

class AppRouter {
    constructor() {
        this.routes = {};
        this.currentPage = null;
        this.appContainer = document.getElementById('app');
    }
    
    addRoute(path, handler) {
        this.routes[path] = handler;
    }
    
    async navigate(path, params = {}) {
        // Проверяем авторизацию для всех страниц кроме логина
        if (path !== 'login' && !Auth.isLoggedIn()) {
            path = 'login';
        }
        
        try {
            let html = '';
            
            switch(path) {
                case 'login':
                    html = await this.loadLoginPage();
                    break;
                case 'home':
                    html = await this.loadHomePage();
                    break;
                case 'templates':
                    html = await this.loadTemplatesPage();
                    break;
                case 'template-edit':
                    html = await this.loadTemplateEditPage(params);
                    break;
                case 'workout':
                    html = await this.loadWorkoutPage(params);
                    break;
                case 'active-workout':
                    html = await this.loadActiveWorkoutPage(params);
                    break;
                case 'history':
                    html = await this.loadHistoryPage();
                    break;
                case 'history-detail':
                    html = await this.loadHistoryDetailPage(params);
                    break;
                case 'exercises':
                    html = await this.loadExercisesPage();
                    break;
                case 'profile':
                    html = await this.loadProfilePage();
                    break;
                default:
                    html = await this.loadHomePage();
            }
            
            this.appContainer.innerHTML = html;
            this.currentPage = path;
            
            // Инициализируем скрипты для страницы
            await this.initPageScripts(path, params);
            
        } catch (error) {
            console.error('Error loading page:', error);
            this.appContainer.innerHTML = `
                <div class="container mt-5 text-center">
                    <h3>Ошибка загрузки</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="Router.navigate('home')">На главную</button>
                </div>
            `;
        }
    }
    
    async loadLoginPage() {
        const response = await fetch('pages/login.html');
        return await response.text();
    }
    
    async loadHomePage() {
        const response = await fetch('pages/home.html');
        return await response.text();
    }
    
    async loadTemplatesPage() {
        const response = await fetch('pages/templates.html');
        return await response.text();
    }
    
    async loadTemplateEditPage(params) {
        const response = await fetch('pages/template-edit.html');
        return await response.text();
    }
    
    async loadWorkoutPage(params) {
        const response = await fetch('pages/workout.html');
        return await response.text();
    }
    
    async loadActiveWorkoutPage(params) {
        const response = await fetch('pages/active-workout.html');
        return await response.text();
    }
    
    async loadHistoryPage() {
        const response = await fetch('pages/history.html');
        return await response.text();
    }
    
    async loadHistoryDetailPage(params) {
        const response = await fetch('pages/history-detail.html');
        return await response.text();
    }
    
    async loadExercisesPage() {
        const response = await fetch('pages/exercises.html');
        return await response.text();
    }
    
    async loadProfilePage() {
        const response = await fetch('pages/profile.html');
        return await response.text();
    }
    
    async initPageScripts(page, params) {
        switch(page) {
            case 'login':
                await this.initLoginPage();
                break;
            case 'home':
                await this.initHomePage();
                break;
            case 'templates':
                await this.initTemplatesPage();
                break;
            case 'template-edit':
                await this.initTemplateEditPage(params);
                break;
            case 'workout':
                await this.initWorkoutPage();
                break;
            case 'active-workout':
                await this.initActiveWorkoutPage(params);
                break;
            case 'history':
                await this.initHistoryPage();
                break;
            case 'history-detail':
                await this.initHistoryDetailPage(params);
                break;
            case 'exercises':
                await this.initExercisesPage();
                break;
            case 'profile':
                await this.initProfilePage();
                break;
        }
    }
    
    async initLoginPage() {
        const users = await Auth.getUsers();
        const userListContainer = document.getElementById('user-list');
        
        if (!userListContainer) return;
        
        userListContainer.innerHTML = users.map(user => `
            <div class="col-6 col-md-4 col-lg-3 mb-3">
                <button class="btn btn-outline-light user-select-btn w-100 py-4" 
                        onclick="selectUser('${user.id}')">
                    <div class="user-avatar mb-2">
                        <i class="bi bi-person-circle display-4"></i>
                    </div>
                    <div class="user-name">${user.name}</div>
                </button>
            </div>
        `).join('');
        
        // Показываем секцию PIN при выборе пользователя
        const userButtons = document.querySelectorAll('.user-select-btn');
        userButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const pinSection = document.getElementById('pin-section');
                if (pinSection) {
                    pinSection.style.display = 'block';
                }
            });
        });
        
        // Обработчик PIN-кода
        const pinSubmit = document.getElementById('pin-submit');
        if (pinSubmit) {
            pinSubmit.addEventListener('click', async () => {
                await this.handleLogin();
            });
        }
        
        const pinInput = document.getElementById('pin-input');
        if (pinInput) {
            pinInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    await this.handleLogin();
                }
            });
        }
    }
    
    async handleLogin() {
        const pinInput = document.getElementById('pin-input');
        const selectedUserId = pinInput ? pinInput.dataset.userId : null;
        const pin = pinInput ? pinInput.value : '';
        
        if (!selectedUserId) {
            Utils.showToast('Выберите пользователя', 'warning');
            return;
        }
        
        try {
            const user = await Auth.login(selectedUserId, pin);
            Utils.showToast('Добро пожаловать, ' + user.name + '!');
            this.navigate('home');
        } catch (error) {
            Utils.showToast(error.message, 'danger');
        }
    }
    
    async initHomePage() {
        const user = Auth.getCurrentUser();
        const greeting = document.getElementById('user-greeting');
        if (greeting) {
            greeting.textContent = 'Привет, ' + user.name + '!';
        }
        
        // Загружаем статистику
        await this.loadHomeStats();
        
        // Обработчик кнопки "Начать тренировку"
        const startBtn = document.getElementById('start-workout-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.navigate('workout');
            });
        }
    }
    
    async loadHomeStats() {
        const user = Auth.getCurrentUser();
        const sessions = await DB.getByIndex('sessions', 'userId', user.id);
        
        const today = Utils.getTodayStr();
        const todaySessions = sessions.filter(s => s.date === today);
        const thisWeekSessions = this.getThisWeekSessions(sessions);
        
        const statToday = document.getElementById('stat-today');
        const statWeek = document.getElementById('stat-week');
        const statTotal = document.getElementById('stat-total');
        
        if (statToday) statToday.textContent = todaySessions.length;
        if (statWeek) statWeek.textContent = thisWeekSessions.length;
        if (statTotal) statTotal.textContent = sessions.length;
        
        // Последняя тренировка
        const lastWorkoutInfo = document.getElementById('last-workout-info');
        if (lastWorkoutInfo) {
            if (sessions.length > 0) {
                const lastSession = sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0];
                lastWorkoutInfo.innerHTML = `
                    <div class="alert alert-info">
                        <strong>Последняя тренировка:</strong><br>
                        ${Utils.formatDate(lastSession.date)}<br>
                        Длительность: ${Utils.formatTime(lastSession.duration || 0)}
                    </div>
                `;
            }
        }
    }
    
    getThisWeekSessions(sessions) {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        return sessions.filter(s => new Date(s.date) >= startOfWeek);
    }
    
    async initTemplatesPage() {
        await TemplatesManager.loadTemplatesList();
    }
    
    async initTemplateEditPage(params) {
        await TemplatesManager.loadTemplateEditor(params.id);
    }
    
    async initWorkoutPage() {
        await WorkoutManager.loadStartWorkout();
    }
    
    async initActiveWorkoutPage(params) {
        await WorkoutManager.startActiveWorkout(params.sessionId);
    }
    
    async initHistoryPage() {
        await HistoryManager.loadHistoryList();
    }
    
    async initHistoryDetailPage(params) {
        await HistoryManager.loadHistoryDetail(params.sessionId);
    }
    
    async initExercisesPage() {
        await ExercisesManager.loadExercisesList();
    }
    
    async initProfilePage() {
        const user = Auth.getCurrentUser();
        const profileName = document.getElementById('profile-name');
        const profileJoinDate = document.getElementById('profile-join-date');
        
        if (profileName) profileName.textContent = user.name;
        if (profileJoinDate) profileJoinDate.textContent = Utils.formatDate(user.joinDate);
        
        // Отображаем версию приложения
        const versionElements = document.querySelectorAll('#app-version-display, #update-version-display, #footer-version-display');
        versionElements.forEach(el => {
            if (el) el.textContent = window.APP_VERSION || '1.0.0';
        });
        
        // Кнопка обновления приложения
        const updateAppBtn = document.getElementById('update-app-btn');
        if (updateAppBtn) {
            updateAppBtn.addEventListener('click', () => {
                if (window.updateApp) {
                    window.updateApp();
                } else {
                    Utils.showToast('Функция обновления временно недоступна', 'warning');
                }
            });
        }

        // Экспорт данных
        const exportBtn = document.getElementById('export-data-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                SyncManager.exportData();
            });
        }
        
        // Импорт данных
        const importBtn = document.getElementById('import-data-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        await SyncManager.importData(file);
                    }
                };
                input.click();
            });
        }
        
        // Сброс базы упражнений
        const resetExercisesBtn = document.getElementById('reset-exercises-btn');
        if (resetExercisesBtn) {
            resetExercisesBtn.addEventListener('click', async () => {
                const confirmed = await Utils.confirm(
                    'Обновить список упражнений?\n\n' +
                    'Будут загружены новые упражнения из последней версии приложения. ' +
                    'Ваши тренировки и шаблоны сохранятся.'
                );
                
                if (!confirmed) return;
                
                try {
                    // Удаляем старую версию
                    await DB.delete('settings', 'exercisesVersion');
                    
                    // Очищаем упражнения
                    await DB.clear('exercises');
                    
                    // Загружаем новые из JSON
                    const response = await fetch('data/exercises.json');
                    const data = await response.json();
                    
                    for (const ex of data.exercises) {
                        await DB.add('exercises', ex);
                    }
                    
                    // Сохраняем новую версию
                    await DB.put('settings', {
                        key: 'exercisesVersion',
                        value: JSON.stringify(data.exercises)
                    });
                    
                    Utils.showToast('База упражнений обновлена! 🎉');
                } catch (error) {
                    console.error('Ошибка обновления:', error);
                    Utils.showToast('Ошибка: ' + error.message, 'danger');
                }
            });
        }
        
        // Выход
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const confirmed = await Utils.confirm('Выйти из профиля?');
                if (confirmed) {
                    await Auth.logout();
                    this.navigate('login');
                }
            });
        }
    }
}

function selectUser(userId) {
    // Убираем выделение со всех кнопок
    document.querySelectorAll('.user-select-btn').forEach(btn => {
        btn.classList.remove('active', 'btn-primary');
        btn.classList.add('btn-outline-light');
    });
    
    // Выделяем выбранную кнопку
    const event = window.event;
    if (event) {
        const selectedBtn = event.target.closest('.user-select-btn');
        if (selectedBtn) {
            selectedBtn.classList.remove('btn-outline-light');
            selectedBtn.classList.add('active', 'btn-primary');
        }
    }
    
    // Сохраняем выбранного пользователя
    const pinInput = document.getElementById('pin-input');
    if (pinInput) {
        pinInput.dataset.userId = userId;
        pinInput.focus();
    }
}

const Router = new AppRouter();
window.Router = Router;