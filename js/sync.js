// Синхронизация с Supabase и экспорт/импорт данных

class SyncManager {
    static supabaseClient = null;
    
    static init(supabaseUrl, supabaseKey) {
        // Инициализация Supabase клиента (будет добавлена позже)
        console.log('Синхронизация: Supabase не настроен. Данные хранятся локально.');
    }
    
    static async saveSession(session) {
        // Заглушка для сохранения в облако
        console.log('Синхронизация: сохранение тренировки (заглушка)', session.id);
    }
    
    static async syncAllData() {
        // Полная синхронизация всех данных
        const sessions = await DB.getAll('sessions');
        const templates = await DB.getAll('templates');
        
        console.log('Синхронизация:', {
            sessions: sessions.length,
            templates: templates.length
        });
    }
    
    // Экспорт всех данных в JSON
    static async exportData() {
        const user = Auth.getCurrentUser();
        if (!user) {
            Utils.showToast('Пользователь не авторизован', 'danger');
            return;
        }
        
        const data = {
            user: user,
            sessions: await DB.getByIndex('sessions', 'userId', user.id),
            templates: await DB.getByIndex('templates', 'userId', user.id),
            settings: await DB.getAll('settings'),
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mygym-backup-' + Utils.getTodayStr() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        
        Utils.showToast('Данные экспортированы');
    }
    
    // Импорт данных из JSON с полной очисткой
    static async importData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            const user = Auth.getCurrentUser();
            if (!user) {
                Utils.showToast('Пользователь не авторизован', 'danger');
                return;
            }
            
            // Очищаем все данные текущего пользователя
            await this.clearAllUserData(user.id);
            
            // Импортируем шаблоны
            if (data.templates && data.templates.length > 0) {
                for (const template of data.templates) {
                    // Привязываем шаблон к текущему пользователю
                    template.userId = user.id;
                    await DB.put('templates', template);
                }
            }
            
            // Импортируем тренировки
            if (data.sessions && data.sessions.length > 0) {
                for (const session of data.sessions) {
                    // Привязываем тренировку к текущему пользователю
                    session.userId = user.id;
                    await DB.put('sessions', session);
                }
            }
            
            // Импортируем настройки если есть
            if (data.settings && data.settings.length > 0) {
                for (const setting of data.settings) {
                    await DB.put('settings', setting);
                }
            }
            
            Utils.showToast('Данные импортированы успешно');
            Router.navigate('home');
        } catch (error) {
            console.error('Ошибка импорта:', error);
            Utils.showToast('Ошибка импорта: ' + error.message, 'danger');
        }
    }
    
    // Полная очистка данных пользователя
    static async clearAllUserData(userId) {
        // Удаляем все шаблоны пользователя
        const templates = await DB.getByIndex('templates', 'userId', userId);
        for (const template of templates) {
            await DB.delete('templates', template.id);
        }
        
        // Удаляем все тренировки пользователя
        const sessions = await DB.getByIndex('sessions', 'userId', userId);
        for (const session of sessions) {
            await DB.delete('sessions', session.id);
        }
        
        // Удаляем активную сессию если есть
        await DB.delete('settings', 'activeSession');
    }
}

window.SyncManager = SyncManager;