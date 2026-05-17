/**
statistics.js
 
This module prepares statistical data based on historical datapoints from the
Huawei SUN2000 inverter states. It aggregates raw values into structured
time-based datasets (e.g., hourly, daily, monthly, yearly) that can be used
for further analysis or visualization.
 
The goal of this processing layer is to provide normalized statistical data
independent from the raw state history.
 
In the mid-term, these statistics are intended to be visualized graphically
in ioBroker VIS using the ioBroker.flexcharts adapter.
 */

'use strict';

const stringify = require('javascript-stringify').stringify;
const { dataRefreshRate, statisticsType } = require(`${__dirname}/types.js`);
const tools = require(`${__dirname}/tools.js`);
const { stringifyWithFunctions, reviveFunctions } = require(`${__dirname}/json_helper.js`);

/**
 * sourceId      - ioBroker state ID (may be outside the adapter, accessed via getForeignStateAsync)
 * targetPath    - Internal key used in statistics entries and chart series (e.g. "washing_machine")
 * name          - Human-readable series label shown in the chart legend
 * [unit]        - Unit string displayed in tooltip (default: "kWh")
 * [gain]        - Divisor applied to the raw state value (default: 1)
 * [color]       - Optional hex color for the chart series (e.g. "#e91e63")
 * [type]        - statisticsType for this source: "deltaReset" (default) | "delta" | "level"
 */

/**
 * Default example breakdown definition stored in the state on first initialisation.
 * The user can overwrite this JSON at any time via the ioBroker object browser or VIS.
 *
 * Example:
 * [
 *   {
 *     "sourceId": "hm-rpc.0.OEQ1234567.1.ENERGY_COUNTER",
 *     "targetPath": "washingMachine",
 *     "name": "Washing Machine",
 *     "unit": "kWh",
 *     "gain": 1000,
 *     "color": "#e91e63",
 *     "type": "deltaReset"
 *   }
 * ]
 */
const BREAKDOWN_DEFAULT = JSON.stringify([], null, 2);

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.taskTimer = null;
		this._path = 'statistics';
		this._initialized = false;
		this.testing = false; // set to true for testing purposes

		this._consumptionBreakdown = [];

		this.stats = [
			{
				sourceId: 'collected.consumptionToday',
				targetPath: 'consumption',
				unit: 'kWh',
				type: statisticsType.deltaReset,
			},
			{
				sourceId: 'collected.dailySolarYield',
				targetPath: 'solarYield',
				unit: 'kWh',
				type: statisticsType.deltaReset,
			},
			{ sourceId: 'collected.dailyInputYield', targetPath: 'inputYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyExternalYield', targetPath: 'externalYield', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.dailyEnergyYield', targetPath: 'energyYield', unit: 'kWh', type: statisticsType.deltaReset },
			{
				sourceId: 'collected.SOC',
				targetPath: 'SOC',
				unit: '%',
				type: statisticsType.level,
			},
			{ sourceId: 'collected.currentDayChargeCapacity', targetPath: 'chargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.currentDayDischargeCapacity', targetPath: 'dischargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.gridExportToday', targetPath: 'gridExport', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.gridImportToday', targetPath: 'gridImport', unit: 'kWh', type: statisticsType.deltaReset },
			// --- Computed stats ---
			{
				targetPath: 'selfSufficiency',
				unit: '%',
				type: statisticsType.computed,
				// selfSufficiency = (consumption - gridImport)/consumption * 100
				compute: entry => {
					const consumption = (entry.consumption?.total != null ? entry.consumption?.total : entry.consumption?.value) ?? 0;
					const gridImport = (entry.gridImport?.total != null ? entry.gridImport?.total : entry.gridImport?.value) ?? 0;
					if (consumption <= 0) return 100;
					return Math.round(Math.max(0, Math.min(100, (1 - gridImport / consumption) * 100)) * 10) / 10;
				},
			},
			{
				targetPath: 'selfConsumption',
				unit: '%',
				type: statisticsType.computed,
				// selfConsumption = (solarYield - gridExport) / solarYield * 100
				compute: entry => {
					let solarYield = (entry.solarYield?.total != null ? entry.solarYield?.total : entry.solarYield?.value) ?? 0;
					solarYield += (entry.externalYield?.total != null ? entry.externalYield?.total : entry.externalYield?.value) ?? 0;
					const gridExport = (entry.gridExport?.total != null ? entry.gridExport?.total : entry.gridExport?.value) ?? 0;
					if (solarYield <= 0) return 0;
					return Math.round(Math.max(0, Math.min(100, (1 - gridExport / solarYield) * 100)) * 10) / 10;
				},
			},
		];

		this.postProcessHooks = [
			{
				refresh: dataRefreshRate.low,
				states: [
					{
						id: 'statistics.jsonHourly',
						name: 'Hourly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Hourly consumption for last and current day per full hour',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonDaily',
						name: 'Daily consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Daily consumption for current month per day',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonWeekly',
						name: 'Weekly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Weekly consumption for current year per week',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonMonthly',
						name: 'Monthly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Monthly consumption for current year per month',
						initVal: '[]',
					},
					{
						id: 'statistics.jsonAnnual',
						name: 'Annual consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Annual consumption per year',
						initVal: '[]',
					},
					// Today summary state
					{
						id: 'statistics.jsonToday',
						name: 'Today summary',
						type: 'string',
						role: 'json',
						desc: "Live summary of today's energy values",
						initVal: '{}',
					},
					// Consumption breakdown definition
					{
						id: 'statistics.consumptionBreakdown',
						name: 'Consumption breakdown definition',
						type: 'string',
						role: 'json',
						desc: 'JSON array defining how to split consumption into sub-categories for charting. See adapter documentation for schema.',
						write: true,
						initVal: BREAKDOWN_DEFAULT,
					},
					// Templates: one per chart type
					{
						id: 'statistics.flexCharts.template.hourly',
						name: 'Flexcharts template hourly',
						type: 'string',
						role: 'json',
						desc: 'Optional eCharts template for hourly chart. Leave empty {} for built-in layout.',
						write: true,
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.template.daily',
						name: 'Flexcharts template daily',
						type: 'string',
						role: 'json',
						desc: 'Optional eCharts template for daily chart. Leave empty {} for built-in layout.',
						write: true,
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.template.weekly',
						name: 'Flexcharts template weekly',
						type: 'string',
						role: 'json',
						desc: 'Optional eCharts template for weekly chart. Leave empty {} for built-in layout.',
						write: true,
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.template.monthly',
						name: 'Flexcharts template monthly',
						type: 'string',
						role: 'json',
						desc: 'Optional eCharts template for monthly chart. Leave empty {} for built-in layout.',
						write: true,
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.template.annual',
						name: 'Flexcharts template annual',
						type: 'string',
						role: 'json',
						desc: 'Optional eCharts template for annual chart. Leave empty {} for built-in layout.',
						write: true,
						initVal: '{}',
					},
					// Output: one per chart type
					{
						id: 'statistics.flexCharts.jsonOutput.hourly',
						name: 'Flexcharts output hourly',
						type: 'string',
						role: 'json',
						desc: 'ECharts configuration for hourly chart',
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.jsonOutput.daily',
						name: 'Flexcharts output daily',
						type: 'string',
						role: 'json',
						desc: 'ECharts configuration for daily chart',
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.jsonOutput.weekly',
						name: 'Flexcharts output weekly',
						type: 'string',
						role: 'json',
						desc: 'ECharts configuration for weekly chart',
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.jsonOutput.monthly',
						name: 'Flexcharts output monthly',
						type: 'string',
						role: 'json',
						desc: 'ECharts configuration for monthly chart',
						initVal: '{}',
					},
					{
						id: 'statistics.flexCharts.jsonOutput.annual',
						name: 'Flexcharts output annual',
						type: 'string',
						role: 'json',
						desc: 'ECharts configuration for annual chart',
						initVal: '{}',
					},
				],
			},
		];
		this.initialize();
	}

	get processHooks() {
		return this.postProcessHooks;
	}

	// ---------------------------------------------------------------------------
	// Consumption Breakdown helpers
	// ---------------------------------------------------------------------------

	/**
	 * Parses and validates the raw JSON string from the consumptionBreakdown state.
	 * Invalid entries are skipped with a warning.
	 *
	 * @param {string} rawJson
	 * @returns {ConsumptionBreakdownEntry[]} matter if the JSON is valid or not, returns an array (possibly empty) of valid breakdown entries
	 */
	_parseBreakdownConfig(rawJson) {
		let arr = [];
		try {
			arr = JSON.parse(rawJson);
			if (!Array.isArray(arr)) {
				this.adapter.logger.warn('statistics: consumptionBreakdown must be a JSON array – ignoring.');
				return [];
			}
		} catch (e) {
			this.adapter.logger.warn(`statistics: consumptionBreakdown parse error: ${e.message}`);
			return [];
		}

		const valid = [];
		for (const entry of arr) {
			if (typeof entry.sourceId !== 'string' || !entry.sourceId) {
				this.adapter.logger.warn(`statistics: consumptionBreakdown entry missing 'sourceId' – skipping: ${JSON.stringify(entry)}`);
				continue;
			}
			if (typeof entry.targetPath !== 'string' || !entry.targetPath) {
				this.adapter.logger.warn(`statistics: consumptionBreakdown entry missing 'targetPath' – skipping: ${JSON.stringify(entry)}`);
				continue;
			}
			if (typeof entry.name !== 'string' || !entry.name) {
				this.adapter.logger.warn(`statistics: consumptionBreakdown entry missing 'name' – skipping: ${JSON.stringify(entry)}`);
				continue;
			}
			// Ensure no collision with built-in targetPaths
			const builtinPaths = this.stats.map(s => s.targetPath);
			if (builtinPaths.includes(entry.targetPath)) {
				this.adapter.logger.warn(`statistics: consumptionBreakdown targetPath '${entry.targetPath}' collides with a built-in stat – skipping.`);
				continue;
			}
			valid.push({
				sourceId: entry.sourceId,
				targetPath: entry.targetPath,
				name: entry.name,
				unit: typeof entry.unit === 'string' ? entry.unit : 'kWh',
				gain: typeof entry.gain === 'number' && entry.gain !== 0 ? entry.gain : 1,
				color: typeof entry.color === 'string' ? entry.color : null,
				type: entry.type === statisticsType.delta || entry.type === statisticsType.level ? entry.type : statisticsType.deltaReset,
			});
		}
		return valid;
	}

	/**
	 * Reads the current values of all breakdown source states from ioBroker
	 * (using getForeignStateAsync because they may be outside the adapter namespace)
	 * and caches them in the stateCache under a private key so the existing
	 * _calculateGeneric / _calculateAggregation code can reach them.
	 *
	 * @returns {Promise<void>}
	 */
	async _refreshBreakdownValues() {
		for (const bd of this._consumptionBreakdown) {
			const cacheKey = `statistics._breakdown.${bd.targetPath}`;
			try {
				const state = await this.adapter.getForeignStateAsync(bd.sourceId);
				if (state && state.val !== null && state.val !== undefined) {
					const rawVal = Number(state.val);
					if (!isNaN(rawVal)) {
						this.stateCache.set(cacheKey, rawVal / bd.gain, { type: 'number' });
					} else {
						this.adapter.logger.debug(`statistics: breakdown '${bd.targetPath}' value is not a number: ${state.val}`);
					}
				} else {
					this.adapter.logger.debug(`statistics: breakdown '${bd.targetPath}' state '${bd.sourceId}' not available.`);
				}
			} catch (err) {
				this.adapter.logger.warn(`statistics: breakdown '${bd.targetPath}' – error reading '${bd.sourceId}': ${err.message}`);
			}
		}
	}

	/**
	 * Returns a combined stats array that includes the built-in stats plus
	 * the currently active breakdown entries (mapped to the same schema so all
	 * existing processing code can iterate over them transparently).
	 *
	 * @returns {Array} Array of stat definitions including breakdown entries
	 */
	_effectiveStats() {
		const breakdownStats = this._consumptionBreakdown.map(bd => ({
			sourceId: `statistics._breakdown.${bd.targetPath}`,
			targetPath: bd.targetPath,
			unit: bd.unit,
			type: bd.type,
			_isBreakdown: true,
		}));
		return [...this.stats, ...breakdownStats];
	}

	// ---------------------------------------------------------------------------
	// Existing helpers (unchanged except where noted)
	// ---------------------------------------------------------------------------

	/**
	 * Helper function to format date as ISO string with timezone offset.
	 *
	 * @param {Date} d - The date to format
	 * @returns {string} ISO formatted date string with timezone offset
	 */
	_localIsoWithOffset(d) {
		const pad = n => String(n).padStart(2, '0');
		const year = d.getFullYear();
		const month = pad(d.getMonth() + 1);
		const day = pad(d.getDate());
		const hours = pad(d.getHours());
		const minutes = pad(d.getMinutes());
		const seconds = pad(d.getSeconds());
		const tzOffset = -d.getTimezoneOffset();
		const sign = tzOffset >= 0 ? '+' : '-';
		const absMin = Math.abs(tzOffset);
		const offH = pad(Math.floor(absMin / 60));
		const offM = pad(absMin % 60);
		return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000${sign}${offH}:${offM}`;
	}

	/**
	 * Generic function to calculate consumption statistics for different time periods.
	 * Uses _effectiveStats() so breakdown entries are processed alongside built-in ones.
	 *
	 * @param {string} stateId - The state ID for storing the JSON
	 * @param {Date} periodStart - The start of the current period
	 * @param {Date} periodEnde - The end of the current period
	 * @returns {boolean} true if a new entry was appended, false otherwise.
	 */
	_calculateGeneric(stateId, periodStart, periodEnde) {
		const effectiveStats = this._effectiveStats();

		const toStr = this._localIsoWithOffset(periodEnde);
		let jsonStr = this.stateCache.get(stateId)?.value ?? '[]';
		let arr = [];
		try {
			arr = JSON.parse(jsonStr);
			if (!Array.isArray(arr)) arr = [];
		} catch {
			arr = [];
		}
		let fromDate = periodStart;
		let last = {};
		if (arr.length > 0) {
			last = arr[arr.length - 1];
			if (last.to === toStr) return false;
			const lastToDate = new Date(last.to);
			const toDate = new Date(toStr);
			if (lastToDate >= periodStart || toDate <= periodStart) {
				fromDate = lastToDate;
			}
		}

		const entry = {
			from: this._localIsoWithOffset(fromDate),
			to: toStr,
		};

		// First pass: deltaReset, delta, level stats (built-in + breakdown)
		for (const stat of effectiveStats) {
			if (stat.type === statisticsType.computed) continue;

			const source = this.stateCache.get(stat.sourceId)?.value;
			if (source === null || source === undefined) {
				if (!stat._isBreakdown) {
					this.adapter.logger.warn(`Source state ${stat.sourceId} not found statistic hook`);
				}
				continue;
			}
			let value = Number(source);
			if (stat.type === statisticsType.delta || stat.type === statisticsType.deltaReset) {
				const lastTotal = Number(last[stat.targetPath]?.['total'] ?? 0);
				if (stat.type === statisticsType.deltaReset) {
					if (fromDate.getTime() !== periodStart.getTime()) {
						value -= lastTotal;
					}
				} else {
					if (last[stat.targetPath]?.['total'] === undefined) {
						this.adapter.logger.debug(`No total value found for ${stat.targetPath} in last entry, setting delta to 0`);
						value = 0;
					} else {
						value -= lastTotal;
					}
				}
			}
			value = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
			entry[stat.targetPath] = { value: Number(value.toFixed(3)) };
			if (stat.type === statisticsType.delta || stat.type === statisticsType.deltaReset) {
				entry[stat.targetPath].total = Number(source.toFixed(3));
			}
			entry[stat.targetPath].unit = stat.unit || 'kWh';
		}

		// Second pass: computed stats
		for (const stat of effectiveStats) {
			if (stat.type !== statisticsType.computed) continue;
			try {
				const value = stat.compute(entry);
				entry[stat.targetPath] = {
					value: Number(Number(value).toFixed(3)),
					unit: stat.unit || '%',
				};
			} catch (e) {
				this.adapter.logger.warn(`statistics: error computing ${stat.targetPath}: ${e.message}`);
				entry[stat.targetPath] = { value: 0, unit: stat.unit || '%' };
			}
		}

		arr.push(entry);
		arr.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
		this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
		this.adapter.logger.debug(`Appended ${stateId} statistic ${toStr}`);
		return arr.length > 0;
	}

	/**
	 * Removes entries older than periodStart from the given state.
	 *
	 * @param {string} stateId
	 * @param {Date} periodStart
	 */
	_clearGeneric(stateId, periodStart) {
		let jsonStr = this.stateCache.get(stateId)?.value ?? '[]';
		let arr = [];
		try {
			arr = JSON.parse(jsonStr);
			if (!Array.isArray(arr)) arr = [];
		} catch {
			arr = [];
		}
		arr = arr.filter(item => {
			const ts = Date.parse(item.from);
			return !Number.isNaN(ts) && ts >= periodStart.getTime();
		});
		this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
	}

	// eslint-disable-next-line jsdoc/require-returns-check
	/**
	 * Calculates and aggregates statistics for a given time window.
	 * Uses _effectiveStats() so breakdown entries are included.
	 *
	 * @param {string} sourceStateId
	 * @param {string} targetStateId
	 * @param {Function} getWindow
	 * @param {string} periodType
	 * @returns {boolean} true if the target state was updated with new data, false otherwise.
	 */
	_calculateAggregation(sourceStateId, targetStateId, getWindow, periodType) {
		const effectiveStats = this._effectiveStats();

		try {
			const now = new Date();
			const window = getWindow(now);
			const fromDate = window.from;
			const toDate = window.to;

			const isRunning = now < toDate;
			const effectiveTo = isRunning ? now : toDate;
			const toStr = this._localIsoWithOffset(effectiveTo);

			let jsonTarget = this.stateCache.get(targetStateId)?.value ?? '[]';
			let targetArray = [];
			try {
				targetArray = JSON.parse(jsonTarget);
				if (!Array.isArray(targetArray)) targetArray = [];
			} catch {
				targetArray = [];
			}

			const fromStr = this._localIsoWithOffset(fromDate);
			const existingIdx = targetArray.findLastIndex(e => (isRunning ? e._live === true : e.from === fromStr));

			if (!isRunning && existingIdx >= 0) {
				if (targetArray[existingIdx] === this._localIsoWithOffset(toDate)) {
					this.adapter.logger.debug(`statistics.js: ${periodType} entry already finalized, skipping`);
					return false;
				}
			}

			const target = {
				from: fromStr,
				to: toStr,
			};

			if (isRunning) {
				target._live = true;
			}

			let jsonStr = this.stateCache.get(sourceStateId)?.value ?? '[]';
			let sourceEntries = [];
			try {
				sourceEntries = JSON.parse(jsonStr);
				if (!Array.isArray(sourceEntries)) sourceEntries = [];
			} catch {
				sourceEntries = [];
			}

			sourceEntries = sourceEntries.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= fromDate.getTime() && ts < toDate.getTime();
			});

			if (sourceEntries.length === 0) {
				this.adapter.logger.debug(
					`statistics.js: No source entries for ${periodType} between ${fromDate.toISOString()} and ${toDate.toISOString()}, skipping`,
				);
				return false;
			}

			this.adapter.logger.debug(
				`statistics.js: ${sourceEntries.length} source entries for ${periodType} between ${fromDate.toISOString()} and ${effectiveTo.toISOString()} (running=${isRunning})`,
			);

			// First pass: sum delta/deltaReset stats (built-in + breakdown)
			for (const stat of effectiveStats) {
				if (stat.type === statisticsType.level) continue;
				if (stat.type === statisticsType.computed) continue;

				let sum = 0;
				try {
					sourceEntries.forEach(entry => {
						sum += Number(entry[stat.targetPath]?.['value'] ?? 0);
					});
				} catch (e) {
					this.adapter.logger.warn(`statistics.js: Error during ${periodType} aggregation: ${e.message}`);
				}
				sum = Math.round((Number(sum) + Number.EPSILON) * 1000) / 1000;
				target[stat.targetPath] = { value: Number(sum.toFixed(3)), unit: stat.unit || 'kWh' };
			}

			// Second pass: computed stats
			for (const stat of effectiveStats) {
				if (stat.type !== statisticsType.computed) continue;
				try {
					const value = stat.compute(target);
					target[stat.targetPath] = {
						value: Number(Number(value).toFixed(3)),
						unit: stat.unit || '%',
					};
				} catch (e) {
					this.adapter.logger.warn(`statistics: error computing ${stat.targetPath}: ${e.message}`);
					target[stat.targetPath] = { value: 0, unit: stat.unit || '%' };
				}
			}

			if (existingIdx >= 0) {
				targetArray[existingIdx] = target;
				this.adapter.logger.debug(`statistics.js: Updated ${periodType} entry (running=${isRunning})`);
			} else {
				targetArray.push(target);
				this.adapter.logger.debug(`statistics.js: Appended ${periodType} entry (running=${isRunning})`);
			}

			targetArray.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
			this.stateCache.set(targetStateId, JSON.stringify(targetArray), { type: 'string' });
			return targetArray.length > 0;
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} aggregation: ${err.message}`);
		}
	}

	/**
	 * Updates the statistics.jsonToday state with the current live day values.
	 * Reads directly from the stateCache (collected.*) and computes derived values.
	 * Also includes breakdown values if configured.
	 */
	updateJsonToday() {
		if (!this._initialized) {
			this.adapter.logger.debug('statistics: updateJsonToday called before initialization');
			return;
		}

		try {
			const now = new Date();
			const today = {};
			const effectiveStats = this._effectiveStats();

			// Read all non-computed stats directly from stateCache
			for (const stat of effectiveStats) {
				if (stat.type === statisticsType.computed) continue;
				const val = this.stateCache.get(stat.sourceId)?.value;
				today[stat.targetPath] = {
					value: val != null ? Number(Number(val).toFixed(3)) : null,
					unit: stat.unit,
				};
			}

			// Compute derived stats
			for (const stat of effectiveStats) {
				if (stat.type !== statisticsType.computed) continue;
				try {
					const proxyEntry = {};
					for (const key of Object.keys(today)) {
						proxyEntry[key] = today[key];
					}
					const value = stat.compute(proxyEntry);
					today[stat.targetPath] = {
						value: Number(Number(value).toFixed(3)),
						unit: stat.unit || '%',
					};
				} catch (e) {
					this.adapter.logger.warn(`statistics: error computing today.${stat.targetPath}: ${e.message}`);
					today[stat.targetPath] = { value: 0, unit: stat.unit || '%' };
				}
			}

			today.updatedAt = this._localIsoWithOffset(now);

			const todayStr = JSON.stringify(today);
			this.stateCache.set('statistics.jsonToday', todayStr, { type: 'string' });
			this.adapter.logger.debug('statistics: jsonToday state updated');
		} catch (err) {
			this.adapter.logger.warn(`statistics: error updating today state: ${err.message}`);
		}
	}

	/**
	 * Calculates and updates hourly consumption statistics.
	 */
	_calculateHourly() {
		const now = new Date();
		if (this.testing) {
			const state = this.adapter.getState('statistics.jsonHourly');
			this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });
			now.setDate(now.getDate() + 1);
			now.setHours(1, 0, 0, 1);
		}
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
		this.adapter.log.debug(`### Hourly execution triggered with lastHour: ${lastHour.toLocaleTimeString()} ###`);
		if (this._calculateGeneric('statistics.jsonHourly', startOfDay, lastHour)) {
			this._buildFlexchart('hourly');
		}
	}

	_calculateDaily() {
		this.adapter.log.debug('### Daily execution triggered ###');

		this._calculateAggregation(
			'statistics.jsonHourly',
			'statistics.jsonDaily',
			now => {
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const yesterday = new Date(today);
				yesterday.setDate(today.getDate() - 1);
				return { from: yesterday, to: today };
			},
			'daily',
		);
		this._calculateAggregation(
			'statistics.jsonHourly',
			'statistics.jsonDaily',
			now => {
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const tomorrow = new Date(today);
				tomorrow.setDate(today.getDate() + 1);
				return { from: today, to: tomorrow };
			},
			'daily-live',
		);
		this._buildFlexchart('daily');
	}

	/**
	 * Calculates and updates weekly consumption statistics from daily data.
	 */
	_calculateWeekly() {
		this.adapter.log.debug('### Weekly execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonWeekly',
			now => {
				const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				monday.setDate(now.getDate() - (now.getDay() || 7) + 1);
				const prevMonday = new Date(monday);
				prevMonday.setDate(monday.getDate() - 7);
				return { from: prevMonday, to: monday };
			},
			'weekly',
		);
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonWeekly',
			now => {
				const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				monday.setDate(now.getDate() - (now.getDay() || 7) + 1);
				const nextMonday = new Date(monday);
				nextMonday.setDate(monday.getDate() + 7);
				return { from: monday, to: nextMonday };
			},
			'weekly-live',
		);
		this._buildFlexchart('weekly');
	}

	/**
	 * Calculates and updates monthly consumption statistics from daily data.
	 */
	_calculateMonthly() {
		this.adapter.log.debug('### Monthly execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonMonthly',
			now => {
				const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
				const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
				return { from: prevMonth, to: thisMonth };
			},
			'monthly',
		);
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonMonthly',
			now => {
				const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
				const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
				return { from: thisMonth, to: nextMonth };
			},
			'monthly-live',
		);
		this._buildFlexchart('monthly');
	}

	/**
	 * Calculates and updates annual consumption statistics from daily data.
	 */
	_calculateAnnual() {
		this.adapter.log.debug('### Annual execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonAnnual',
			now => {
				const thisYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
				const prevYear = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
				return { from: prevYear, to: thisYear };
			},
			'annual',
		);
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonAnnual',
			now => {
				const thisYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
				const nextYear = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
				return { from: thisYear, to: nextYear };
			},
			'annual-live',
		);
		this._buildFlexchart('annual');
	}

	/**
	 * Initialize and schedule the unified task manager.
	 * Runs every full hour. Before each run, breakdown values are refreshed.
	 */
	_initializeTask() {
		const scheduleNextRun = () => {
			const now = new Date();

			const next = new Date(now);
			if (this.testing) {
				next.setMinutes(now.getMinutes() + 1, 0, 0);
			} else {
				next.setHours(next.getHours() + 1, 0, 0, 100);
			}
			if (next.getHours() === 0 && next.getMinutes() === 0) {
				next.setHours(next.getHours() + 1, 0, 0, 0);
			}
			const msToNextHour = next.getTime() - now.getTime();
			this.adapter.logger.debug(`### Statistics - Scheduler start ${now.toLocaleTimeString()} next ${next.toLocaleTimeString()}`);

			if (this.taskTimer) {
				this.adapter.clearTimeout(this.taskTimer);
			}
			this.taskTimer = this.adapter.setTimeout(async () => {
				await this._executeScheduledTasks();
				scheduleNextRun();
			}, msToNextHour);
		};
		scheduleNextRun();
	}

	/**
	 * Refresh breakdown values from foreign states, then run all scheduled calculations.
	 */
	async _executeScheduledTasks() {
		await this._refreshBreakdownValues();
		this._calculateHourly();
		this._calculateDaily();
		this._calculateWeekly();
		this._calculateMonthly();
		this._calculateAnnual();
	}

	/**
	 * Executes every midnight:
	 * - Runs all scheduled tasks
	 * - Clears old data based on retention policies
	 */
	async mitNightProcess() {
		const now = new Date();
		await this._executeScheduledTasks();
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		this._clearGeneric('statistics.jsonDaily', startOfYear);
		this._clearGeneric('statistics.jsonWeekly', startOfYear);
		this._clearGeneric('statistics.jsonMonthly', startOfYear);
		this._clearGeneric('statistics.jsonHourly', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0));
	}

	async initialize() {
		let state = await this.adapter.getState('statistics.jsonHourly');
		this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonDaily');
		this.stateCache.set('statistics.jsonDaily', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonWeekly');
		this.stateCache.set('statistics.jsonWeekly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonMonthly');
		this.stateCache.set('statistics.jsonMonthly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonAnnual');
		this.stateCache.set('statistics.jsonAnnual', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonToday');
		this.stateCache.set('statistics.jsonToday', state?.val ?? '{}', { type: 'string', stored: true });

		// Load consumption breakdown configuration
		state = await this.adapter.getState('statistics.consumptionBreakdown');
		const breakdownRaw = state?.val ?? BREAKDOWN_DEFAULT;
		this.stateCache.set('statistics.consumptionBreakdown', breakdownRaw, { type: 'string', stored: true });
		this._consumptionBreakdown = this._parseBreakdownConfig(breakdownRaw);
		this.adapter.logger.info(
			`statistics: consumptionBreakdown loaded with ${this._consumptionBreakdown.length} entr${this._consumptionBreakdown.length === 1 ? 'y' : 'ies'}.`,
		);

		try {
			await tools.waitForValue(() => this.stateCache.get('collected.accumulatedEnergyYield')?.value, 5 * 60000);
		} catch {
			this.adapter.logger.warn(
				"statistics: waited 5 minutes for state 'collected.accumulatedEnergyYield' to be available but it didn't, computed statistics will not work until this state is present",
			);
		}

		// Load templates — one per chart type
		for (const chartType of ['hourly', 'daily', 'weekly', 'monthly', 'annual']) {
			const templateStateId = `statistics.flexCharts.template.${chartType}`;
			state = await this.adapter.getState(templateStateId);
			this.stateCache.set(templateStateId, state?.val ?? '{}', { type: 'string', stored: true });
			if (state?.ack === false) {
				this.stateCache.set(templateStateId, state.val, { type: 'string' });
				await this.adapter.setState(templateStateId, { val: state.val, ack: true });
				this._buildFlexchart(chartType);
			}
		}

		// Initial breakdown value refresh before the first scheduled run
		await this._refreshBreakdownValues();

		this.mitNightProcess();
		this._initializeTask();
		this.adapter.subscribeStates(`${this._path}.*`);
		this._initialized = true;
	}

	// ---------------------------------------------------------------------------
	// Chart building
	// ---------------------------------------------------------------------------

	/**
	 * Builds and updates the Flexchart configuration for the specified chart type.
	 * Breakdown series are appended as additional stacked bars/lines in the lower
	 * consumption grid (yAxisIndex 2 / xAxisIndex 1).
	 *
	 * @param {string} myChart - 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual'
	 * @param {string} [chartStyle] - 'line' | 'bar' — defaults to 'line' for hourly, 'bar' for others
	 * @returns {string} The generated chart configuration as a javascript-stringify string
	 */
	_buildFlexchart(myChart, chartStyle) {
		chartStyle = chartStyle || (myChart === 'hourly' ? 'line' : 'bar');

		const IDS = {
			hourly: 'statistics.jsonHourly',
			daily: 'statistics.jsonDaily',
			weekly: 'statistics.jsonWeekly',
			monthly: 'statistics.jsonMonthly',
			annual: 'statistics.jsonAnnual',
		};
		const id = IDS[myChart] || IDS.hourly;
		let data = [];
		try {
			data = JSON.parse(this.stateCache.get(id)?.value ?? '[]');
		} catch {
			data = [];
		}

		// --- X-Axis labels ---
		const xAxisData = data.map(entry => {
			const from = new Date(entry.from);
			const to = new Date(entry.to);
			if (myChart === 'hourly') {
				return `${to.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${to.toLocaleTimeString('de-DE', {
					hour12: false,
					hour: '2-digit',
					minute: '2-digit',
				})}`;
			}
			if (myChart === 'weekly') {
				const toDay = new Date(to);
				if (toDay.getHours() === 0 && toDay.getMinutes() === 0) {
					toDay.setDate(toDay.getDate() - 1);
				}
				return `${from.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}-${toDay.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}`;
			}
			if (myChart === 'monthly') {
				return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit' });
			}
			if (myChart === 'annual') {
				return from.toLocaleDateString('de-DE', { year: 'numeric' });
			}
			return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
		});

		const xAxisDataShort = myChart === 'hourly' ? xAxisData.map(label => label.split(' ')[1]) : xAxisData;

		// --- Day areas (hourly only) ---
		const dayAreas = [];
		if (myChart === 'hourly' && xAxisData.length > 0) {
			const dayBoundaries = [0];
			xAxisData.forEach((label, i) => {
				if (i === 0) return;
				const date = label.split(' ')[0];
				const prevDate = xAxisData[i - 1].split(' ')[0];
				if (date !== prevDate) dayBoundaries.push(i);
			});
			dayBoundaries.push(xAxisData.length);

			dayBoundaries.forEach((startIdx, d) => {
				if (d >= dayBoundaries.length - 1) return;
				const endIdx = dayBoundaries[d + 1];
				const date = xAxisData[startIdx].split(' ')[0];
				const shaded = d % 2 === 1;
				dayAreas.push([
					{
						xAxis: startIdx - 0.5,
						label: {
							show: true,
							position: 'insideTop',
							formatter: date,
							color: '#555',
							fontSize: 11,
							fontWeight: 'bold',
							backgroundColor: 'rgba(255,255,255,0.7)',
							padding: [2, 4],
							borderRadius: 3,
						},
					},
					{
						xAxis: endIdx - 0.5,
						itemStyle: shaded
							? { color: 'rgba(180,180,180,0.15)', borderColor: 'rgba(120,120,120,0.3)', borderWidth: 1, borderType: 'dashed' }
							: { color: 'rgba(255,255,255,0)' },
					},
				]);
			});
		}

		// --- Series data extraction ---
		const extract = key => data.map(e => Number(Number(e[key]?.value ?? 0).toFixed(3)));
		const negate = arr => arr.map(v => Number((-v).toFixed(3)));

		// Build seriesData from all this.stats entries (targetPath as key)
		const seriesData = {};
		for (const stat of this.stats) {
			const values = extract(stat.targetPath);
			seriesData[stat.targetPath] = values;
			seriesData[`${stat.targetPath}Neg`] = negate(values);
		}
		// Add breakdown series data
		for (const bd of this._consumptionBreakdown) {
			const values = extract(bd.targetPath);
			seriesData[bd.targetPath] = values;
		}

		// --- X-Axis label formatter (hourly only) ---
		const xAxisFormatter = value => {
			if (value.includes('|')) return value;
			return value.split(' ')[1] ?? value;
		};

		// --- Tooltip formatter ---
		const tooltipFormatter = params => {
			if (!Array.isArray(params)) params = [params];
			return params
				.filter(p => p.seriesName !== 'DayBreak')
				.map(p => {
					if (typeof p.value === 'object') {
						const val = p.value.value;
						const unit = p.value.unit || 'kWh';
						return `${p.marker}${p.seriesName}: <b>${val}${unit}</b>`;
					}
					const negatedSeries = ['Grid Export', 'Charge'];
					const val = negatedSeries.includes(p.seriesName) ? Math.abs(p.value) : p.value;
					const unit = ['SOC', 'Self-sufficiency', 'Self-consumption'].includes(p.seriesName) ? ' %' : ' kWh';
					const seriesName =
						myChart === 'hourly' && ['Self-sufficiency', 'Self-consumption'].includes(p.seriesName) ? `${p.seriesName} today` : p.seriesName;
					return `${p.marker}${seriesName}: <b>${val}${unit}</b>`;
				})
				.join('<br/>');
		};

		// --- Load chart-type specific template ---
		const templateStateId = `statistics.flexCharts.template.${myChart}`;
		const outputStateId = `statistics.flexCharts.jsonOutput.${myChart}`;

		const templateStr = this.stateCache.get(templateStateId)?.value ?? '{}';
		let template = {};
		let command = '';

		try {
			const templ = JSON.parse(templateStr);
			command = templ.command || '';
			if (Object.keys(templ).length === 0 || command === 'createTemplateFromBuiltin') {
				template = this._buildDefaultTemplate(myChart, chartStyle);
			} else {
				delete templ._meta;
				template = reviveFunctions(templ);
			}
		} catch (e) {
			this.adapter.logger.warn(`statistics: invalid template for ${myChart}: ${e.message}`);
			template = this._buildDefaultTemplate(myChart, chartStyle);
		}

		// No-data hint — chart-type specific
		const noDataHints = {
			hourly: 'No data yet — first entry available after the next full hour.',
			daily: 'No data yet — first entry available tomorrow after midnight.',
			weekly: 'No data yet — first entry available after the current week ends.',
			monthly: 'No data yet — first entry available after the current month ends.',
			annual: 'No data yet — first entry available after the current year ends.',
		};

		// --- Build breakdown series for lower grid ---
		const breakdownSeriesBuiltin = this._buildBreakdownSeries(myChart, seriesData);

		const chart = {
			...template,
			series: [
				...(template.series ?? []),
				// Day-break areas (hourly only)
				...(dayAreas.length > 0
					? [
							{
								name: 'DayBreak',
								type: 'bar',
								barWidth: 0,
								data: [],
								legendHoverLink: false,
								silent: true,
								markArea: {
									silent: true,
									data: dayAreas,
								},
							},
						]
					: []),
				// Breakdown series injected into lower chart grid
				...breakdownSeriesBuiltin,
			],
			// No-data graphic
			graphic:
				xAxisData.length === 0
					? [
							{
								type: 'text',
								left: 'center',
								top: 'middle',
								style: {
									text: noDataHints[myChart] || 'No data available yet.',
									fontSize: 14,
									fill: '#999',
								},
							},
						]
					: [],
		};

		// --- Slider start position ---
		const sliderDefaults = {
			hourly: { start: Math.max(0, Math.round((1 - 25 / Math.max(xAxisData.length, 1)) * 100)), end: 100 },
			daily: { start: Math.max(0, Math.round((1 - 7 / Math.max(xAxisData.length, 1)) * 100)), end: 100 },
			weekly: { start: Math.max(0, Math.round((1 - 8 / Math.max(xAxisData.length, 1)) * 100)), end: 100 },
			monthly: { start: Math.max(0, Math.round((1 - 13 / Math.max(xAxisData.length, 1)) * 100)), end: 100 },
			annual: { start: 0, end: 100 },
		};
		const slider = sliderDefaults[myChart] ?? { start: 0, end: 100 };

		if (chart?.dataZoom?.[0] && !chart.dataZoom[0].start && !chart.dataZoom[0].end) {
			chart.dataZoom[0].start = slider.start;
			chart.dataZoom[0].end = slider.end;
		}

		let chartStr = stringify(chart);

		// --- Replace built-in placeholders ---
		chartStr = chartStr
			.replace("'%%xAxisData%%'", JSON.stringify(xAxisData))
			.replace("'%%xAxisDataShort%%'", JSON.stringify(xAxisDataShort))
			.replace("'%%xAxisMax%%'", String(xAxisData.length - 1))
			.replace("'%%chartTitle%%'", JSON.stringify(`PV Statistics — ${myChart}`))
			.replace("'%%dayAreas%%'", JSON.stringify(dayAreas))
			.replace("'%%xAxisFormatter%%'", stringify(xAxisFormatter))
			.replace("'%%tooltipFormatter%%'", stringify(tooltipFormatter));

		// Replace built-in stat placeholders
		for (const stat of this.stats) {
			const key = stat.targetPath;
			chartStr = chartStr.replace(`'%%${key}%%'`, JSON.stringify(seriesData[key])).replace(`'%%${key}Neg%%'`, JSON.stringify(seriesData[`${key}Neg`]));
		}

		// Replace breakdown placeholders (if a custom template uses them)
		for (const bd of this._consumptionBreakdown) {
			chartStr = chartStr.replace(`'%%${bd.targetPath}%%'`, JSON.stringify(seriesData[bd.targetPath]));
		}

		this.stateCache.set(outputStateId, chartStr, { type: 'string' });
		this.adapter.logger.debug(`statistics: flexCharts built for ${myChart}/${chartStyle}`);
		if (command === 'createTemplateFromBuiltin') {
			this.adapter.logger.debug(`statistics: created new template for ${myChart} based on built-in`);
			template = {
				_meta: {
					generatedFrom: 'builtin',
					generatedAt: new Date().toISOString(),
				},
				...template,
			};
			this.stateCache.set(templateStateId, stringifyWithFunctions(template), { type: 'string' });
		}
		return chartStr;
	}

	/**
	 * Builds eCharts series objects for all active breakdown entries.
	 * They are rendered as stacked bars (or lines) in the lower consumption grid
	 * (xAxisIndex 1 / yAxisIndex 2), matching the style of the existing Consumption series.
	 *
	 * @param {string} myChart
	 * @param {object} seriesData
	 * @returns {Array} eCharts series array
	 */
	_buildBreakdownSeries(myChart, seriesData) {
		if (!this._consumptionBreakdown || this._consumptionBreakdown.length === 0) {
			return [];
		}

		// Fallback palette when no color is specified in the config
		const defaultColors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#03a9f4', '#009688', '#8bc34a', '#ff5722', '#795548', '#607d8b'];

		return this._consumptionBreakdown.map((bd, idx) => {
			const color = bd.color || defaultColors[idx % defaultColors.length];
			const unit = bd.unit || 'kWh';
			return {
				name: bd.name,
				type: 'bar',
				stack: 'consumptionBreakdown', // stacks all breakdown bars on top of each other
				xAxisIndex: 1,
				yAxisIndex: 2,
				data: seriesData[bd.targetPath] ?? [],
				itemStyle: { color },
				emphasis: { focus: 'series' },
				tooltip: {
					valueFormatter: value => `${value} ${unit}`,
				},
			};
		});
	}

	/**
	 * Builds the legend entries for breakdown series and merges them into an
	 * existing legend data array (mutates in place and returns it).
	 *
	 * @param {Array} legendData
	 * @returns {Array} Merged legend data array with breakdown names included
	 */
	_mergeBreakdownLegend(legendData) {
		for (const bd of this._consumptionBreakdown) {
			if (!legendData.includes(bd.name)) {
				legendData.push(bd.name);
			}
		}
		return legendData;
	}

	/**
	 * Build the default chart configuration as javascript-stringify string.
	 * Used when no template is provided.
	 * @param myChart
	 * @param chartStyle
	 */
	_buildDefaultTemplate(myChart, chartStyle) {
		const seriesType = chartStyle === 'line' ? 'line' : 'bar';
		const lineOptions =
			chartStyle === 'line' ? { smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 }, areaStyle: { opacity: 0.15 } } : {};

		const showSOC = myChart === 'hourly';

		// Build legend including breakdown names
		const baseLegend = [
			'Solar Yield',
			'Grid Export',
			'Grid Import',
			'Charge',
			'Discharge',
			...(showSOC ? ['SOC'] : []),
			'Self-sufficiency',
			'Self-consumption',
			'Consumption',
		];
		const legendData = this._mergeBreakdownLegend(baseLegend);

		const template = {
			backgroundColor: '#fff',
			animation: false,
			title: {
				left: 'center',
				text: '%%chartTitle%%',
			},
			legend: {
				top: 35,
				left: 'center',
				data: legendData,
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'cross' },
				backgroundColor: 'rgba(245,245,245,0.95)',
				borderWidth: 1,
				borderColor: '#ccc',
				padding: 10,
				textStyle: { color: '#000' },
				formatter: '%%tooltipFormatter%%',
				position: (pos, params, el, elRect, size) => {
					const obj = { top: 10 };
					obj[pos[0] < size.viewSize[0] / 2 ? 'left' : 'right'] = 30;
					return obj;
				},
			},
			axisPointer: {
				link: [{ xAxisIndex: 'all' }],
				label: { backgroundColor: '#777' },
			},
			toolbox: {
				feature: {
					dataZoom: { yAxisIndex: false },
					dataView: { show: true, readOnly: false },
					restore: { show: true },
					saveAsImage: { show: true },
				},
			},
			grid: [
				{ left: '8%', right: showSOC ? '8%' : '4%', top: 80, height: '45%' },
				{ left: '8%', right: showSOC ? '8%' : '4%', top: '72%', height: '15%' },
			],
			xAxis: [
				{
					type: 'category',
					data: '%%xAxisDataShort%%',
					scale: true,
					boundaryGap: chartStyle !== 'line',
					axisLine: { onZero: false },
					splitLine: { show: false },
					axisPointer: { z: 100 },
					axisLabel: {
						interval: 0,
						lineHeight: 16,
						fontSize: 11,
						formatter: '%%xAxisFormatter%%',
					},
					min: 0,
					max: '%%xAxisMax%%',
				},
				{
					type: 'category',
					gridIndex: 1,
					data: '%%xAxisData%%',
					scale: true,
					boundaryGap: chartStyle !== 'line',
					axisLine: { onZero: false },
					axisTick: { show: false },
					splitLine: { show: false },
					axisLabel: { show: false },
					min: 0,
					max: '%%xAxisMax%%',
				},
			],
			yAxis: [
				// Index 0 — Energy left axis
				{
					scale: false,
					splitArea: { show: true },
					name: 'Energy (kWh)',
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: '{value} kWh' },
					splitLine: { show: true },
					axisLine: { show: true },
				},
				// Index 1 — SOC / ratio right axis
				{
					type: 'value',
					min: 0,
					max: 100,
					name: showSOC ? 'SOC / Ratio (%)' : 'Ratio (%)',
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: '{value} %' },
					splitLine: { show: false },
					axisLine: { show: true },
				},
				// Index 2 — Consumption lower grid
				{
					scale: true,
					gridIndex: 1,
					splitNumber: 3,
					axisLine: { show: false },
					axisTick: { show: false },
					splitLine: { show: false },
					name: 'Consumption\n(kWh)',
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: '{value}' },
				},
			],
			dataZoom: [
				{
					type: 'inside',
					xAxisIndex: [0, 1],
				},
				{
					show: true,
					xAxisIndex: [0, 1],
					type: 'slider',
					bottom: 5,
				},
			],
			series: [
				// Upper grid — energy series
				{
					name: 'Solar Yield',
					type: seriesType,
					data: '%%solarYield%%',
					itemStyle: { color: '#f6c94e' },
					emphasis: { focus: 'series' },
					tooltip: {
						valueFormatter: value => ({ value: value, unit: 'kWh' }),
					},
					...lineOptions,
				},
				{
					name: 'Grid Export',
					type: seriesType,
					data: '%%gridExportNeg%%',
					itemStyle: { color: '#5cb85c' },
					emphasis: { focus: 'series' },
					tooltip: {
						valueFormatter: value => ({ value: -value, unit: 'kWh' }),
					},
					...lineOptions,
				},
				{
					name: 'Grid Import',
					type: seriesType,
					data: '%%gridImport%%',
					itemStyle: { color: '#ec0000' },
					emphasis: { focus: 'series' },
					tooltip: {
						valueFormatter: value => ({ value: value, unit: 'kWh' }),
					},
					...lineOptions,
				},
				{
					name: 'Charge',
					type: seriesType,
					data: '%%chargeCapacityNeg%%',
					itemStyle: { color: '#5bc0de' },
					emphasis: { focus: 'series' },
					tooltip: {
						valueFormatter: value => ({ value: -value, unit: 'kWh' }),
					},
					...lineOptions,
				},
				{
					name: 'Discharge',
					type: seriesType,
					data: '%%dischargeCapacity%%',
					itemStyle: { color: '#ed50e0' },
					emphasis: { focus: 'series' },
					tooltip: {
						valueFormatter: value => ({ value: value, unit: 'kWh' }),
					},
					...lineOptions,
				},
				// SOC — hourly only, on right axis
				...(showSOC
					? [
							{
								name: 'SOC',
								type: 'line',
								yAxisIndex: 1,
								data: '%%SOC%%',
								itemStyle: { color: '#985e24' },
								lineStyle: { width: 2, type: 'dashed' },
								symbol: 'none',
								smooth: true,
								tooltip: {
									valueFormatter: value => ({ value: value, unit: '%' }),
								},
							},
						]
					: []),
				// Self-sufficiency
				{
					name: 'Self-sufficiency',
					type: 'line',
					yAxisIndex: 1,
					data: '%%selfSufficiency%%',
					itemStyle: { color: '#9c27b0' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'circle',
					symbolSize: 4,
					smooth: true,
					tooltip: {
						valueFormatter: value => ({ value: value, unit: '%' }),
					},
				},
				// Self-consumption
				{
					name: 'Self-consumption',
					type: 'line',
					yAxisIndex: 1,
					data: '%%selfConsumption%%',
					itemStyle: { color: '#ff9800' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'circle',
					symbolSize: 4,
					smooth: true,
					tooltip: {
						valueFormatter: value => ({ value: value, unit: '%' }),
					},
				},
				// Lower grid — total consumption (always rendered as reference)
				{
					name: 'Consumption',
					type: seriesType,
					data: '%%consumption%%',
					itemStyle: { color: '#337ab7' },
					xAxisIndex: 1,
					yAxisIndex: 2,
					tooltip: {
						valueFormatter: value => ({ value: value, unit: 'kWh' }),
					},
					...lineOptions,
				},
				// Note: breakdown series are injected dynamically in _buildFlexchart()
				// via _buildBreakdownSeries() — they do NOT go here in the template.
			],
		};

		return template;
	}

	/**
	 * Handles a template state change — updates cache, acknowledges and rebuilds chart.
	 * @param chartType
	 * @param state
	 */
	async handleTemplateChange(chartType, state) {
		const templateStateId = `statistics.flexCharts.template.${chartType}`;
		const template = this.stateCache.get(templateStateId)?.value;
		if (template === null || template === undefined) {
			this.adapter.logger.warn(`Template state ${templateStateId} not found for handleTemplateChange`);
			return;
		}
		if (state?.val != null) {
			this.adapter.logger.debug(`statistics: Event - state: ${chartType} changed: ${state.val} ack: ${state.ack}`);
			this.stateCache.set(templateStateId, state.val, { type: 'string', stored: true });
			this._buildFlexchart(chartType);
			await this.adapter.setState(templateStateId, { val: this.stateCache.get(templateStateId)?.value, ack: true });
		}
	}

	/**
	 * Handles a change to the consumptionBreakdown state.
	 * Parses the new configuration, refreshes foreign-state values, and rebuilds all charts.
	 *
	 * @param {object} state - ioBroker state object (val contains the new JSON string)
	 * @returns {Promise<void>}
	 */
	async handleBreakdownChange(state) {
		if (state?.val == null) return;

		this.adapter.logger.info('statistics: consumptionBreakdown configuration changed – reloading.');
		const newBreakdown = this._parseBreakdownConfig(state.val);
		this._consumptionBreakdown = newBreakdown;
		this.stateCache.set('statistics.consumptionBreakdown', state.val, { type: 'string', stored: true });

		await this.adapter.setState('statistics.consumptionBreakdown', { val: state.val, ack: true });

		// Immediately fetch fresh values from the foreign states
		await this._refreshBreakdownValues();

		// Rebuild all chart outputs with the new breakdown
		for (const chartType of ['hourly', 'daily', 'weekly', 'monthly', 'annual']) {
			this._buildFlexchart(chartType);
		}

		this.adapter.logger.info(
			`statistics: consumptionBreakdown reloaded with ${this._consumptionBreakdown.length} entr${this._consumptionBreakdown.length === 1 ? 'y' : 'ies'}.`,
		);
	}

	/**
	 * Entry point for adapter to handle messages related to statistics/flexcharts.
	 *
	 * @param {{chart?: string, style?: string}} message
	 * @param {Function} callback
	 */
	handleFlexMessage(message, callback) {
		const chartType = message?.chart || 'hourly';
		const chartStyle = message?.style;
		const result = this._buildFlexchart(chartType, chartStyle);
		if (callback && typeof callback === 'function') {
			callback(result);
		}
	}
}

module.exports = statistics;
