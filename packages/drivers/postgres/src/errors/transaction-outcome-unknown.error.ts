export class TransactionOutcomeUnknownError extends Error {
  constructor(cause: unknown) {
    super(
      'The transaction outcome is unknown because COMMIT failed.',
      { cause }
    );

    this.name = 'TransactionOutcomeUnknownError';
  }
}
