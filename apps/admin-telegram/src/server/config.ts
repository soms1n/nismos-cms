import 'server-only';

import { z } from 'zod';

const requiredString = z.string().trim().min(1);
const positiveInteger = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const nonNegativeInteger = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));

const telegramCredentialsSchema = z
  .object({
    TELEGRAM_API_ID: positiveInteger,
    TELEGRAM_API_HASH: requiredString,
  })
  .strict();

const telegramConfigSchema = telegramCredentialsSchema.extend({
  TELEGRAM_SESSION: requiredString,
  TELEGRAM_CHANNEL: requiredString,
});

const verificationConfigSchema = telegramConfigSchema
  .extend({
    TELEGRAM_EXPECTED_TOTAL: nonNegativeInteger,
    TELEGRAM_EXPECTED_DELETED: nonNegativeInteger,
    TELEGRAM_VERIFY_RUNS: nonNegativeInteger.pipe(z.number().int().min(20)),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.TELEGRAM_EXPECTED_DELETED > config.TELEGRAM_EXPECTED_TOTAL) {
      context.addIssue({
        code: 'custom',
        path: ['TELEGRAM_EXPECTED_DELETED'],
        message: 'Must not exceed TELEGRAM_EXPECTED_TOTAL',
      });
    }
  });

const appConfigSchema = telegramConfigSchema
  .extend({
    AUTH_URL: z.url(),
    AUTH_SECRET: requiredString,
    OIDC_ISSUER: z.url(),
    OIDC_CLIENT_ID: requiredString,
    OIDC_CLIENT_SECRET: requiredString,
    ADMIN_SUBJECTS: requiredString.transform((value) =>
      value.split(',').map((entry) => {
        const separator = entry.indexOf('|');
        if (separator <= 0 || separator === entry.length - 1) {
          throw new Error('Invalid issuer and subject pair');
        }

        return {
          issuer: entry.slice(0, separator).trim(),
          subject: entry.slice(separator + 1).trim(),
        };
      }),
    ),
    TELEGRAM_REFRESH_TIMEOUT_MS: positiveInteger,
    TELEGRAM_REFRESH_MIN_INTERVAL_MS: nonNegativeInteger,
  })
  .strict();

export class ConfigurationError extends Error {
  constructor(issues: readonly string[]) {
    super(`Invalid configuration: ${issues.join(', ')}`);
    this.name = 'ConfigurationError';
  }
}

function selectEnv(env: NodeJS.ProcessEnv, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, env[key]]));
}

function parseConfig<T extends z.ZodType>(
  schema: T,
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
): z.output<T> {
  const result = schema.safeParse(selectEnv(env, keys));
  if (!result.success) {
    throw new ConfigurationError(
      result.error.issues.map((issue) => issue.path.join('.')),
    );
  }

  return result.data;
}

export function loadTelegramCredentials(env: NodeJS.ProcessEnv = process.env) {
  return parseConfig(telegramCredentialsSchema, env, [
    'TELEGRAM_API_ID',
    'TELEGRAM_API_HASH',
  ]);
}

export function loadTelegramConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseConfig(telegramConfigSchema, env, [
    'TELEGRAM_API_ID',
    'TELEGRAM_API_HASH',
    'TELEGRAM_SESSION',
    'TELEGRAM_CHANNEL',
  ]);
}

export function loadTelegramVerificationConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  return parseConfig(verificationConfigSchema, env, [
    'TELEGRAM_API_ID',
    'TELEGRAM_API_HASH',
    'TELEGRAM_SESSION',
    'TELEGRAM_CHANNEL',
    'TELEGRAM_EXPECTED_TOTAL',
    'TELEGRAM_EXPECTED_DELETED',
    'TELEGRAM_VERIFY_RUNS',
  ]);
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseConfig(appConfigSchema, env, [
    'AUTH_URL',
    'AUTH_SECRET',
    'OIDC_ISSUER',
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'ADMIN_SUBJECTS',
    'TELEGRAM_API_ID',
    'TELEGRAM_API_HASH',
    'TELEGRAM_SESSION',
    'TELEGRAM_CHANNEL',
    'TELEGRAM_REFRESH_TIMEOUT_MS',
    'TELEGRAM_REFRESH_MIN_INTERVAL_MS',
  ]);
}
