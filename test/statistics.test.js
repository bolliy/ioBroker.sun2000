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
            { from: '2025-01-01T00:00:00.000+00:00', to: '2025-01-01T01:00:00.000+00:00', consumption: { value: 1 } },
            { from: '2025-01-01T01:00:00.000+00:00', to: '2025-01-01T02:00:00.000+00:00', consumption: { value: 2 } },
        ]));
        const stats = new Statistics(fakeAdapter, stateCache);
        stateCache.set('statistics.flexChartTemplate', '{}');

        const chart = stats._buildFlexchart('hourly');
        assert.strictEqual(chart.xAxis[0].data.length, 2);
        assert.ok(chart.series.length >= 1);
        assert.deepStrictEqual(chart.series[0].data, [1,2]);
        // unit should be picked up from stats definition
        assert.strictEqual(chart.series[0].unit, 'kWh');

        // also try the helper message handler – result should have same series data
        stats.handleFlexMessage({ chart: 'hourly' }, result => {
            assert.deepStrictEqual(result.series, chart.series);
            assert.deepStrictEqual(result.xAxis, chart.xAxis);
        });
    });

    it('should label axis and show unit when all series share one unit', () => {
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
        // override stats definition to single-unit
        const stats = new Statistics(fakeAdapter, stateCache);
        stats.stats = [{ sourceId: 'foo', targetPath: 'foo', unit: 'W', type: 0 }];
        stateCache.set('statistics.jsonHourly', JSON.stringify([
            { from: '2025-01-01T00:00:00.000+00:00', to: '2025-01-01T01:00:00.000+00:00', foo: { value: 5 } }
        ]));
        stateCache.set('statistics.flexChartTemplate', '{}');
        const chart = stats._buildFlexchart('hourly');
        assert.strictEqual(chart.yAxis[0].axisLabel.formatter.includes('W'), true);
        // tooltip formatter should be a function and incorporate the unit
        const tip = chart.tooltip.formatter({ seriesName: 'foo', value: 5 });
        assert.strictEqual(tip.includes('W'), true);
    });

    it('should merge a provided template', () => {        const fakeAdapter = {
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
        // add one data point
        stateCache.set('statistics.jsonHourly', JSON.stringify([
            { from: '2025-01-01T00:00:00.000+00:00', to: '2025-01-01T01:00:00.000+00:00', consumption: 1 }
        ]));
        // provide a template overriding title and adding a custom series
        stateCache.set(
            'statistics.flexChartTemplate',
            JSON.stringify({ title: { text: 'Custom' }, series: [{ name: 'Consumption', type: 'bar' }] })
        );
        const stats = new Statistics(fakeAdapter, stateCache);
        const c = stats._buildFlexchart('hourly');
        assert.strictEqual(c.title.text.startsWith('Custom'), true);
        assert.strictEqual(c.series[0].type, 'bar');
        // custom series should still receive unit from underlying stats
        assert.strictEqual(c.series[0].unit, 'kWh');
    });
});
