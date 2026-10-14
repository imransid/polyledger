import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openApiDocument } from '../src/openapi.js';
import { startApp } from './support.js';

let app: INestApplication;

beforeEach(async () => {
  app = await startApp();
});

afterEach(async () => {
  await app.close();
});

// The office client is generated from openapi.json. Run `pnpm api:client`
// after changing an endpoint; CI fails here if that was forgotten.
it('matches the committed openapi.json', async () => {
  const spec = `${JSON.stringify(openApiDocument(app), null, 2)}\n`;

  await expect(spec).toMatchFileSnapshot('../openapi.json');
});
