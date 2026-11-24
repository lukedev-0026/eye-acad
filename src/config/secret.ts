const REDACTED = '[REDACTED]';

// A value that must never be printed: an API key. It can only be read by
// asking for it by name (`reveal`). Logging it, turning it into JSON or
// joining it into a string all give "[REDACTED]".
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // What `console.log` and Node's inspector show.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
