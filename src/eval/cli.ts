import { AppError } from '@/common/errors/app.error';
import { toError } from '@/common/errors/to-error';
import { configureCommandLineLogging } from '@/common/logging/logger.server';

// What a command writes its report with. The scripts pass `console.log`; a
// test can pass anything.
export type Print = (line: string) => void;

// A mark for one unit of work done ('.', 'x'), written without a line break.
export type Progress = (mark: string) => void;
export const toStdout: Progress = (mark) => void process.stdout.write(mark);

// Runs a command-line tool. Log lines go to stderr, so the tool's own output
// on stdout stays clean. If it fails, the reason is printed and the exit code
// is set; nothing calls process.exit, so whatever was being written is
// flushed first.
export async function runCli(main: () => Promise<void>): Promise<void> {
  configureCommandLineLogging();
  try {
    await main();
  } catch (thrown) {
    const error = toError(thrown);
    // An error raised on purpose is its own explanation. Anything else is a
    // bug, and its stack says where.
    process.stderr.write(`${error instanceof AppError ? error.message : (error.stack ?? error.message)}\n`);
    process.exitCode = 1;
  }
}
