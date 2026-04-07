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

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.taskTimer = null;
		this._path = 'statistics';
		this._initialized = false;
		this.testing = false; // set to true for testing purposes

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
				// unten im FusionSolar Fenster
				// selfSufficiency = (consumption - gridImport)/consumption * 100
				// selfSufficiency = (1 - gridImport / consumption) * 100
				// If consumption = 0 → 100% (no consumption, fully self-sufficient)
				compute: entry => {
					const consumption = entry.consumption?.value ?? 0;
					const gridImport = entry.gridImport?.value ?? 0;
					if (consumption <= 0) return 100;
					return Math.round(Math.max(0, Math.min(100, (1 - gridImport / consumption) * 100)) * 10) / 10;
				},
			},
			{
				targetPath: 'selfConsumption',
				unit: '%',
				type: statisticsType.computed,
				// oben im FusionSolar Fenster
				// selfConsumption = (solarYield - gridExport) / solarYield * 100
				// selfConsumption = (1 - gridExport / solarYield) * 100
				// If solarYield = 0 → 0% (no generation, no self-consumption possible)
				compute: entry => {
					const solarYield = entry.solarYield?.value ?? 0;
					const gridExport = entry.gridExport?.value ?? 0;
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
	 *
	 * @param {string} stateId - The state ID for storing the JSON
	 * @param {Date} periodStart - The start of the current period
	 * @param {Date} periodEnde - The end of the current period
	 * @returns {boolean} true if a new entry was appended, false otherwise
	 */
	_calculateGeneric(stateId, periodStart, periodEnde) {
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

		// First pass: deltaReset, delta, level stats
		for (const stat of this.stats) {
			if (stat.type === statisticsType.computed) continue;

			const source = this.stateCache.get(stat.sourceId)?.value;
			if (source === null || source === undefined) {
				this.adapter.logger.warn(`Source state ${stat.sourceId} not found statistic hook`);
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

		// Second pass: computed stats (all other values are now in entry)
		for (const stat of this.stats) {
			if (stat.type !== statisticsType.computed) continue;
			try {
				const proxyEntry = {};
				for (const key of Object.keys(entry)) {
					proxyEntry[key] = entry[key];
					//nicht undefined oder null
					if (proxyEntry[key].total != null) {
						proxyEntry[key].value = proxyEntry[key].total ?? 0;
					}
				}
				const value = stat.compute(proxyEntry);
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

	/**
	 * Calculates and aggregates consumption statistics based on the given parameters.
	 *
	 * @param {string} sourceStateId
	 * @param {string} targetStateId
	 * @param {Function} getWindow
	 * @param {string} periodType
	 * @returns boolean
	 */
	_calculateAggregation(sourceStateId, targetStateId, getWindow, periodType) {
		try {
			const now = new Date();
			const window = getWindow(now);
			const fromDate = window.from;
			const toDate = window.to;
			if (now < toDate) {
				this.adapter.logger.debug(`statistics.js: Skipping ${periodType} aggregation because current time is before end of aggregation window`);
				return false;
			}
			const toStr = this._localIsoWithOffset(toDate);

			let jsonTarget = this.stateCache.get(targetStateId)?.value ?? '[]';
			let targetArray = [];
			try {
				targetArray = JSON.parse(jsonTarget);
				if (!Array.isArray(targetArray)) targetArray = [];
			} catch {
				targetArray = [];
			}

			const last = targetArray.length > 0 ? targetArray[targetArray.length - 1] : {};
			if (last.to === toStr) return false;

			const target = {
				from: this._localIsoWithOffset(fromDate),
				to: toStr,
			};

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

			if (sourceEntries.length > 0) {
				this.adapter.logger.debug(
					`statistics.js: Found ${sourceEntries.length} source entries for ${periodType} aggregation between ${fromDate.toISOString()} and ${toDate.toISOString()}`,
				);

				// First pass: sum delta/deltaReset stats
				for (const stat of this.stats) {
					if (stat.type === statisticsType.level) continue;
					if (stat.type === statisticsType.computed) continue;

					let sum = 0;
					try {
						sourceEntries.forEach(entry => {
							sum += Number(entry[stat.targetPath]?.['value'] ?? 0);
						});
					} catch (e) {
						this.adapter.logger.warn(`statistics.js: Error during ${periodType} statistic aggregation: ${e.message}`);
					}
					sum = Math.round((Number(sum) + Number.EPSILON) * 1000) / 1000;
					target[stat.targetPath] = { value: Number(sum.toFixed(3)), unit: stat.unit || 'kWh' };
				}

				// Second pass: compute derived stats from aggregated values
				for (const stat of this.stats) {
					if (stat.type !== statisticsType.computed) continue;
					try {
						const value = stat.compute(target);
						target[stat.targetPath] = {
							value: Number(Number(value).toFixed(3)),
							unit: stat.unit || '%',
						};
					} catch (e) {
						this.adapter.logger.warn(`statistics: error computing aggregated ${stat.targetPath}: ${e.message}`);
						target[stat.targetPath] = { value: 0, unit: stat.unit || '%' };
					}
				}

				targetArray.push(target);
			}

			targetArray.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
			this.stateCache.set(targetStateId, JSON.stringify(targetArray), { type: 'string' });
			this.adapter.logger.debug(`Appended ${periodType} statistic ${toStr}`);
			return targetArray.length > 0;
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} aggregation: ${err.message}`);
		}
	}

	/**
	 * Updates the statistics.jsonToday state with the current live day values.
	 * Reads directly from the stateCache (collected.*) and computes derived values.
	 */
	updateJsonToday() {
		if (!this._initialized) {
			this.adapter.logger.debug('statistics: updateJsonToday called before initialization');
			return;
		}

		try {
			const now = new Date();
			const today = {};

			// Read all non-computed stats directly from stateCache
			for (const stat of this.stats) {
				if (stat.type === statisticsType.computed) continue;
				if (stat.type === statisticsType.level) {
					const val = this.stateCache.get(stat.sourceId)?.value;
					today[stat.targetPath] = {
						value: val != null ? Number(Number(val).toFixed(3)) : null,
						unit: stat.unit,
					};
				} else {
					// deltaReset: value is the current day total from the source state
					const val = this.stateCache.get(stat.sourceId)?.value;
					today[stat.targetPath] = {
						value: val != null ? Number(Number(val).toFixed(3)) : null,
						unit: stat.unit,
					};
				}
			}

			// Compute derived stats
			for (const stat of this.stats) {
				if (stat.type !== statisticsType.computed) continue;
				try {
					// Build a proxy entry using the raw today values
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
		this.adapter.log.info(`### Hourly execution triggered with lastHour: ${lastHour.toLocaleTimeString()} ###`);
		if (this._calculateGeneric('statistics.jsonHourly', startOfDay, lastHour)) {
			this._buildFlexchart('hourly');
		}
	}

	/**
	 * Calculates and updates daily consumption statistics from hourly data.
	 */
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
		) && this._buildFlexchart('daily');
	}

	/**
	 * Calculates and updates weekly consumption statistics from daily data.
	 */
	_calculateWeekly() {
		this.adapter.log.debug('### Weekly execution triggered ###');
		if (
			this._calculateAggregation(
				'statistics.jsonDaily',
				'statistics.jsonWeekly',
				now => {
					const startday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
					const lastday = new Date(startday);
					lastday.setDate(now.getDate() - (now.getDay() || 7) + 1);
					startday.setDate(lastday.getDate() - 7);
					return { from: startday, to: lastday };
				},
				'weekly',
			)
		) {
			this._buildFlexchart('weekly');
		}
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
		) && this._buildFlexchart('monthly');
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
		) && this._buildFlexchart('annual');
	}

	/**
	 * Initialize and schedule the unified task manager.
	 * Runs every full hour.
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
			this.adapter.logger.info(`### Statistics - Scheduler start ${now.toLocaleTimeString()} next ${next.toLocaleTimeString()}`);

			if (this.taskTimer) {
				this.adapter.clearTimeout(this.taskTimer);
			}
			this.taskTimer = this.adapter.setTimeout(() => {
				this._executeScheduledTasks();
				scheduleNextRun();
			}, msToNextHour);
		};
		scheduleNextRun();
	}

	_executeScheduledTasks() {
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
	mitNightProcess() {
		const now = new Date();
		this._executeScheduledTasks();
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

		await tools.waitForValue(() => this.stateCache.get('collected.accumulatedEnergyYield')?.value, 60000);

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

		this.mitNightProcess();
		this._initializeTask();
		this.adapter.subscribeStates(`${this._path}.*`);
		this._initialized = true;
	}

	/**
	 * Builds and updates the Flexchart configuration for the specified chart type.
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
				const yesterday = new Date(to);
				yesterday.setDate(yesterday.getDate() - 1);
				return `${from.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}-${yesterday.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}`;
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

		// --- Tooltip formatter ---
		const tooltipFormatter = params => {
			if (!Array.isArray(params)) params = [params];
			return params
				.filter(p => p.seriesName !== 'DayBreak')
				.map(p => {
					const negatedSeries = ['Grid Export', 'Charge'];
					const val = negatedSeries.includes(p.seriesName) ? Math.abs(p.value) : p.value;
					const unit = ['SOC', 'Self-sufficiency', 'Self-consumption'].includes(p.seriesName) ? ' %' : ' kWh';
					return `${p.marker}${p.seriesName}: <b>${val}${unit}</b>`;
				})
				.join('<br/>');
		};

		// --- Load chart-type specific template ---
		const templateStateId = `statistics.flexCharts.template.${myChart}`;
		const outputStateId = `statistics.flexCharts.jsonOutput.${myChart}`;

		const templateStr = this.stateCache.get(templateStateId)?.value ?? '{}';
		let chartStr = '{}';

		try {
			const templ = JSON.parse(templateStr);
			if (Object.keys(templ).length === 0) {
				chartStr = this._buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData);
			} else {
				chartStr = stringify(templ);
			}
		} catch (e) {
			this.adapter.logger.warn(`statistics: invalid template for ${myChart}: ${e.message}`);
			chartStr = this._buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData);
		}

		// --- Replace placeholders ---
		chartStr = chartStr
			.replace("'%%xAxisData%%'", JSON.stringify(xAxisData))
			.replace("'%%xAxisDataShort%%'", JSON.stringify(xAxisDataShort))
			.replace("'%%xAxisMax%%'", String(xAxisData.length - 1))
			.replace("'%%chartTitle%%'", JSON.stringify(`PV Statistics — ${myChart}`))
			.replace("'%%dayAreas%%'", JSON.stringify(dayAreas))
			.replace("'%%tooltipFormatter%%'", stringify(tooltipFormatter));

		// All this.stats entries dynamically — both positive and negated
		for (const stat of this.stats) {
			const key = stat.targetPath;
			chartStr = chartStr.replace(`'%%${key}%%'`, JSON.stringify(seriesData[key])).replace(`'%%${key}Neg%%'`, JSON.stringify(seriesData[`${key}Neg`]));
		}

		this.stateCache.set(outputStateId, chartStr, { type: 'string' });
		this.adapter.logger.debug(`statistics: flexCharts built for ${myChart}/${chartStyle}`);

		return chartStr;
	}

	/**
	 * Build the default chart configuration as javascript-stringify string.
	 * Used when no template is provided.
	 * @param myChart
	 * @param chartStyle
	 * @param xAxisData
	 * @param xAxisDataShort
	 * @param dayAreas
	 * @param seriesData
	 */
	_buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData) {
		const xAxisFormatterHourly = value => {
			if (value.includes('|')) return value;
			return value.split(' ')[1] ?? value;
		};

		const seriesType = chartStyle === 'line' ? 'line' : 'bar';
		const lineOptions =
			chartStyle === 'line' ? { smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 }, areaStyle: { opacity: 0.15 } } : {};

		const negate = arr => arr.map(v => Number((-v).toFixed(3)));
		const showSOC = myChart === 'hourly';

		// No-data hint — chart-type specific
		const noDataHints = {
			hourly: 'No data yet — first entry available after the next full hour.',
			daily: 'No data yet — first entry available tomorrow after midnight.',
			weekly: 'No data yet — first entry available after the current week ends.',
			monthly: 'No data yet — first entry available after the current month ends.',
			annual: 'No data yet — first entry available after the current year ends.',
		};

		const tooltipFormatter = params => {
			if (!Array.isArray(params)) params = [params];
			return params
				.filter(p => p.seriesName !== 'DayBreak')
				.map(p => {
					const negatedSeries = ['Grid Export', 'Charge'];
					const val = negatedSeries.includes(p.seriesName) ? Math.abs(p.value) : p.value;
					const unit = ['SOC', 'Self-sufficiency', 'Self-consumption'].includes(p.seriesName) ? ' %' : ' kWh';
					return `${p.marker}${p.seriesName}: <b>${val}${unit}</b>`;
				})
				.join('<br/>');
		};

		const chart = {
			backgroundColor: '#fff',
			animation: false,
			title: {
				left: 'center',
				text: `SUN2000 - PV Statistics - ${myChart}`,
			},
			legend: {
				top: 35,
				left: 'center',
				data: [
					'Solar Yield',
					'Grid Export',
					'Grid Import',
					'Charge',
					'Discharge',
					...(showSOC ? ['SOC'] : []),
					'Self-sufficiency',
					'Self-consumption',
					'Consumption',
				],
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
			// No-data graphic — shown only when data is empty
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
			grid: [
				{ left: '8%', right: showSOC ? '8%' : '4%', top: 80, height: '45%' },
				{ left: '8%', right: showSOC ? '8%' : '4%', top: '72%', height: '15%' },
			],
			xAxis: [
				{
					type: 'category',
					data: xAxisDataShort,
					scale: true,
					boundaryGap: chartStyle !== 'line',
					axisLine: { onZero: false },
					splitLine: { show: false },
					axisPointer: { z: 100 },
					min: 0,
					max: xAxisDataShort.length - 1,
					axisLabel: {
						interval: 0,
						lineHeight: 16,
						fontSize: 11,
						formatter: '%%xAxisFormatter%%',
					},
				},
				{
					type: 'category',
					gridIndex: 1,
					data: xAxisData,
					scale: true,
					boundaryGap: false,
					axisLine: { onZero: false },
					axisTick: { show: false },
					splitLine: { show: false },
					axisLabel: { show: false },
					min: 0,
					max: xAxisData.length - 1,
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
				{ type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
				{ show: true, xAxisIndex: [0, 1], type: 'slider', bottom: 5, start: 0, end: 100 },
			],
			series: [
				// Positive values (above zero line)
				{
					name: 'Solar Yield',
					type: seriesType,
					data: seriesData.solarYield,
					itemStyle: { color: '#f6c94e' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				{
					name: 'Grid Import',
					type: seriesType,
					data: seriesData.gridImport,
					itemStyle: { color: '#ec0000' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				{
					name: 'Discharge',
					type: seriesType,
					data: seriesData.dischargeCapacity,
					itemStyle: { color: '#ed50e0' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				// Negative values (below zero line)
				{
					name: 'Grid Export',
					type: seriesType,
					data: negate(seriesData.gridExport),
					itemStyle: { color: '#5cb85c' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				{
					name: 'Charge',
					type: seriesType,
					data: negate(seriesData.chargeCapacity),
					itemStyle: { color: '#5bc0de' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				// SOC — hourly only, on right axis
				...(showSOC
					? [
							{
								name: 'SOC',
								type: 'line',
								yAxisIndex: 1,
								data: seriesData.SOC,
								itemStyle: { color: '#985e24' },
								lineStyle: { width: 2, type: 'dashed' },
								symbol: 'none',
								smooth: true,
							},
						]
					: []),
				// Self-sufficiency — right axis
				{
					name: 'Self-sufficiency',
					type: 'line',
					yAxisIndex: 1,
					data: seriesData.selfSufficiency,
					itemStyle: { color: '#9c27b0' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'circle',
					symbolSize: 4,
					smooth: true,
				},
				// Self-consumption — right axis
				{
					name: 'Self-consumption',
					type: 'line',
					yAxisIndex: 1,
					data: seriesData.selfConsumption,
					itemStyle: { color: '#ff9800' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'circle',
					symbolSize: 4,
					smooth: true,
				},
				// Consumption in lower grid — always yAxisIndex 2
				{
					name: 'Consumption',
					type: seriesType,
					data: seriesData.consumption,
					itemStyle: { color: '#337ab7' },
					xAxisIndex: 1,
					yAxisIndex: 2,
					...lineOptions,
				},
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
								markArea: { silent: true, data: dayAreas },
							},
						]
					: []),
			],
		};

		return stringify(chart).replace("'%%xAxisFormatter%%'", stringify(xAxisFormatterHourly)).replace("'%%tooltipFormatter%%'", stringify(tooltipFormatter));
	}

	/**
	 * Merges two objects deeply.
	 * @param target
	 * @param source
	 */
	_deepMerge(target, source) {
		for (const key of Object.keys(source)) {
			if (
				source[key] !== null &&
				typeof source[key] === 'object' &&
				!Array.isArray(source[key]) &&
				target[key] !== null &&
				typeof target[key] === 'object' &&
				!Array.isArray(target[key])
			) {
				this._deepMerge(target[key], source[key]);
			} else {
				target[key] = source[key];
			}
		}
		return target;
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
			await this.adapter.setState(templateStateId, { val: state.val, ack: true });
			this._buildFlexchart(chartType);
		}
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
