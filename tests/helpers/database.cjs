const { createDatabase, query } = require('../../packages/db/src/client.ts');
// Unit fixtures expose the SQLite test setup API; application queries still execute via Drizzle.
class DatabaseSync {
  constructor(filename) {
    const db = createDatabase(filename);
    return Object.assign(db, {
      prepare: statement => query(db, statement),
      exec: statement => db.$client.exec(statement),
      close: () => db.$client.close(),
    });
  }
}
module.exports = { DatabaseSync };
