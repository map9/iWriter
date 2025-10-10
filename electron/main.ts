// 必须在最开始导入日志配置，确保所有日志都被捕获
import './logger'
import dotenv from 'dotenv'

import { App } from './App'

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = new App();
app.run();