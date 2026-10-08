import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

async function main() {
  await connectDB(env.MONGODB_URI);
  console.log('MongoDB connected');

  const server = createApp().listen(env.PORT, () => {
    console.log(`CareerTrack API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
  startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    stopScheduler();
    const force = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await disconnectDB();
      clearTimeout(force);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
