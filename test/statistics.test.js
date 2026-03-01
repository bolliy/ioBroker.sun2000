const Statistics = require('../lib/statistics.js');

// very simple unit tests for the flexchart builder
const assert = require('assert');

describe('statistics.flexchart', function () {
    it('should build a chart object from an empty dataset', async () => {
        const fakeAdapter = {
            logger: { debug: () => {}, warn: () => {}, log: () => {} },
            setTimeout: (fn, ms) => global.setTimeout(fn, ms),
            clearTimeout: id => global.clearTimeout(id),
            getState: async () => ({ val: undefined }),
        };
        class MockStateCache {
            constructor() { this.map = new Map(); }
            get(k) { const v = this.map.get(k); return v === undefined ? undefined : { value: v }; }
            set(k, v) { this.map.set(k, v); }
        }
        const stateCache = new MockStateCache();
        const stats = new Statistics(fakeAdapter, stateCache);
        // force the template state
        stateCache.set('statistics.flexChartTemplate', '{}');

        const obj = stats._buildFlexchart('hourly');
        assert.ok(obj, 'chart object returned');
        assert.ok(Array.isArray(obj.xAxis[0].data));
        assert.strictEqual(obj.series.length, 0, 'no series when data empty');
    });

    it('should include series for each statistic entry', async () => {
        const fakeAdapter = {
            logger: { debug: () => {}, warn: () => {}, log: () => {} },
            setTimeout: (fn, ms) => global.setTimeout(fn, ms),
            clearTimeout: id => global.clearTimeout(id),
            getState: async () => ({ val: undefined }),
        };
        class MockStateCache {
            constructor() { this.map = new Map(); }
            get(k) { const v = this.map.get(k); return v === undefined ? undefined : { value: v }; }
            set(k, v) { this.map.set(k, v); }
        }
        const stateCache = new MockStateCache();
        // put two hours of dummy data
        stateCache.set('statistics.jsonHourly', JSON.stringify([
            { from: '2025-01-01T00:00:00.000+00:00', to: '2025-01-01T01:00:00.000+00:00', consumption: 1 },
            { from: '2025-01-01T01:00:00.000+00:00', to: '2025-01-01T02:00:00.000+00:00', consumption: 2 },
        ]));
        const stats = new Statistics(fakeAdapter, stateCache);
        stateCache.set('statistics.flexChartTemplate', '{}');

        const chart = stats._buildFlexchart('hourly');
        assert.strictEqual(chart.xAxis[0].data.length, 2);
        assert.ok(chart.series.length >= 1);
        assert.deepStrictEqual(chart.series[0].data, [1,2]);
    });
});
