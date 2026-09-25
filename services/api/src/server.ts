import { env } from './config/env';
import { prisma } from './db/prisma';
import { createApp } from './app';

const server = createApp().listen(env.PORT, '0.0.0.0', () => {
  console.log(`Refera API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
