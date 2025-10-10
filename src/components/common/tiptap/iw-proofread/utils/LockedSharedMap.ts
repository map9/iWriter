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