
import type { DriverConfig } from './driver-config.interface';

import type {
    DatabaseConnection
} from './database-connection.interface';

export interface DatabaseDriver {

    /**
     * Unique database engine identifier.
     */
    readonly name: string;

    /**
     * Initializes the database driver and connection pool.
     */
    connect(config: DriverConfig): Promise<void>;

    /**
     * Acquires an available connection from the pool.
     */
    acquireConnection(): Promise<DatabaseConnection>;

    /**
     * Checks whether the database is reachable.
     */
    ping(): Promise<boolean>;

    /**
     * Closes the connection pool and releases resources.
     */
    disconnect(): Promise<void>;

}
