// Синхронизация и экспорт/импорт данных

class SyncManager {
    static supabaseClient = null;
    
    // Версия схемы данных (для будущей миграции)
    static DATA_SCHEMA_VERSION = '1.0.0';
    
    static init(supabaseUrl, supabaseKey) {
        console.log('Синхронизация: Supabase не настроен. Данные хранятся локально.');
    }
    
    static async saveSession(session) {
        console.log('Синхронизация: сохранение тренировки (заглушка)', session.id);
    }
    
    static async syncAllData() {
        const sessions = await DB.getAll('sessions');
        const templates = await DB.getAll('templates');
        
        console.log('Синхронизация:', {
            sessions: sessions.length,
            templates: templates.length
        });
    }
    
    // ============== ЭКСПОРТ ДАННЫХ ==============
    static async exportData() {
        const user = Auth.getCurrentUser();
        if (!user) {
            Utils.showToast('Пользователь не авторизован', 'danger');
            return;
        }
        
        try {
            // Получаем все данные пользователя
            const sessions = await DB.getByIndex('sessions', 'userId', user.id);
            const templates = await DB.getByIndex('templates', 'userId', user.id);
            
            // Получаем настройки (кроме чувствительных)
            const allSettings = await DB.getAll('settings');
            const settings = allSettings.filter(s => 
                s.key !== 'currentSession' && 
                s.key !== 'activeSession'
            );
            
            // Получаем всех пользователей (для будущей миграции)
            const allUsers = await DB.getAll('users');
            
            // Получаем список упражнений (для совместимости)
            const exercises = await DB.getAll('exercises');
            
            // Собираем полные данные
            const exportData = {
                // Метаданные экспорта
                meta: {
                    exportDate: new Date().toISOString(),
                    appVersion: window.APP_VERSION || '1.0.0',
                    dataSchemaVersion: this.DATA_SCHEMA_VERSION,
                    exporter: 'MyGym PWA',
                    totalSessions: sessions.length,
                    totalTemplates: templates.length
                },
                
                // Данные пользователя
                user: {
                    id: user.id,
                    name: user.name,
                    pin: user.pin,
                    joinDate: user.joinDate,
                    // Можно добавить расширенные поля на будущее
                    settings: {
                        theme: 'dark',
                        notifications: true
                    }
                },
                
                // Все пользователи (для восстановления в новом приложении)
                users: allUsers,
                
                // Тренировки с полной структурой
                sessions: sessions.map(session => ({
                    id: session.id,
                    userId: session.userId,
                    templateId: session.templateId || null,
                    templateName: session.templateName || 'Свободная тренировка',
                    date: session.date,
                    startTime: session.startTime,
                    endTime: session.endTime || null,
                    duration: session.duration || 0,
                    completed: session.completed || false,
                    notes: session.notes || '', // ← Добавляем для будущего
                    exercises: (session.exercises || []).map(ex => ({
                        exerciseId: ex.exerciseId,
                        exerciseName: ex.exerciseName || null, // ← Добавляем для будущего
                        plannedSets: ex.plannedSets || 0,
                        plannedReps: ex.plannedReps || 0,
                        exerciseTime: ex.exerciseTime || 0,
                        completed: ex.completed || false,
                        notes: ex.notes || '', // ← Добавляем для будущего
                        sets: (ex.sets || []).map(set => ({
                            weight: set.weight || 0,
                            reps: set.reps || 0,
                            // Добавляем для будущих метрик
                            rpe: set.rpe || null, // RPE (оценка воспринимаемого усилия)
                            restTime: set.restTime || null, // Время отдыха перед подходом
                            notes: set.notes || '' // Заметки к подходу
                        }))
                    }))
                })),
                
                // Шаблоны тренировок
                templates: templates.map(template => ({
                    id: template.id,
                    userId: template.userId,
                    name: template.name,
                    description: template.description || '', // ← Добавляем для будущего
                    created: template.created || new Date().toISOString(),
                    updated: new Date().toISOString(),
                    category: template.category || 'Общий', // ← Добавляем для будущего
                    exercises: (template.exercises || []).map(ex => ({
                        exerciseId: ex.exerciseId,
                        exerciseName: ex.exerciseName || null,
                        plannedSets: ex.plannedSets || 3,
                        plannedReps: ex.plannedReps || 10,
                        // Добавляем для будущих расширений
                        plannedWeight: ex.plannedWeight || null,
                        restTime: ex.restTime || null,
                        notes: ex.notes || ''
                    }))
                })),
                
                // База упражнений (для совместимости)
                exercises: exercises,
                
                // Настройки приложения
                settings: settings.reduce((acc, setting) => {
                    acc[setting.key] = setting.value;
                    return acc;
                }, {}),
                
                // Итоговая статистика
                statistics: {
                    totalSessions: sessions.length,
                    totalExercises: sessions.reduce((sum, s) => sum + (s.exercises ? s.exercises.length : 0), 0),
                    totalSets: sessions.reduce((sum, s) => {
                        if (s.exercises) {
                            return sum + s.exercises.reduce((s2, ex) => s2 + (ex.sets ? ex.sets.length : 0), 0);
                        }
                        return sum;
                    }, 0),
                    totalDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
                    firstWorkout: sessions.length > 0 ? sessions[sessions.length - 1]?.date : null,
                    lastWorkout: sessions.length > 0 ? sessions[0]?.date : null
                }
            };
            
            // Создаём файл с красивым форматированием
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Скачиваем файл
            const a = document.createElement('a');
            a.href = url;
            a.download = `mygym-backup-${Utils.getTodayStr()}-v${window.APP_VERSION || '1.0.0'}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Показываем статистику
            const stats = exportData.statistics;
            Utils.showToast(
                `✅ Экспортировано: ${stats.totalSessions} тренировок, ${stats.totalExercises} упражнений, ${stats.totalSets} подходов`,
                'success'
            );
            
            console.log('📦 Экспорт завершён:', {
                sessions: stats.totalSessions,
                exercises: stats.totalExercises,
                sets: stats.totalSets,
                duration: stats.totalDuration,
                size: (blob.size / 1024).toFixed(2) + ' KB'
            });
            
        } catch (error) {
            console.error('❌ Ошибка экспорта:', error);
            Utils.showToast('Ошибка экспорта: ' + error.message, 'danger');
        }
    }
    
    // ============== ИМПОРТ ДАННЫХ ==============
    static async importData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            const user = Auth.getCurrentUser();
            if (!user) {
                Utils.showToast('Пользователь не авторизован', 'danger');
                return;
            }
            
            // Проверяем версию схемы данных
            if (data.meta && data.meta.dataSchemaVersion) {
                console.log('📋 Версия схемы данных:', data.meta.dataSchemaVersion);
            }
            
            // Проверяем, что данные не пустые
            if (!data.sessions && !data.templates && !data.user) {
                Utils.showToast('Файл не содержит данных', 'danger');
                return;
            }
            
            const confirmed = await Utils.confirm(
                `Импортировать данные?\n\n` +
                `📊 Найдено:\n` +
                `- Тренировок: ${data.sessions ? data.sessions.length : 0}\n` +
                `- Шаблонов: ${data.templates ? data.templates.length : 0}\n\n` +
                `⚠️ Текущие данные пользователя будут полностью заменены!`
            );
            
            if (!confirmed) return;
            
            // Очищаем все данные текущего пользователя
            await this.clearAllUserData(user.id);
            
            // Импортируем пользователей (если есть)
            if (data.users && data.users.length > 0) {
                for (const userData of data.users) {
                    // Не перезаписываем текущего пользователя
                    if (userData.id !== user.id) {
                        await DB.put('users', userData);
                    }
                }
            }
            
            // Импортируем шаблоны
            if (data.templates && data.templates.length > 0) {
                for (const template of data.templates) {
                    template.userId = user.id;
                    // Проверяем, что есть все необходимые поля
                    if (!template.id) {
                        template.id = Utils.generateId();
                    }
                    await DB.put('templates', template);
                }
            }
            
            // Импортируем тренировки
            if (data.sessions && data.sessions.length > 0) {
                for (const session of data.sessions) {
                    session.userId = user.id;
                    // Проверяем, что есть все необходимые поля
                    if (!session.id) {
                        session.id = Utils.generateId();
                    }
                    if (!session.completed) {
                        session.completed = true;
                    }
                    if (!session.exercises) {
                        session.exercises = [];
                    }
                    await DB.put('sessions', session);
                }
            }
            
            // Импортируем настройки (если есть)
            if (data.settings) {
                for (const [key, value] of Object.entries(data.settings)) {
                    // Пропускаем чувствительные настройки
                    if (key !== 'currentSession' && key !== 'activeSession') {
                        await DB.put('settings', {
                            key: key,
                            value: value
                        });
                    }
                }
            }
            
            // Показываем статистику импорта
            const importedSessions = data.sessions ? data.sessions.length : 0;
            const importedTemplates = data.templates ? data.templates.length : 0;
            
            Utils.showToast(
                `✅ Импортировано: ${importedSessions} тренировок, ${importedTemplates} шаблонов`,
                'success'
            );
            
            console.log('📥 Импорт завершён:', {
                sessions: importedSessions,
                templates: importedTemplates
            });
            
            // Перезагружаем страницу для обновления данных
            setTimeout(() => {
                Router.navigate('home');
            }, 500);
            
        } catch (error) {
            console.error('❌ Ошибка импорта:', error);
            Utils.showToast('Ошибка импорта: ' + error.message, 'danger');
        }
    }
    
    // ============== ОЧИСТКА ДАННЫХ ==============
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
        
        console.log('🧹 Данные пользователя очищены');
    }
}

window.SyncManager = SyncManager;