module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: { filename: './dev.sqlite3' },
    useNullAsDefault: true,
    migrations: { directory: './src/db/migrations' },
  },
  test: {
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: './src/db/migrations' },
  },
  production: {
    client: 'better-sqlite3',
    connection: { filename: process.env.DB_PATH || './prod.sqlite3' },
    useNullAsDefault: true,
    migrations: { directory: './src/db/migrations' },
  },
};
