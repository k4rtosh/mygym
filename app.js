// Версия приложения
const APP_VERSION = '1.0.1';
const APP_VERSION_KEY = 'appVersion';

// Инициализация приложения
async function initApp() {
    try {
        // Проверяем версию приложения
        const savedVersion = await DB.get('settings', APP_VERSION_KEY);
        
        if (!savedVersion || savedVersion.value !== APP_VERSION) {
            console.log('🔄 Обнаружена новая версия приложения!');
            
            // Если версия изменилась - обновляем упражнения
            try {
                const exercisesResponse = await fetch('data/exercises.json');
                const exercisesData = await exercisesResponse.json();
                await DB.updateExercises(exercisesData.exercises);
                console.log('✅ Упражнения обновлены для новой версии');
            } catch (e) {
                console.log('⚠️ Ошибка обновления упражнений:', e);
            }
            
            // Сохраняем новую версию
            await DB.put('settings', {
                key: APP_VERSION_KEY,
                value: APP_VERSION
            });
            
            // Обновляем Service Worker
            if ('serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.update();
                    }
                    console.log('✅ Service Worker обновлён');
                } catch (e) {
                    console.log('⚠️ Ошибка обновления Service Worker:', e);
                }
            }
            
            Utils.showToast(`Приложение обновлено до версии ${APP_VERSION}! 🎉`);
        }
        
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

// Глобальная функция для полного обновления приложения
async function updateApp() {
    const confirmed = await Utils.confirm(
        'Обновить приложение?\n\n' +
        'Будут загружены последние упражнения и очищен кэш.\n' +
        'Ваши тренировки и шаблоны сохранятся.'
    );
    
    if (!confirmed) return;
    
    try {
        Utils.showToast('🔄 Обновление приложения...', 'info');
        
        // 1. Обновляем упражнения
        const exercisesResponse = await fetch('data/exercises.json');
        const exercisesData = await exercisesResponse.json();
        await DB.updateExercises(exercisesData.exercises);
        
        // 2. Сохраняем новую версию
        await DB.put('settings', {
            key: APP_VERSION_KEY,
            value: APP_VERSION
        });
        
        // 3. Обновляем Service Worker
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.update();
            }
        }
        
        // 4. Показываем сообщение
        Utils.showToast(`✅ Приложение обновлено до версии ${APP_VERSION}!`, 'success');
        
        // 5. Предлагаем перезагрузить страницу
        const reload = await Utils.confirm('Для полного обновления нужно перезагрузить страницу. Сделать это сейчас?');
        if (reload) {
            location.reload(true);
        }
    } catch (error) {
        console.error('Ошибка обновления:', error);
        Utils.showToast('❌ Ошибка обновления: ' + error.message, 'danger');
    }
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

// Делаем функции глобальными
window.APP_VERSION = APP_VERSION;
window.updateApp = updateApp;
window.exportData = exportData;
window.importData = importData;

// Запускаем приложение
document.addEventListener('DOMContentLoaded', initApp);