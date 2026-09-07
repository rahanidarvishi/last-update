'use strict';
/* Phase 2 of the SQL migration (see sql/knex.js's big comment for the
   rationale). tourBookings grows exactly like records/deposits did -- one
   row per real booking, forever -- so it gets the same treatment: pull out
   the columns that are actually filtered/sorted/summed into real, indexed
   columns, and leave the genuinely variable nested shapes (hotel, services,
   flight legs, passenger list, history log) as JSON columns rather than
   fully normalizing them. Nothing currently queries INTO those nested
   shapes (no "find bookings containing passenger X" filter exists), so
   normalizing them further would add complexity for no query benefit. */
exports.up = function (knex) {
  return knex.schema.createTable('tour_bookings', function (t) {
    t.string('id').primary();
    t.string('voucher_number').notNullable();
    t.string('created_at').notNullable();
    t.integer('jy').notNullable();
    t.integer('jm').notNullable();
    t.integer('jd').notNullable();
    t.string('agency').notNullable();
    t.string('counter').notNullable();
    t.string('procurement_expert').defaultTo('');
    t.string('created_by_user_id');
    t.string('created_by_full_name');
    t.string('status').notNullable().defaultTo('confirmed');
    t.boolean('needs_correction').notNullable().defaultTo(false);

    // Genuinely nested/variable-shaped data -- see comment above.
    t.text('hotel_json');
    t.text('services_json').notNullable().defaultTo('[]');
    t.text('flight_out_json');
    t.text('flight_in_json');
    t.text('passengers_json').notNullable().defaultTo('[]');
    t.text('history_json').notNullable().defaultTo('[]');

    // Pulled out of `pricing` into real columns -- these are exactly the
    // figures reports/dashboards would want to SUM()/filter on without
    // having to JSON-parse every row first.
    t.float('pricing_total_cost_rial').notNullable().defaultTo(0);
    t.float('pricing_suggested_selling_rial').notNullable().defaultTo(0);
    t.float('pricing_selling_total_rial').notNullable().defaultTo(0);
    t.float('pricing_profit_rial').notNullable().defaultTo(0);
    t.boolean('pricing_cost_fully_known').notNullable().defaultTo(true);

    t.index(['agency'], 'idx_tour_bookings_agency');
    t.index(['jy', 'jm', 'jd'], 'idx_tour_bookings_date');
    t.index(['status'], 'idx_tour_bookings_status');
    t.index(['voucher_number'], 'idx_tour_bookings_voucher_number');
    t.index(['created_at'], 'idx_tour_bookings_created_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tour_bookings');
};
