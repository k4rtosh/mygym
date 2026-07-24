// Версия приложения
const APP_VERSION = '1.0.1';
const APP_VERSION_KEY = 'appVersion';

// ===== ОБЪЯВЛЯЕМ ФУНКЦИИ СНАЧАЛА =====

// Функция для обновления приложения
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

// Функция для экспорта данных
async function exportData() {
    await SyncManager.exportData();
}

// Функция для импорта данных
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

// Очистка кэша и перезагрузка
async function clearCacheAndReload() {
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }
        
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) {
                await caches.delete(cacheName);
            }
        }
        
        location.reload(true);
    } catch (e) {
        console.error('Ошибка очистки кэша:', e);
        location.reload(true);
    }
}

// ===== ЭКСПОРТИРУЕМ ФУНКЦИИ ГЛОБАЛЬНО =====
window.APP_VERSION = APP_VERSION;
window.updateApp = updateApp;
window.exportData = exportData;
window.importData = importData;
window.clearCacheAndReload = clearCacheAndReload;

// ===== ОСНОВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ =====
async function initApp() {
    try {
        console.log('🚀 Запуск приложения...');
        
        // 1. ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
        console.log('🔄 Инициализация IndexedDB...');
        await DB.init();
        
        if (!DB.isReady()) {
            throw new Error('База данных не инициализирована');
        }
        console.log('✅ IndexedDB готова');
        
        // 2. ПРОВЕРКА ВЕРСИИ
        console.log('🔄 Проверка версии приложения...');
        const savedVersion = await DB.get('settings', APP_VERSION_KEY);
        
        if (!savedVersion || savedVersion.value !== APP_VERSION) {
            console.log('🔄 Обнаружена новая версия приложения!');
            
            try {
                const exercisesResponse = await fetch('data/exercises.json');
                if (!exercisesResponse.ok) {
                    throw new Error(`HTTP ${exercisesResponse.status}`);
                }
                const exercisesData = await exercisesResponse.json();
                await DB.updateExercises(exercisesData.exercises);
                console.log('✅ Упражнения обновлены');
            } catch (e) {
                console.warn('⚠️ Ошибка обновления упражнений:', e);
            }
            
            await DB.put('settings', {
                key: APP_VERSION_KEY,
                value: APP_VERSION
            });
            
            if ('serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.update();
                    }
                    console.log('✅ Service Worker обновлён');
                } catch (e) {
                    console.warn('⚠️ Ошибка обновления SW:', e);
                }
            }
            
            Utils.showToast(`Приложение обновлено до версии ${APP_VERSION}! 🎉`);
        }
        
        // 3. ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ
        console.log('🔄 Загрузка пользователей...');
        try {
            const usersResponse = await fetch('data/users.json');
            if (!usersResponse.ok) {
                throw new Error(`HTTP ${usersResponse.status}`);
            }
            const usersData = await usersResponse.json();
            await DB.seedUsers(usersData.users);
        } catch (e) {
            console.log('Пользователи уже загружены или файл недоступен');
        }
        
        // 4. ПРОВЕРКА АКТИВНОЙ ТРЕНИРОВКИ
        console.log('🔄 Проверка активной тренировки...');
        try {
            const activeSession = await DB.get('settings', 'activeSession');
            if (activeSession && activeSession.sessionId) {
                const session = await DB.get('sessions', activeSession.sessionId);
                if (session && !session.endTime) {
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
        } catch (e) {
            console.warn('⚠️ Ошибка проверки активной тренировки:', e);
        }
        
        // 5. АВТОРИЗАЦИЯ
        console.log('🔄 Проверка авторизации...');
        const isLoggedIn = await Auth.init();
        
        if (isLoggedIn) {
            console.log('✅ Авторизация успешна, переход на главную');
            await Router.navigate('home');
        } else {
            console.log('🔑 Требуется авторизация');
            await Router.navigate('login');
        }
        
        console.log('✅ Приложение запущено успешно!');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        
        let errorMessage = error.message || 'Неизвестная ошибка';
        let suggestion = 'Попробуйте перезагрузить страницу (Ctrl+F5)';
        
        if (errorMessage.includes('transaction') || errorMessage.includes('IndexedDB')) {
            suggestion = 'Очистите кэш: нажмите Ctrl+Shift+Delete, выберите "Кэш" и перезагрузите страницу';
        }
        
        document.getElementById('app').innerHTML = `
            <div class="container mt-5 text-center">
                <h3>❌ Ошибка инициализации</h3>
                <div class="alert alert-danger mt-3">
                    <strong>${errorMessage}</strong>
                </div>
                <p class="text-muted">${suggestion}</p>
                <button class="btn btn-primary mt-2" onclick="location.reload()">🔄 Перезагрузить</button>
                <button class="btn btn-warning mt-2 ms-2" onclick="clearCacheAndReload()">🧹 Очистить кэш</button>
            </div>
        `;
    }
}

// ===== ЗАПУСК =====
document.addEventListener('DOMContentLoaded', initApp);