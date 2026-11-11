import {
  closeTelegramClient,
  getTelegramClient,
} from '../src/server/telegram/client';
import { TelegramGatewayError } from '../src/server/telegram/gateway';
import { MtcuteTelegramGateway } from '../src/server/telegram/mtcute-gateway';
import { loadTelegramVerificationConfig } from '../src/server/config';

interface AggregateResult {
  total: number;
  deleted: number;
  real: number;
  unknown: number;
}

function errorCode(error: unknown): string {
  return error instanceof TelegramGatewayError
    ? error.code
    : 'TELEGRAM_REQUEST_FAILED';
}

function percentile(sortedValues: readonly number[], percentileValue: number) {
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sortedValues.length) - 1,
  );
  return sortedValues[index] ?? 0;
}

async function main() {
  const config = loadTelegramVerificationConfig();
  const gateway = new MtcuteTelegramGateway(
    await getTelegramClient(),
    config.TELEGRAM_CHANNEL,
  );
  const durations: number[] = [];
  const observedResults = new Map<string, AggregateResult>();
  const failures = new Map<string, number>();
  let matchesExpected = true;
  let repeatable = true;
  let firstResult: AggregateResult | undefined;

  try {
    for (let run = 0; run < config.TELEGRAM_VERIFY_RUNS; run += 1) {
      const startedAt = performance.now();
      try {
        const traversal = await gateway.collectParticipants();
        durations.push(performance.now() - startedAt);

        let deleted = 0;
        let unknown = 0;
        for (const participant of traversal.participants) {
          if (participant.classification === 'deleted') {
            deleted += 1;
          } else if (participant.classification === 'unknown') {
            unknown += 1;
          }
        }

        const result: AggregateResult = {
          total: traversal.participants.length,
          deleted,
          real: traversal.participants.length - deleted - unknown,
          unknown,
        };
        const resultKey = JSON.stringify(result);
        observedResults.set(resultKey, result);
        firstResult ??= result;

        if (JSON.stringify(firstResult) !== resultKey) {
          repeatable = false;
        }
        if (
          result.total !== config.TELEGRAM_EXPECTED_TOTAL ||
          result.deleted !== config.TELEGRAM_EXPECTED_DELETED ||
          result.unknown !== 0
        ) {
          matchesExpected = false;
        }
      } catch (error) {
        durations.push(performance.now() - startedAt);
        repeatable = false;
        matchesExpected = false;
        const code = errorCode(error);
        failures.set(code, (failures.get(code) ?? 0) + 1);
      }
    }
  } finally {
    await closeTelegramClient();
  }

  const successfulRuns =
    config.TELEGRAM_VERIFY_RUNS -
    [...failures.values()].reduce((sum, count) => sum + count, 0);
  const overFiveSeconds = durations.filter(
    (duration) => duration > 5_000,
  ).length;
  const performancePassed =
    successfulRuns > 0 && overFiveSeconds / successfulRuns <= 0.05;
  const sortedDurations = [...durations].sort((left, right) => left - right);
  const passed =
    matchesExpected &&
    repeatable &&
    failures.size === 0 &&
    performancePassed &&
    observedResults.size === 1;

  console.log(
    JSON.stringify(
      {
        status: passed ? 'passed' : 'failed',
        runs: config.TELEGRAM_VERIFY_RUNS,
        successfulRuns,
        expected: {
          total: config.TELEGRAM_EXPECTED_TOTAL,
          deleted: config.TELEGRAM_EXPECTED_DELETED,
          real:
            config.TELEGRAM_EXPECTED_TOTAL - config.TELEGRAM_EXPECTED_DELETED,
        },
        observed: [...observedResults.values()],
        failures: Object.fromEntries(failures),
        repeatable,
        matchesExpected,
        performance: {
          minMs: Math.round(sortedDurations[0] ?? 0),
          p50Ms: Math.round(percentile(sortedDurations, 50)),
          p95Ms: Math.round(percentile(sortedDurations, 95)),
          maxMs: Math.round(sortedDurations.at(-1) ?? 0),
          overFiveSeconds,
          passed: performancePassed,
        },
      },
      null,
      2,
    ),
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  await closeTelegramClient().catch(() => undefined);
  const message =
    error instanceof Error ? error.message : 'Unknown verification error';
  console.error(message);
  process.exitCode = 1;
}
