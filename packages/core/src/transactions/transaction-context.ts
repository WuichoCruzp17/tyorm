
import type {
    DatabaseConnection,
    Query,
    QueryResult
} from '../drivers';

export type TransactionContextState =
    | 'ACTIVE'
    | 'DRAINING'
    | 'CLOSED';

export interface TransactionContext {
    readonly isActive: boolean;

    execute<T = Record<string, unknown>>(
        query: Query
    ): Promise<QueryResult<T>>;
}

export class ManagedTransactionContext
    implements TransactionContext {

    private currentState: TransactionContextState = 'ACTIVE';

    private readonly pending = new Set<Promise<void>>();

    private readonly errors: unknown[] = [];

    private drainPromise?: Promise<void>;

    constructor(
        private readonly connection: DatabaseConnection
    ) { }

    get state(): TransactionContextState {
        return this.currentState;
    }

    get isActive(): boolean {
        return this.currentState === 'ACTIVE';
    }

    get hasFailed(): boolean {
        return this.errors.length > 0;
    }

    get pendingCount(): number {
        return this.pending.size;
    }

    execute<T = Record<string, unknown>>(
        query: Query
    ): Promise<QueryResult<T>> {
        if (!this.isActive) {
            return Promise.reject(
                new Error('TransactionContext is no longer active.')
            );
        }

        // El trabajo se programa en una microtarea.
        // Esto permite capturar también errores síncronos.
        const operation = Promise.resolve().then(
            () => this.connection.execute<T>(query)
        );

        // Esta promesa de seguimiento SIEMPRE se resuelve.
        // El error original sigue disponible en operation.
        const tracked: Promise<void> = operation.then(
            () => undefined,
            (error: unknown) => {
                this.errors.push(error);
            }
        );

        this.pending.add(tracked);

        // finally() crearía otra promesa que tendríamos
        // que observar. Usamos then() sobre tracked,
        // cuyo rechazo ya está controlado.
        void tracked.then(() => {
            this.pending.delete(tracked);
        });

        return operation;
    }

    /**
     * Impide iniciar nuevas operaciones.
     * Las operaciones registradas pueden finalizar.
     */
    close(): void {
        if (this.currentState === 'ACTIVE') {
            this.currentState = 'DRAINING';
        }
    }

    /**
     * Espera las operaciones registradas y finaliza
     * el ciclo de vida del contexto.
     *
     * No realiza COMMIT ni ROLLBACK.
     */
    drain(): Promise<void> {
        if (this.drainPromise) {
            return this.drainPromise;
        }

        this.close();

        this.drainPromise = this.finishDraining();

        return this.drainPromise;
    }

    private async finishDraining(): Promise<void> {
        try {
            // No pueden agregarse nuevas operaciones porque
            // el contexto ya está en DRAINING.
            await Promise.all([...this.pending]);

            if (this.errors.length > 0) {
                throw new AggregateError(
                    [...this.errors],
                    'One or more transaction operations failed.'
                );
            }
        } finally {
            this.currentState = 'CLOSED';
        }
    }
}
