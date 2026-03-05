const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
  await db.migrate.latest();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch(console.error);
