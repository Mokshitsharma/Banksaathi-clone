import fs from 'node:fs';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface PushProvider {
  /** Returns the tokens the provider reported as permanently invalid. */
  send(tokens: string[], message: PushMessage): Promise<string[]>;
}

class ConsolePushProvider implements PushProvider {
  async send(tokens: string[], message: PushMessage) {
    console.log(`[push:console] -> ${tokens.length} device(s): ${message.title} — ${message.body}`);
    return [];
  }
}

class FcmPushProvider implements PushProvider {
  private messaging: Promise<import('firebase-admin/messaging').Messaging>;

  constructor(serviceAccountPath: string) {
    this.messaging = (async () => {
      const { initializeApp, cert } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');
      const app = initializeApp({ credential: cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))) });
      return getMessaging(app);
    })();
  }

  async send(tokens: string[], message: PushMessage) {
    const messaging = await this.messaging;
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: { priority: 'high' },
    });
    return res.responses
      .map((r, i) => (r.error?.code === 'messaging/registration-token-not-registered' ? tokens[i] : null))
      .filter((t): t is string => t !== null);
  }
}

function create(): PushProvider {
  if (env.PUSH_PROVIDER === 'fcm') {
    if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is required when PUSH_PROVIDER=fcm');
    return new FcmPushProvider(env.FIREBASE_SERVICE_ACCOUNT_PATH);
  }
  return new ConsolePushProvider();
}

const provider = create();

/** Fire-and-forget notification to all of a user's devices. Never throws. */
export function notifyUser(userId: string, message: PushMessage): void {
  void (async () => {
    const devices = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
    if (devices.length === 0) return;
    const invalid = await provider.send(devices.map((d) => d.token), message);
    if (invalid.length) await prisma.deviceToken.deleteMany({ where: { token: { in: invalid } } });
  })().catch((err) => console.error('[push] failed to notify user', userId, err));
}
