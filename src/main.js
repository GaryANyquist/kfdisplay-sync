import { loadConfig } from './config.js';
import { createServer } from './server.js';

const cfg = loadConfig();
createServer(cfg).listen(cfg.port, cfg.host, () => {
  console.log(`KFDisplay sync listening on http://${cfg.host}:${cfg.port} (database ${cfg.sql.database})`);
});
