// Работа с IndexedDB

class Database {
    constructor() {
        this.dbName = 'mygym';
        this.version = 1;
        this.db = null;
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Таблица пользователей
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('name', 'name', { unique: false });
                }
                
                // Таблица упражнений
                if (!db.objectStoreNames.contains('exercises')) {
                    const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id' });
                    exerciseStore.createIndex('category', 'category', { unique: false });
                }
                
                // Таблица шаблонов тренировок
                if (!db.objectStoreNames.contains('templates')) {
                    const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
                    templateStore.createIndex('userId', 'userId', { unique: false });
                }
                
                // Таблица тренировок (сессий)
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('userId', 'userId', { unique: false });
                    sessionStore.createIndex('date', 'date', { unique: false });
                }
                
                // Таблица подходов
                if (!db.objectStoreNames.contains('sets')) {
                    const setStore = db.createObjectStore('sets', { keyPath: 'id' });
                    setStore.createIndex('sessionId', 'sessionId', { unique: false });
                    setStore.createIndex('exerciseId', 'exerciseId', { unique: false });
                }
                
                // Таблица настроек
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }
    
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async seedExercises(exercises) {
        const existingExercises = await this.getAll('exercises');
        if (existingExercises.length === 0) {
            for (const exercise of exercises) {
                await this.add('exercises', exercise);
            }
            console.log('Упражнения загружены в базу');
        }
    }
    
    async seedUsers(users) {
        const existingUsers = await this.getAll('users');
        if (existingUsers.length === 0) {
            for (const user of users) {
                await this.add('users', user);
            }
            console.log('Пользователи загружены в базу');
        }
    }

    async updateExercises(newExercises) {
    // Проверяем версию упражнений
    const currentVersion = await this.get('settings', 'exercisesVersion');
    const newVersion = JSON.stringify(newExercises);
    
    // Если версия совпадает — не обновляем
    if (currentVersion && currentVersion.value === newVersion) {
        console.log('Упражнения актуальны, пропускаем обновление');
        return false;
    }
    
    // Получаем текущие упражнения
    const existingExercises = await this.getAll('exercises');
    
    // Если есть пользовательские данные (тренировки), делаем умное обновление
    if (existingExercises.length > 0) {
        // Проверяем, есть ли тренировки с этими упражнениями
        const allSessions = await this.getAll('sessions');
        const usedExerciseIds = new Set();
        
        allSessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => {
                    if (ex.exerciseId) usedExerciseIds.add(ex.exerciseId);
                });
            }
        });
        
        // Удаляем только неиспользуемые упражнения
        for (const ex of existingExercises) {
            if (!usedExerciseIds.has(ex.id)) {
                await this.delete('exercises', ex.id);
            }
        }
        
        // Добавляем или обновляем упражнения
        for (const ex of newExercises) {
            await this.put('exercises', ex);
        }
    } else {
        // Если тренировок нет — просто заменяем все
        await this.clear('exercises');
        for (const ex of newExercises) {
            await this.add('exercises', ex);
        }
    }
    
    // Сохраняем версию
    await this.put('settings', {
        key: 'exercisesVersion',
        value: newVersion
    });
    
    console.log('Упражнения обновлены');
    return true;
}
}

const DB = new Database();
window.DB = DB;