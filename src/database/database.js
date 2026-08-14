const path = require('path')
const config = require('../config')
const RuntimePaths = require('../components/RuntimePaths')

// require() com string calculada em runtime (não literal) para o pkg não
// tentar embutir o addon nativo do sqlite3 dentro do snapshot — ver Task 9.
const sqlite3ModuleName = RuntimePaths.isPackaged()
  ? path.join(RuntimePaths.getAppDir(), 'node_modules', 'sqlite3')
  : 'sqlite3'
const sqlite = require(sqlite3ModuleName).verbose()

const db = new sqlite.Database(
  path.join(config.dataDir, 'ads.db')
)

const createTables = async () => {

  // Define separate SQL statements for each table creation
  const queries = [
    `
    CREATE TABLE IF NOT EXISTS "ads" (
        "id"            INTEGER NOT NULL UNIQUE,
        "searchTerm"    TEXT NOT NULL,
        "title"	        TEXT NOT NULL,
        "price"         INTEGER NOT NULL,
        "url"           TEXT NOT NULL,
        "created"       TEXT NOT NULL,
        "lastUpdate"    TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS "logs" (
        "id"            INTEGER NOT NULL UNIQUE,
        "url"           TEXT NOT NULL,  
        "adsFound"      INTEGER NOT NULL, 
        "averagePrice"  NUMERIC NOT NULL,
        "minPrice"      NUMERIC NOT NULL,
        "maxPrice"      NUMERIC NOT NULL, 
        "created"       TEXT NOT NULL,
        PRIMARY KEY("id" AUTOINCREMENT)
    );`,
    `CREATE TABLE IF NOT EXISTS "search_urls" (
    "id"        INTEGER NOT NULL UNIQUE,
    "url"       TEXT NOT NULL,
    "label"     TEXT,
    "active"    INTEGER NOT NULL DEFAULT 1,
    "created"   TEXT NOT NULL,
    PRIMARY KEY("id" AUTOINCREMENT)
);`
  ];

  return new Promise(function(resolve, reject) {
    // Iterate through the array of queries and execute them one by one
    const executeQuery = (index) => {
      if (index === queries.length) {
        resolve(true); // All queries have been executed
        return;
      }

      db.run(queries[index], function(error) {
        if (error) {
          reject(error);
          return;
        }

        // Execute the next query in the array
        executeQuery(index + 1);
      });
    };

    // Start executing the queries from index 0
    executeQuery(0);
  });
}

module.exports = {
  db,
  createTables
}
