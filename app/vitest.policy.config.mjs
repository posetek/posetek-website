// Public React page SSR checks; no application server, Firebase or build pipeline.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default {
  cacheDir: join(tmpdir(), 'posetek-policy-vite-cache'),
  test: {
    include: ['src/pages/privacy/privacy-page.test.tsx', 'src/pages/support/support-page.test.tsx'],
    environment: 'node',
  },
};
