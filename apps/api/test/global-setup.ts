import { PostgreSqlContainer } from '@testcontainers/postgresql';

// ConfigModule reads the environment when AppModule is imported, so the
// database must be up before any test file loads.
export default async function setup() {
  const postgres = await new PostgreSqlContainer('postgres:17-alpine').start();
  process.env.DATABASE_URL = postgres.getConnectionUri();

  return async () => {
    await postgres.stop();
  };
}
