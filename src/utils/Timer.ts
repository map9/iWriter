export default class Timer {
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly fn: () => void;
  private readonly delay: number;
  private isLooping = false;

  constructor(fn: () => void, delay: number) {
    this.fn = fn;
    this.delay = delay;
  }

  // 启动一次性定时器，并终止任何循环
  start(): void {
    this.end();
    this.isLooping = false;
    this.timer = setTimeout(this.fn, this.delay);
  }

  // 启动循环定时器，每次调用都会重启循环
  loop(): void {
    this.end(); // 清除之前的定时器或循环
    this.isLooping = true;

    const run = () => {
      if (!this.isLooping) return; // 若被中途终止，停止循环
      this.fn();
      this.timer = setTimeout(run, this.delay);
    };

    // 首次延迟调用
    this.timer = setTimeout(run, this.delay);
  }

  // 终止任何当前定时器（不论 start 还是 loop）
  end(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isLooping = false;
  }
}