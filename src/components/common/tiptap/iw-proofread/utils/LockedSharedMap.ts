/**
 * 定义Map的基本操作接口，任何自定义Map都应实现这些方法
 */
export interface BaseMap<K, V> {
    get(key: K): V | undefined;
    set(key: K, value: V): this;
    delete(key: K): boolean;
    has(key: K): boolean;
    clear(): void;
    readonly size: number;
    entries(): IterableIterator<[K, V]>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
}

/**
 * 带锁机制的共享Map类，支持任何实现了BaseMap接口的自定义Map
 */
export class LockedSharedMap<K, V, M extends BaseMap<K, V> = Map<K, V>> {
    private map: M;
    private isLocked: boolean = false;
    private readonly mapConstructor: new (entries?: readonly [K, V][]) => M;

    /**
     * 构造函数
     * @param mapConstructor 自定义Map的构造函数，默认为原生Map
     * @param initialEntries 初始键值对数组
     */
    constructor(
        mapConstructor: new (entries?: readonly [K, V][]) => M = Map as unknown as new (entries?: readonly [K, V][]) => M,
        initialEntries?: readonly [K, V][]
    ) {
        this.mapConstructor = mapConstructor;
        this.map = new mapConstructor(initialEntries);
    }

    /**
     * 执行需要锁定的异步操作，确保操作的原子性
     * @param operation 要执行的操作，接收内部Map实例作为参数
     * @returns 操作的返回结果
     */
    async withLock<T>(operation: (map: M) => Promise<T> | T): Promise<T> {
        // 等待锁释放
        while (this.isLocked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // 加锁
        this.isLocked = true;
        try {
            // 执行操作并返回结果
            return await operation(this.map);
        } finally {
            // 无论成功失败，都释放锁
            this.isLocked = false;
        }
    }

    /**
     * 获取指定键的值
     */
    async get(key: K): Promise<V | undefined> {
        return this.withLock(map => map.get(key));
    }

    /**
     * 设置键值对
     */
    async set(key: K, value: V): Promise<this> {
        return this.withLock(async map => {
            map.set(key, value);
            return this;
        });
    }

    /**
     * 删除指定键
     */
    async delete(key: K): Promise<boolean> {
        return this.withLock(map => map.delete(key));
    }

    /**
     * 检查是否包含指定键
     */
    async has(key: K): Promise<boolean> {
        return this.withLock(map => map.has(key));
    }

    /**
     * 清空所有键值对
     */
    async clear(): Promise<void> {
        return this.withLock(map => map.clear());
    }

    /**
     * 获取当前Map的大小
     */
    async size(): Promise<number> {
        return this.withLock(map => map.size);
    }

    /**
     * 获取所有键值对
     */
    async entries(): Promise<[K, V][]> {
        return this.withLock(map => Array.from(map.entries()));
    }

    /**
     * 获取所有键
     */
    async keys(): Promise<K[]> {
        return this.withLock(map => Array.from(map.keys()));
    }

    /**
     * 获取所有值
     */
    async values(): Promise<V[]> {
        return this.withLock(map => Array.from(map.values()));
    }

    /**
     * 创建当前Map的快照
     * @returns 新的Map实例，包含当前所有键值对
     */
    async snapshot(): Promise<M> {
        return this.withLock(async map => {
            const entries = Array.from(map.entries());
            return new this.mapConstructor(entries);
        });
    }
}

/*
// ------------------------------
// 使用示例
// ------------------------------

// 示例：自定义Map实现
class CustomMap<K, V> implements BaseMap<K, V> {
    private readonly storage = new Map<K, V>();
    
    constructor(entries?: readonly [K, V][]) {
        if (entries) {
            entries.forEach(([key, value]) => this.storage.set(key, value));
        }
    }
    
    get(key: K): V | undefined {
        console.log(`CustomMap: Getting key "${String(key)}"`);
        return this.storage.get(key);
    }
    
    set(key: K, value: V): this {
        console.log(`CustomMap: Setting key "${String(key)}" with value`);
        this.storage.set(key, value);
        return this;
    }
    
    delete(key: K): boolean {
        console.log(`CustomMap: Deleting key "${String(key)}"`);
        return this.storage.delete(key);
    }
    
    has(key: K): boolean {
        return this.storage.has(key);
    }
    
    clear(): void {
        console.log("CustomMap: Clearing all entries");
        this.storage.clear();
    }
    
    get size(): number {
        return this.storage.size;
    }
    
    entries(): IterableIterator<[K, V]> {
        return this.storage.entries();
    }
    
    keys(): IterableIterator<K> {
        return this.storage.keys();
    }
    
    values(): IterableIterator<V> {
        return this.storage.values();
    }
    
    // 自定义Map的额外方法
    getWithMetadata(key: K): { value: V | undefined, timestamp: number } {
        return {
            value: this.storage.get(key),
            timestamp: Date.now()
        };
    }
}

// 使用默认Map
const defaultLockedMap = new LockedSharedMap<string, number>();

// 使用自定义Map
const customLockedMap = new LockedSharedMap<string, number>(CustomMap);

// 演示异步操作
async function demo() {
    // 使用默认Map
    await defaultLockedMap.set('a', 1);
    console.log('Default map value:', await defaultLockedMap.get('a'));
    
    // 使用自定义Map
    await customLockedMap.set('b', 2);
    console.log('Custom map value:', await customLockedMap.get('b'));
    
    // 执行复杂操作（使用自定义Map的特殊方法）
    const result = await customLockedMap.withLock(async (map) => {
        // 类型断言，以便使用自定义方法
        const customMap = map as CustomMap<string, number>;
        return customMap.getWithMetadata('b');
    });
    
    console.log('Custom map complex operation result:', result);
}

demo();
*/