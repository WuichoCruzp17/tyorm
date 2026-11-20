import { runGuide } from '../dist/main.js';
import { showLegacy } from '../dist/legacy.js';

const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

await runGuide({
    type: 'postgres',
    host: PGHOST ?? 'localhost',
    port: Number(PGPORT ?? 5432),
    database: PGDATABASE ?? 'tyorm_test',
    username: PGUSER ?? 'postgres',
    ...(PGPASSWORD === undefined ? {} : { password: PGPASSWORD })
}, showLegacy);
