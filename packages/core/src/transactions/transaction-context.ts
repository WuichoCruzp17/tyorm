
import type {
    DatabaseConnection,
    Query,
    QueryResult
} from '../drivers';

export interface TransactionContext {
    readonly isActive: boolean;

    execute<T = Record<string, unknown>>(
        query: Query
    ): Promise<QueryResult<T>>;
}

export class ManagedTransactionContext
    implements TransactionContext {

    private active = true;

    private readonly pending = new Set<Promise<void>>();

    private readonly errors: unknown[] = [];

    constructor(
        private readonly connection: DatabaseConnection
    ) { }

    get isActive(): boolean {
        return this.active;
    }

    execute<T = Record<string, unknown>>(
        query: Query
    ): Promise<QueryResult<T>> {
        if (!this.active) {
            return Promise.reject(
                new Error('TransactionContext is no longer active.')
            );
        }

        // Promise.resolve().then() convierte también los
        // errores síncronos del driver en rechazos de promesa.
        const operation = Promise.resolve().then(
            () => this.connection.execute<T>(query)
        );

        // Registramos la operación y observamos sus errores.
        // La promesa original sigue rechazándose para quien
        // sí utiliza await sobre context.execute().
        const tracked = operation.then(
            () => {
                // Operación completada correctamente.
            },
            (error: unknown) => {
                this.errors.push(error);
            }
        );

        this.pending.add(tracked);

        void tracked.then(() => {
            this.pending.delete(tracked);
        });

        return operation;
    }

    /**
     * Impide iniciar nuevas operaciones.
     * Las que ya comenzaron podrán finalizar.
     */
    close(): void {
        this.active = false;
    }

    /**
     * Espera las operaciones iniciadas antes del cierre.
     * Si alguna falló, impide confirmar la transacción.
     *
     * Uso exclusivo de TransactionManager.
     */
    async drain(): Promise<void> {
        await Promise.all([...this.pending]);

        if (this.errors.length > 0) {
            throw new AggregateError(
                this.errors,
                'One or more transaction operations failed.'
            );
        }
    }
}
