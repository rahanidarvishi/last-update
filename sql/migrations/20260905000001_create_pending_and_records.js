'use strict';

exports.up = function (knex) {
  return knex.schema
    .createTable('pending_deposits', function (t) {
      t.string('id').primary();
      t.float('amount').notNullable();
      t.integer('jy').notNullable();
      t.integer('jm').notNullable();
      t.integer('jd').notNullable();
      t.string('platform').notNullable();
      t.string('note').defaultTo('');
      t.string('created_at').notNullable();
      t.boolean('bound').notNullable().defaultTo(false);
      t.string('bound_record_id').nullable();
      t.index(['bound'], 'idx_pending_deposits_bound');
    })
    .createTable('records', function (t) {
      t.string('id').primary();
      t.string('created_at').notNullable();
      t.integer('jy').notNullable();
      t.integer('jm').notNullable();
      t.integer('jd').notNullable();
      t.string('agency').notNullable();
      t.string('counter').notNullable();
      t.string('procurement_expert').defaultTo('');
      t.string('created_by_user_id');
      t.string('created_by_username');
      t.string('created_by_full_name');
      t.float('total_amount').notNullable();
      t.boolean('needs_correction').notNullable().defaultTo(false);
      t.index(['agency'], 'idx_records_agency');
      t.index(['jy', 'jm', 'jd'], 'idx_records_date');
      t.index(['needs_correction'], 'idx_records_needs_correction');
      t.index(['created_at'], 'idx_records_created_at');
    })
    .createTable('record_vouchers', function (t) {
      t.string('id').primary();
      t.string('record_id').notNullable().references('id').inTable('records').onDelete('CASCADE');
      t.string('number').notNullable();
      t.string('stay_city').defaultTo('');
      t.string('hotel').defaultTo('');
      t.string('agent').defaultTo('');
      t.float('purchase_amount').defaultTo(0);
      t.string('purchase_currency').defaultTo('');
      t.float('service_amount').defaultTo(0);
      t.string('flight_out_origin').defaultTo('');
      t.string('flight_out_destination').defaultTo('');
      t.string('flight_in_origin').defaultTo('');
      t.string('flight_in_destination').defaultTo('');
      t.float('flight_out_price_million').defaultTo(0);
      t.float('flight_in_price_million').defaultTo(0);
      t.boolean('debt_settled').notNullable().defaultTo(false);
      t.string('debt_settled_at').defaultTo('');
      t.string('debt_receipt_file_name').defaultTo('');
      t.index(['record_id'], 'idx_record_vouchers_record_id');
      t.index(['number'], 'idx_record_vouchers_number');
    })
    .createTable('record_deposits', function (t) {
      t.string('id').primary();
      t.string('record_id').notNullable().references('id').inTable('records').onDelete('CASCADE');
      t.float('amount').notNullable();
      t.integer('jy').notNullable();
      t.integer('jm').notNullable();
      t.integer('jd').notNullable();
      t.string('platform').notNullable();
      t.string('from_pending_id').nullable();
      t.index(['record_id'], 'idx_record_deposits_record_id');
      t.index(['from_pending_id'], 'idx_record_deposits_from_pending_id');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('record_deposits')
    .dropTableIfExists('record_vouchers')
    .dropTableIfExists('records')
    .dropTableIfExists('pending_deposits');
};
