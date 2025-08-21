import log from 'electron-log/main'
import dotenv from 'dotenv'

import { App } from './App'

log.transports.file.level = 'info';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = new App();
app.run();