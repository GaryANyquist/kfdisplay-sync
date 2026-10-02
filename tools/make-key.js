// Prints a new random sync key. Put it in .env as SYNC_KEY and type the same key on the tablet.
import { randomBytes } from 'node:crypto';

console.log(randomBytes(24).toString('base64url'));
