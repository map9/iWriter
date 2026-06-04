// TC39 Upsert: Map.prototype.getOrInsertComputed
if (!('getOrInsertComputed' in Map.prototype)) {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value: function <K, V>(this: Map<K, V>, key: K, fn: (k: K) => V): V {
      if (!this.has(key)) this.set(key, fn(key))
      return this.get(key) as V
    },
    writable: true, configurable: true, enumerable: false,
  })
}

// TC39 Math.sumPrecise — TrueType 字体坐标计算路径调用，缺失导致 CJK 字形损坏
if (!('sumPrecise' in Math)) {
  Object.defineProperty(Math, 'sumPrecise', {
    value: (iter: Iterable<number>): number => {
      let s = 0
      for (const v of iter) s += v
      return s
    },
    writable: true, configurable: true, enumerable: false,
  })
}
