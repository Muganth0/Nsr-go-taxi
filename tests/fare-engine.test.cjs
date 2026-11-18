const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../fare-engine.js');

test('Sedan one-way uses published km rate and ₹400 driver allowance', () => {
  const fare = calculate({ vehicle:'sedan', tripType:'oneway', distanceKm:100 });
  assert.equal(fare.total, 1900);
  assert.equal(fare.rate, 15);
  assert.equal(fare.driverBata, 400);
});

test('Innova and Crysta use the displayed ₹500 driver allowance', () => {
  const innova = calculate({ vehicle:'innova', tripType:'oneway', distanceKm:100 });
  const crysta = calculate({ vehicle:'crysta', tripType:'oneway', distanceKm:100 });
  assert.equal(innova.total, 2600);
  assert.equal(crysta.total, 3000);
  assert.equal(innova.driverBata, 500);
  assert.equal(crysta.driverBata, 500);
});

test('Round trip doubles the route distance and uses round-trip rate', () => {
  const fare = calculate({ vehicle:'suv', tripType:'roundtrip', distanceKm:100 });
  assert.equal(fare.distanceForFare, 200);
  assert.equal(fare.total, 4200);
});

test('Hilly and luggage extras are included transparently', () => {
  const fare = calculate({ vehicle:'sedan', tripType:'oneway', distanceKm:100, hilly:true, luggage:true });
  assert.equal(fare.total, 2700);
});

test('Tempo Traveller is quote-only and never fabricates a fare', () => {
  const fare = calculate({ vehicle:'tempo', tripType:'oneway', distanceKm:100 });
  assert.equal(fare.quoteOnly, true);
  assert.equal(fare.total, null);
});

test('Local rental uses duration-based quote rather than per-kilometre pricing', () => {
  const fare = calculate({ vehicle:'sedan', tripType:'local', distanceKm:0, duration:'8 hours' });
  assert.equal(fare.quoteOnly, true);
  assert.equal(fare.total, null);
  assert.equal(fare.duration, '8 hours');
});

test('Invalid route distance is rejected for per-kilometre services', () => {
  assert.throws(() => calculate({ vehicle:'sedan', tripType:'oneway', distanceKm:0 }), /valid route distance/i);
});
