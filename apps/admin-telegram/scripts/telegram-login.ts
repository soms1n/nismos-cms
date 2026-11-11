import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { MemoryStorage, TelegramClient } from '@mtcute/node';

import { loadTelegramCredentials } from '../src/server/config';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = resolve(appRoot, '../..');
const outputPath = resolve(
  process.argv[2] ??
    resolve(repositoryRoot, '../nismos-cms-secrets/telegram.session'),
);
const repositoryRelativePath = relative(repositoryRoot, outputPath);

if (
  !repositoryRelativePath.startsWith('..') ||
  isAbsolute(repositoryRelativePath)
) {
  throw new Error('The session file must be outside the repository');
}

if (!process.stdin.isTTY) {
  throw new Error('Interactive login requires a TTY');
}

const credentials = loadTelegramCredentials();
const client = new TelegramClient({
  apiId: credentials.TELEGRAM_API_ID,
  apiHash: credentials.TELEGRAM_API_HASH,
  storage: new MemoryStorage(),
  updates: false,
  logLevel: 0,
});

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function question(prompt: string): Promise<string> {
  const answer = await readline.question(prompt);
  if (!answer.trim()) {
    throw new Error('A non-empty response is required');
  }

  return answer.trim();
}

async function secretQuestion(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });
  const secretReadline = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const pendingAnswer = secretReadline.question(prompt);
  muted = true;

  try {
    const answer = await pendingAnswer;
    process.stdout.write('\n');
    if (!answer) {
      throw new Error('A non-empty response is required');
    }

    return answer;
  } finally {
    secretReadline.close();
  }
}

try {
  await client.start({
    phone: () => question('Telegram phone number: '),
    code: () => question('Telegram login code: '),
    password: () => secretQuestion('Telegram 2FA password: '),
    codeSentCallback: (code) => {
      console.log(`Login code sent via ${code.type}`);
    },
  });

  const session = await client.exportSession();
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${session}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  console.log(`Telegram session saved to ${outputPath}`);
  console.log(
    'Add its contents to TELEGRAM_SESSION in the deployment secret store.',
  );
} finally {
  readline.close();
  await client.destroy();
}
