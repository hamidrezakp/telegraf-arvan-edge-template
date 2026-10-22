import { createWorker } from '../edge/worker.js';
import { setupBot } from './bot.js';

export default createWorker(setupBot);
