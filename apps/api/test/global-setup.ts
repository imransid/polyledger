import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

// ConfigModule reads the environment when AppModule is imported, so the
// database must be up and migrated before any test file loads.
export default async function setup() {
  // A non-UTC server default proves the app pins its sessions to UTC.
  const postgres = await new PostgreSqlContainer('postgres:17-alpine')
    .withCommand(['postgres', '-c', 'timezone=Pacific/Auckland'])
    .start();
  process.env.DATABASE_URL = postgres.getConnectionUri();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
  });

  return async () => {
    await postgres.stop();
  };
}
