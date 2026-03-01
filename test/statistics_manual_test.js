#!/usr/bin/env node
(async () => {
	const Statistics = require('../lib/statistics.js');

	const fakeAdapter = {
		logger: {
			debug: (...a) => console.log('DEBUG', ...a),
			warn: (...a) => console.warn('WARN', ...a),
			log: (...a) => console.log(...a),
		},
		setTimeout: (fn, ms) => global.setTimeout(fn, ms),
		clearTimeout: id => global.clearTimeout(id),
		getState: async id => ({ val: undefined }),
	};

	class MockStateCache {
		constructor() {
			this.map = new Map();
		}
		get(k) {
			const v = this.map.get(k);
			return v === undefined ? undefined : { value: v };
		}
		set(k, val) {
			this.map.set(k, val);
		}
	}

	const stateCache = new MockStateCache();
	const stats = new Statistics(fakeAdapter, stateCache);

	// prepare hourly data for the past 10 days (1.0 per hour)
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
	start.setDate(start.getDate() - 10);
	const hours = [];
    
	for (let d = 0; d < 10; d++) {
        let consumptionToday = 0.0;
		for (let h = 0; h < 24; h++) {
			const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, h, 0, 0, 0);
			const to = new Date(from);
			to.setHours(to.getHours() + 1);
			const isoFrom = from.toISOString().replace('Z', '+00:00');
			const isoTo = to.toISOString().replace('Z', '+00:00');

            consumptionToday += 1.0;
			hours.push({ from: isoFrom, to: isoTo, consumption: (1.0).toFixed(3), consumptionToday: consumptionToday.toFixed(3) });
            console.log(`Hour ${d * 24 + h}: from ${isoFrom} to ${isoTo}, consumption: ${(1.0).toFixed(3)}, consumptionToday: ${consumptionToday.toFixed(3)}`);
		}
	}

	stateCache.set('statistics.jsonHourly', JSON.stringify(hours));
	await stats._calculateDaily();
	console.log('jsonDaily:', stateCache.get('statistics.jsonDaily')?.value);

	await stats._calculateWeekly();
	console.log('jsonWeekly:', stateCache.get('statistics.jsonWeekly')?.value);

	await stats._calculateMonthly();
	console.log('jsonMonthly:', stateCache.get('statistics.jsonMonthly')?.value);

	await stats._calculateAnnual();
	console.log('jsonAnnual:', stateCache.get('statistics.jsonAnnual')?.value);

	// demonstrate flexchart builder (hourly)
	const chart = stats._buildFlexchart('hourly');
	console.log('built chart options:', JSON.stringify(chart, null, 2));

})();
