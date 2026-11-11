import 'server-only';

import { MemoryStorage, TelegramClient } from '@mtcute/node';

import { loadTelegramConfig } from '../config';

const LOGGING_DISABLED = 0;

let clientPromise: Promise<TelegramClient> | undefined;

async function createClient(): Promise<TelegramClient> {
  const config = loadTelegramConfig();
  const client = new TelegramClient({
    apiId: config.TELEGRAM_API_ID,
    apiHash: config.TELEGRAM_API_HASH,
    storage: new MemoryStorage(),
    updates: false,
    logLevel: LOGGING_DISABLED,
  });

  try {
    await client.start({ session: config.TELEGRAM_SESSION });
    return client;
  } catch (error) {
    await client.destroy().catch(() => undefined);
    throw error;
  }
}

export function getTelegramClient(): Promise<TelegramClient> {
  clientPromise ??= createClient().catch((error: unknown) => {
    clientPromise = undefined;
    throw error;
  });

  return clientPromise;
}

export async function closeTelegramClient(): Promise<void> {
  const pendingClient = clientPromise;
  clientPromise = undefined;

  if (pendingClient) {
    const client = await pendingClient.catch(() => undefined);
    await client?.destroy();
  }
}
