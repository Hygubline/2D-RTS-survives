/** Entry point: `npm run server` (PORT env var overrides the default 8787). */
import { DEFAULT_PORT } from '../src/net/protocol';
import { startRelay } from './relay';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
startRelay({ port, log: (line) => process.stdout.write(`[relay] ${line}\n`) }).catch((err: unknown) => {
  process.stderr.write(`[relay] failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
