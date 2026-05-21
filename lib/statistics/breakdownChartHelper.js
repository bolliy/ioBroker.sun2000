'use strict';

/**
 * breakdownChartHelper.js
 *
 * Provides all eCharts-specific helpers related to the consumption breakdown feature.
 *
 * Responsibilities:
 *  - Building eCharts series objects for breakdown entries (stacked bars in the
 *    lower consumption grid: xAxisIndex 1 / yAxisIndex 2)
 *  - Merging breakdown series names into the chart legend array
 *  - Replacing breakdown data placeholders in chart template strings
 *    (%%targetPath%% → serialised data array)
 *
 * This module has no knowledge of ioBroker states, the stateCache, or scheduling.
 * It receives everything it needs as arguments, which makes it easy to unit-test.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fallback colour palette applied when a breakdown entry does not specify a colour.
 * Cycles through the list if more entries exist than colours.
 */
const DEFAULT_COLORS = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#03a9f4', '#009688', '#8bc34a', '#ff5722', '#795548', '#607d8b'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds an array of eCharts series configurations for the given breakdown entries.
 *
 * Each series is rendered as a stacked bar in the lower consumption sub-grid
 * (xAxisIndex 1, yAxisIndex 2) with stack key "consumptionBreakdown", so all
 * breakdown bars pile on top of one another.
 *
 * @param {import('./consumptionBreakdown').ConsumptionBreakdownEntry[]} entries
 *   The currently active breakdown entries (from ConsumptionBreakdown.entries).
 * @param {string} [seriesType]
 *   eCharts series type passed in from the caller ('bar' or 'line').
 * @param options - additional options to merge into each series config (e.g. for line styling)
 * @returns {Array} eCharts series array (may be empty when entries is empty)
 */
function buildBreakdownSeries(entries, seriesType = 'bar', options = {}) {
	if (!entries || entries.length === 0) return [];

	return entries.map((bd, idx) => {
		const color = bd.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
		const unit = bd.unit || 'kWh';

		return {
			name: bd.name,
			type: seriesType,
			stack: 'consumptionBreakdown', // same stack key as the Consumption series
			xAxisIndex: 1,
			yAxisIndex: 2,
			//data: seriesData[bd.targetPath] ?? [],
			data: `%%${bd.targetPath}%%`, // ensure it's an array (empty if undefined)
			itemStyle: { color },
			emphasis: { focus: 'series' },
			tooltip: {
				valueFormatter: `v => ({ value: v, unit: '${unit}' })`,
			},
			...options,
		};
	});
}

/**
 * Merges breakdown series names into an existing legend data array.
 *
 * Appends names that are not already present; mutates and returns the array.
 *
 * @param {string[]}                                                          legendData
 *   Existing legend labels (built-in series names).
 * @param {import('./consumptionBreakdown').ConsumptionBreakdownEntry[]}      entries
 *   Active breakdown entries whose names should appear in the legend.
 * @returns {string[]} The same legendData array with breakdown names appended.
 */
function mergeBreakdownLegend(legendData, entries) {
	if (!entries || entries.length === 0) return legendData;

	for (const bd of entries) {
		if (!legendData.includes(bd.name)) {
			legendData.push(bd.name);
		}
	}
	return legendData;
}

/**
 * Replaces breakdown data placeholders inside a serialised chart string.
 *
 * The template may contain placeholder tokens of the form  '%%targetPath%%'
 * (with surrounding single-quotes, as produced by javascript-stringify).
 * Each is replaced with the JSON-serialised numeric data array.
 *
 * This function is intentionally a string-level operation so it works both
 * for custom user templates (loaded from the state) and for the built-in
 * template produced by _buildDefaultTemplate().
 *
 * @param {string}                                                           chartStr
 *   The chart configuration as a raw string (output of stringify()).
 * @param {import('./consumptionBreakdown').ConsumptionBreakdownEntry[]}     entries
 *   Active breakdown entries.
 * @param {Record<string, number[]>}                                         seriesData
 *   Map of targetPath → data array.
 * @returns {string} The chart string with placeholders replaced.
 */
function replacePlaceholders(chartStr, entries, seriesData) {
	if (!entries || entries.length === 0) return chartStr;

	for (const bd of entries) {
		const placeholder = `'%%${bd.targetPath}%%'`;
		const value = JSON.stringify(seriesData[bd.targetPath] ?? []);
		chartStr = chartStr.replaceAll(placeholder, value);
	}
	return chartStr;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
	buildBreakdownSeries,
	mergeBreakdownLegend,
	replacePlaceholders,
};
