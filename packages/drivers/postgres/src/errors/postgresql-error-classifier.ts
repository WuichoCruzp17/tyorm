
const TRANSPORT_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH'
]);

export function isPostgreSQLConnectionError(
    error: unknown
): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const code = (error as { code?: unknown }).code;

    if (typeof code !== 'string') {
        return false;
    }

    // SQLSTATE clase 08: errores de conexión.
    if (/^08[0-9A-Z]{3}$/.test(code)) {
        return true;
    }

    // Errores de transporte de Node.js.
    return TRANSPORT_ERROR_CODES.has(code);
}
