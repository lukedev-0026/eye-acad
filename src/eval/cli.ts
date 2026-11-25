import { AppError } from '@/common/errors/app.error';
import { toError } from '@/common/errors/to-error';
import { configureCommandLineLogging } from '@/common/logging/logger.server';

export type Print = (line: string) => void;

export type Progress = (mark: string) => void;
export const toStdout: Progress = (mark) => void process.stdout.write(mark);

/**
 * Sets the exit code instead of calling process.exit, so output is flushed.
 */
export async function runCli(main: () => Promise<void>): Promise<void> {
  configureCommandLineLogging();
  try {
    await main();
  } catch (thrown) {
    const error = toError(thrown);
    process.stderr.write(
      `${error instanceof AppError ? error.message : (error.stack ?? error.message)}\n`,
    );
    process.exitCode = 1;
  }
}
