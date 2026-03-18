export class Result<T, E = Error> {
  private constructor(
    private readonly value?: T,
    private readonly error?: E,
    private readonly success: boolean = true
  ) {}

  static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(value, undefined, true);
  }

  static fail<E>(error: E): Result<never, E> {
    return new Result<never, E>(undefined, error, false);
  }

  isSuccess(): boolean {
    return this.success;
  }

  isFailure(): boolean {
    return !this.success;
  }

  getValue(): T {
    if (!this.success) {
      throw new Error('Cannot get value from failed result');
    }
    return this.value as T;
  }

  getError(): E {
    if (this.success) {
      throw new Error('Cannot get error from successful result');
    }
    return this.error as E;
  }
}
