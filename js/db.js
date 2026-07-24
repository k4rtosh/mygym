// Работа с IndexedDB

class Database {
    constructor() {
        this.dbName = 'mygym';
        this.version = 1;
        this.db = null;
        this.initPromise = null;
    }
    
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        if (this.db) {
            return Promise.resolve();
        }
        
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = (event) => {
                console.error('❌ Ошибка открытия IndexedDB:', event.target.error);
                this.initPromise = null;
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ IndexedDB открыта');
                
                this.db.onclose = () => {
                    console.warn('⚠️ IndexedDB закрыта');
                    this.db = null;
                };
                
                this.db.onversionchange = () => {
                    console.warn('⚠️ Версия IndexedDB изменилась');
                    this.db.close();
                    this.db = null;
                };
                
                this.initPromise = null;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔄 Создание структуры IndexedDB');
                
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('name', 'name', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('exercises')) {
                    const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id' });
                    exerciseStore.createIndex('category', 'category', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('templates')) {
                    const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
                    templateStore.createIndex('userId', 'userId', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('userId', 'userId', { unique: false });
                    sessionStore.createIndex('date', 'date', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('sets')) {
                    const setStore = db.createObjectStore('sets', { keyPath: 'id' });
                    setStore.createIndex('sessionId', 'sessionId', { unique: false });
                    setStore.createIndex('exerciseId', 'exerciseId', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
        
        return this.initPromise;
    }
    
    isReady() {
        return this.db !== null;
    }
    
    async ensureReady() {
        if (this.isReady()) {
            return;
        }
        console.log('⏳ Ожидание инициализации IndexedDB...');
        await this.init();
        if (!this.isReady()) {
            throw new Error('Не удалось инициализировать IndexedDB');
        }
    }
    
    async get(storeName, key) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async put(storeName, data) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async add(storeName, data) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async getAll(storeName) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async getByIndex(storeName, indexName, value) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async delete(storeName, key) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async clear(storeName) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async seedExercises(exercises) {
        await this.ensureReady();
        const existingExercises = await this.getAll('exercises');
        if (existingExercises.length === 0) {
            for (const exercise of exercises) {
                await this.add('exercises', exercise);
            }
            console.log('📚 Упражнения загружены в базу');
            return true;
        }
        return false;
    }
    
    async seedUsers(users) {
        await this.ensureReady();
        const existingUsers = await this.getAll('users');
        if (existingUsers.length === 0) {
            for (const user of users) {
                await this.add('users', user);
            }
            console.log('👤 Пользователи загружены в базу');
            return true;
        }
        return false;
    }

    async updateExercises(newExercises) {
        await this.ensureReady();
        const currentVersion = await this.get('settings', 'exercisesVersion');
        const newVersion = JSON.stringify(newExercises);
        
        if (currentVersion && currentVersion.value === newVersion) {
            console.log('📚 Упражнения актуальны');
            return false;
        }
        
        const existingExercises = await this.getAll('exercises');
        
        if (existingExercises.length > 0) {
            const allSessions = await this.getAll('sessions');
            const usedExerciseIds = new Set();
            
            allSessions.forEach(session => {
                if (session.exercises) {
                    session.exercises.forEach(ex => {
                        if (ex.exerciseId) usedExerciseIds.add(ex.exerciseId);
                    });
                }
            });
            
            for (const ex of existingExercises) {
                if (!usedExerciseIds.has(ex.id)) {
                    await this.delete('exercises', ex.id);
                }
            }
            
            for (const ex of newExercises) {
                await this.put('exercises', ex);
            }
        } else {
            await this.clear('exercises');
            for (const ex of newExercises) {
                await this.add('exercises', ex);
            }
        }
        
        await this.put('settings', {
            key: 'exercisesVersion',
            value: newVersion
        });
        
        console.log('📚 Упражнения обновлены');
        return true;
    }
}

const DB = new Database();
window.DB = DB;