import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb } from './db/db.js';
import { queueRouter } from './routes/queue.js';
import { startScheduler } from './scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.use('/api/queue', queueRouter);

const PORT = process.env.PORT || 4100;

// Fail fast if the schema can't load, rather than serving with a broken DB.
getDb();

app.listen(PORT, () => {
  console.log(`App support pipeline listening on http://localhost:${PORT}`);
  startScheduler();
});
