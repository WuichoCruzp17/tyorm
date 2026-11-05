
export interface PoolConfig {

    /**
     * Minimum number of connections in the pool.
     */
    min?: number;

    /**
     * Maximum number of connections in the pool.
     */
    max?: number;

    /**
     * Maximum time to wait for an available connection.
     */
    acquireTimeoutMs?: number;

    /**
     * Maximum idle time before a connection is released.
     */
    idleTimeoutMs?: number;

}

export interface DriverConfig {

    /**
     * Database engine identifier.
     */
    type: string;

    /**
     * Database server hostname.
     */
    host?: string;

    /**
     * Database server port.
     */
    port?: number;

    /**
     * Database name.
     */
    database: string;

    /**
     * Authentication username.
     */
    username?: string;

    /**
     * Authentication password.
     */
    password?: string;

    /**
     * Connection pool configuration.
     */
    pool?: PoolConfig;

    /**
     * Driver-specific configuration.
     */
    driverOptions?: Readonly<Record<string, unknown>>;

}
