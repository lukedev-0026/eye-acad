import { AppError } from '@/common/errors/app.error';
import type { AppErrorOptions } from '@/common/errors/app.error';

// The app was started with settings it cannot run on. Never shown to the
// trainee: the fix is in the environment or a settings file.
export abstract class ConfigError extends AppError {
  readonly status = 500;
}

export class InvalidEnvironmentError extends ConfigError {
  override readonly name = 'InvalidEnvironmentError';
  readonly code = 'CONFIG_INVALID';

  constructor(issues: ReadonlyArray<string>, options: AppErrorOptions = {}) {
    super(`Invalid environment:\n${issues.map((issue) => `  ${issue}`).join('\n')}`, {
      ...options,
      details: { issues, ...options.details },
    });
  }
}

export class InvalidSettingsFileError extends ConfigError {
  override readonly name = 'InvalidSettingsFileError';
  readonly code = 'SETTINGS_FILE_INVALID';

  constructor(file: string, problem: string, options: AppErrorOptions = {}) {
    super(`${file} is not a valid settings file:\n${problem}`, { ...options, details: { file, ...options.details } });
  }
}
