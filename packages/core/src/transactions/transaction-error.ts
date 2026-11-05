export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly originalError: unknown,
    public readonly rollbackError?: unknown,
    public readonly releaseError?: unknown
  ) {
    super(message, { cause: originalError });
    this.name = 'TransactionError';
  }
}
