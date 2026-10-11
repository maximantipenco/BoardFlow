import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { initRealtime } from './realtime';

const port = Number(process.env.PORT) || 3000;

const httpServer = createServer(app);
initRealtime(httpServer);

httpServer.listen(port, () => {
  console.log(`BoardFlow backend listening on http://localhost:${port}`);
});
