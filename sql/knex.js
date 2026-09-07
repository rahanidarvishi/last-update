'use strict';
/* =========================================================================
   Real, query-backed SQL store -- moving off the "load everything into RAM
   and Array.filter() it" pattern (see db.js's big comment for the history
   of that pattern).

   Tables currently living here (grows as more collections are migrated):
     - pending_deposits, records, record_vouchers, record_deposits (phase 1)
     - tour_bookings (phase 2)

   WHY A SEPARATE FILE FROM data/darvishi.db:
   db.js's `entities` table and these tables are accessed through two
   different libraries (raw better-sqlite3 vs Knex's own connection
   handling). Both COULD point at the same .db file — SQLite supports
   multiple connections to one file — but keeping the boundary as two
   separate files makes the migration unambiguous: everything in
   darvishi.db is still the old "whole collection in RAM" world; everything
   in darvishi-sql.db is a real, queryable, indexed table.
   **BACKUPS MUST GRAB BOTH FILES — see backup-db.js, which does exactly
   that. A backup of only one file is missing either your users/inventory/
   settings (darvishi.db) or your sales records/deposits/bookings
   (darvishi-sql.db).**

   WHY ONLY SOME COLLECTIONS (not everything) LIVE HERE:
   These are the collections that grow forever, one row per real-world
   business event, with no natural cap (one record per sale, one deposit per
   payment, one row per tour booking, forever). That's exactly the shape
   where "load the whole collection into RAM on every request" eventually
   gets slow. Reference/catalog data — users, roles, flightInventory,
   hotelInventory, agencies, currencyRates — stays in the old store on
   purpose: it's bounded by how many staff/hotels/flights someone bothers to
   configure, not by how much business the agency does, so it will never
   grow into a performance problem and moving it buys nothing.
   ========================================================================= */
var path = require('path');
var fs = require('fs');
var Knex = require('knex');

// Overridable via env so automated tests (see tests/) can run against a
// throwaway directory instead of touching real data. Must match db.js's
// override so both stores live in the same temp directory during a test run.
var DATA_DIR = process.env.DARVISHI_DATA_DIR || path.join(__dirname, '..', 'data');
var SQL_DB_FILE = path.join(DATA_DIR, 'darvishi-sql.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

var knex = Knex({
  client: 'better-sqlite3',
  connection: { filename: SQL_DB_FILE },
  useNullAsDefault: true,
  pool: {
    afterCreate: function (conn, cb) {
      // Needed for record_vouchers/record_deposits ON DELETE CASCADE to
      // actually fire when a record is deleted — SQLite has foreign keys
      // OFF by default per-connection.
      conn.pragma('foreign_keys = ON');
      conn.pragma('journal_mode = WAL');
      cb();
    }
  }
});

function chmodDbFiles() {
  [SQL_DB_FILE, SQL_DB_FILE + '-wal', SQL_DB_FILE + '-shm'].forEach(function (f) {
    try { if (fs.existsSync(f)) fs.chmodSync(f, 0o600); } catch (e) { /* best effort, e.g. Windows */ }
  });
}

// Runs pending migrations, then locks down file permissions the same way
// db.js does for its own file. Call once at boot before the server starts
// accepting requests.
function runMigrations() {
  return knex.migrate.latest({ directory: path.join(__dirname, 'migrations') })
    .then(function () { chmodDbFiles(); });
}

module.exports = { knex: knex, runMigrations: runMigrations, SQL_DB_FILE: SQL_DB_FILE };
