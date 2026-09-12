import cron from 'node-cron';
import { runStoreMonitor } from './agents/storeMonitor.js';

// Store Monitor polls every 6 hours, per the build spec.
export function startScheduler() {
  cron.schedule('0 */6 * * *', () => {
    runStoreMonitor().catch((err) => console.error('storeMonitor run failed:', err));
  });
}
