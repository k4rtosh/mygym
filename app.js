// Инициализация приложения

async function initApp() {
    try {
        // Инициализируем базу данных
        await DB.init();
        
        // Загружаем начальные данные
        try {
            const usersResponse = await fetch('data/users.json');
            const usersData = await usersResponse.json();
            await DB.seedUsers(usersData.users);
        } catch (e) {
            console.log('Пользователи уже загружены или файл недоступен');
        }
        
        try {
            const exercisesResponse = await fetch('data/exercises.json');
            const exercisesData = await exercisesResponse.json();
            const updated = await DB.updateExercises(exercisesData.exercises);
            if (updated) {
                console.log('База упражнений обновлена');
            }
        } catch (e) {
            console.log('Ошибка загрузки упражнений:', e);
        }
        
        // Проверяем активную сессию тренировки
        const activeSession = await DB.get('settings', 'activeSession');
        if (activeSession && activeSession.sessionId) {
            const session = await DB.get('sessions', activeSession.sessionId);
            if (session && !session.endTime) {
                // Есть незавершенная тренировка - предлагаем продолжить
                const confirmed = await Utils.confirm('У вас есть незавершенная тренировка. Продолжить?');
                if (confirmed) {
                    Router.navigate('active-workout', {sessionId: activeSession.sessionId});
                    return;
                } else {
                    await DB.delete('settings', 'activeSession');
                }
            } else {
                await DB.delete('settings', 'activeSession');
            }
        }
        
        // Инициализируем авторизацию
        const isLoggedIn = await Auth.init();
        
        // Запускаем роутер
        if (isLoggedIn) {
            await Router.navigate('home');
        } else {
            await Router.navigate('login');
        }
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        document.getElementById('app').innerHTML = `
            <div class="container mt-5 text-center">
                <h3>Ошибка инициализации</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="location.reload()">Перезагрузить</button>
            </div>
        `;
    }
}

// Обработка кнопки "Назад" в браузере
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
        Router.navigate(event.state.page, event.state.params);
    }
});

// Глобальная функция для экспорта данных
async function exportData() {
    await Sync.exportData();
}

// Глобальная функция для экспорта данных
async function exportData() {
    await SyncManager.exportData();
}

// Глобальная функция для импорта данных
function importData() {
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
}

// Запускаем приложение
document.addEventListener('DOMContentLoaded', initApp);