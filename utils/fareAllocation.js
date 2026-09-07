'use strict';
// Given a flight's fareClasses (already in fallthrough priority order — see
// the /reorder endpoint in routes/inventory.js) and a required seat count,
// allocates seats starting from class 0, moving to the next class only once
// the current one is sold out. Returns null if the flight doesn't have
// enough total remaining seats across all its classes.
function allocateSeats(fareClasses, neededSeats) {
  var allocations = [];
  var remaining = neededSeats;
  for (var i = 0; i < fareClasses.length && remaining > 0; i++) {
    var fc = fareClasses[i];
    var available = fc.capacity - fc.seatsSold;
    if (available <= 0) continue;
    var take = Math.min(available, remaining);
    allocations.push({
      fareClassId: fc.id, name: fc.name, seats: take,
      priceEach: fc.price, currency: fc.currency,
      costEach: fc.costPrice, costCurrency: fc.costCurrency || fc.currency
    });
    remaining -= take;
  }
  if (remaining > 0) return null;
  return allocations;
}

// Applies (or reverses, with sign=-1) an allocation onto the live flight
// object — call this only after allocateSeats() succeeded for every flight
// involved in a booking, so a mid-way failure never leaves partial holds.
//
// NOTE ON CONCURRENCY: allocateSeats() (the capacity check) and
// applyAllocation() (the mutation) run back-to-back with no `await` in
// between anywhere in routes/booking.js, and the db layer (better-sqlite3)
// is synchronous. That means, in the current single Node process, nothing
// can interleave between the check and the mutation — two "simultaneous"
// requests are still handled one at a time by the event loop, so this is
// NOT vulnerable to the classic check-then-act overbooking race today. This
// stops being true the moment either (a) this app is ever run with more
// than one process/worker (e.g. `pm2 start -i <n>`, or multiple server
// instances behind a load balancer), since each process/instance would
// check against its own last-read snapshot, or (b) an `await` is
// introduced between allocateSeats() and applyAllocation() in the future.
// If either changes, add a final re-check of `available` right before the
// mutation (or a proper transaction/lock) before deploying that way.
function applyAllocation(flight, allocations, sign) {
  allocations.forEach(function (a) {
    var fc = flight.fareClasses.find(function (c) { return c.id === a.fareClassId; });
    if (!fc) return;
    if (sign < 0) {
      // Releasing seats (cancel). Clamp at 0 so manual edits to
      // capacity/seatsSold made in inventory between booking and
      // cancellation can never push this negative.
      fc.seatsSold = Math.max(0, fc.seatsSold + sign * a.seats);
    } else {
      fc.seatsSold += sign * a.seats;
    }
  });
}

module.exports = { allocateSeats: allocateSeats, applyAllocation: applyAllocation };
