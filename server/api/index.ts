import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the pre-built Nest app (compiled by `npm run build` → dist/).
// Importing the compiled JS avoids Vercel's esbuild dropping the decorator
// metadata that NestJS dependency injection relies on.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createNestServer } = require('../dist/vercel-entry');

// Reuse a single warm instance across invocations.
let cachedServer: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    cachedServer = cachedServer || (await createNestServer());
    return cachedServer(req, res);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[api] handler bootstrap failed:', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ statusCode: 500, message: 'Internal Server Error' }));
  }
}
