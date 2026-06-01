// 必须第一个 import：捕获最早的进程时间戳，不依赖其它模块
import { perfLog } from './perf'
// 必须在最开始导入日志配置，确保所有日志都被捕获
import './logger'
import dotenv from 'dotenv'

import { App } from './App'

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

perfLog('module imports done')

const app = new App();
perfLog('new App() done')

app.run();