/**
 * @deprecated — Legacy Express server. NOT part of the active application.
 *
 * The active application is the Next.js app started via `npm run dev` / `npm start`.
 * This file is never started by any npm script in production.
 *
 * See ARCHITECTURE.md > Legacy Code Boundary for details.
 */
const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
  await db.migrate.latest();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch(console.error);
