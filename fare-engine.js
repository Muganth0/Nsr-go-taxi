(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NSRFareEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const rates = Object.freeze({
    sedan: Object.freeze({ oneway: 15, roundtrip: 14, bata: 400 }),
    suv: Object.freeze({ oneway: 20, roundtrip: 19, bata: 400 }),
    innova: Object.freeze({ oneway: 21, roundtrip: 20, bata: 500 }),
    crysta: Object.freeze({ oneway: 25, roundtrip: 24, bata: 500 }),
    tempo: Object.freeze({ quoteOnly: true, bata: null })
  });

  function calculate(options) {
    const vehicle = options.vehicle || 'sedan';
    const service = options.tripType || 'oneway';
    const rateInfo = rates[vehicle] || rates.sedan;
    const quoteOnly = service === 'local' || !!rateInfo.quoteOnly;
    const distance = Number(options.distanceKm) || 0;

    if (quoteOnly) {
      return {
        quoteOnly: true, distance, distanceForFare: distance,
        total: null, mode: service, service, rate: null,
        distanceCharge: null, driverBata: null,
        hilly: 0, luggage: 0, live: !!options.live,
        minutes: options.minutes || null,
        duration: options.duration || ''
      };
    }

    if (!Number.isFinite(distance) || distance <= 0) {
      throw new Error('A valid route distance is required to calculate this fare.');
    }

    const mode = service === 'roundtrip' ? 'roundtrip' : 'oneway';
    const distanceForFare = mode === 'roundtrip' ? distance * 2 : distance;
    const rate = rateInfo[mode];
    const driverBata = rateInfo.bata;
    const hilly = options.hilly ? 500 : 0;
    const luggage = options.luggage ? 300 : 0;
    const distanceCharge = Math.round(distanceForFare * rate);
    const total = distanceCharge + driverBata + hilly + luggage;

    return {
      quoteOnly: false, distance, distanceForFare, total, mode, service,
      rate, distanceCharge, driverBata, hilly, luggage,
      live: !!options.live, minutes: options.minutes || null,
      duration: options.duration || ''
    };
  }

  return { rates, calculate };
});
