/** Deployment entry. Kept separate from app.ts so the declaration emit stays clean. */
import app from './app';

export default { fetch: app.fetch };
