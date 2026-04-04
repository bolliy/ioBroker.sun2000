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
		this.testing = false; // set to true for testing purposes

		this.stats = [
			{
				sourceId: 'collected.consumptionToday',
				targetPath: 'consumption',
				unit: 'kWh',
				type: statisticsType.deltaReset, // value is a total that resets at the start of the period, so we need to calculate the delta to get the actual consumption for the period
			},
			{
				sourceId: 'collected.dailySolarYield',
				targetPath: 'solarYield',
				unit: 'kWh',
				type: statisticsType.deltaReset,
			},
			{ sourceId: 'collected.dailyInputYield', targetPath: 'inputYield', unit: 'kWh', type: statisticsType.deltaReset },
			{
				sourceId: 'collected.dailyExternalYield',
				targetPath: 'externalYield',
				unit: 'kWh',
				type: statisticsType.deltaReset,
			},
			{ sourceId: 'collected.dailyEnergyYield', targetPath: 'energyYield', unit: 'kWh', type: statisticsType.deltaReset },
			{
				sourceId: 'collected.SOC',
				targetPath: 'SOC',
				unit: '%',
				type: statisticsType.level, // value is a level that can go up and down, so we take the value as is without calculating delta
			},
			{ sourceId: 'collected.currentDayChargeCapacity', targetPath: 'chargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.currentDayDischargeCapacity', targetPath: 'dischargeCapacity', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.gridExportToday', targetPath: 'gridExport', unit: 'kWh', type: statisticsType.deltaReset },
			{ sourceId: 'collected.gridImportToday', targetPath: 'gridImport', unit: 'kWh', type: statisticsType.deltaReset },
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
					// a state where users may store a Flexcharts/eCharts options template
					// --- Templates: eines pro Chart-Typ ---
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
					// --- Output: eines pro Chart-Typ ---
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
	 * @param {string} consumptionKey - The state key for consumption value
	 * @param {Date} periodStart - The start of the current period
	 * @param {string} periodType - The type of period (hourly, daily, weekly, monthly, annual)
	 * @returns {Promise<void>}
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
			// avoid duplicates
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

		for (const stat of this.stats) {
			const source = this.stateCache.get(stat.sourceId)?.value;
			if (source === null || source === undefined) {
				this.adapter.logger.warn(`Source state ${stat.sourceId} not found statistic hook`);
				continue;
			}
			let value = Number(source);
			if (stat.type === statisticsType.delta || stat.type === statisticsType.deltaReset) {
				const lastTotal = Number(last[stat.targetPath]?.['total'] ?? 0);
				if (stat.type === statisticsType.deltaReset) {
					//if (value >= lastTotal * 0.5) {
					if (fromDate.getTime() !== periodStart.getTime()) {
						// Delta-Berechnung
						value -= lastTotal;
					}
				} else {
					// Ein lastTotal-Wert vorhanden –> normale Delta-Berechnung
					if (last[stat.targetPath]?.['total'] === undefined) {
						// Kein lastTotal-Wert vorhanden –> wahrscheinlich erster Eintrag, Delta-Berechnung nicht möglich
						this.adapter.logger.debug(`No total value found for ${stat.targetPath} in last entry, setting delta to 0`);
						value = 0;
					} else {
						// Delta-Berechnung
						value -= lastTotal;
					}
				}
			}
			value = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
			entry[stat.targetPath] = {
				value: Number(value.toFixed(3)),
			};

			if (stat.type === statisticsType.delta || stat.type === statisticsType.deltaReset) {
				entry[stat.targetPath].total = Number(source.toFixed(3));
			}
			entry[stat.targetPath].unit = stat.unit || 'kWh'; // can be extended for other stats with different units
		}
		arr.push(entry);

		arr.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));

		this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
		this.adapter.logger.debug(`Appended ${stateId} statistic ${toStr}`);
		return arr.length > 0;
	}

	_clearGeneric(stateId, periodStart) {
		let jsonStr = this.stateCache.get(stateId)?.value ?? '[]';
		let arr = [];
		try {
			arr = JSON.parse(jsonStr);
			if (!Array.isArray(arr)) arr = [];
		} catch {
			arr = [];
		}

		// Keep only entries within the window
		arr = arr.filter(item => {
			const ts = Date.parse(item.from);
			return !Number.isNaN(ts) && ts >= periodStart.getTime();
		});

		this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
	}

	/**
	 * Calculates and aggregates consumption statistics based on the given parameters.
	 *
	 * This function calculates and aggregates the consumption statistics based on the source entries within a specific window.
	 * It retrieves the source entries, filters them based on the window, calculates the sum of consumption, and appends the result to the target array.
	 *
	 * @param {string} sourceStateId - The ID of the source state to retrieve entries from.
	 * @param {string} targetStateId - The ID of the target state to append the aggregated result.
	 * @param {Function} getWindow - A function that returns the start and end date of the window based on the current date.
	 * @param {string} periodType - The type of period for which the aggregation is performed.
	 * @returns {void}
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

			// Load target array
			let jsonTarget = this.stateCache.get(targetStateId)?.value ?? '[]';
			let targetArray = [];
			try {
				targetArray = JSON.parse(jsonTarget);
				if (!Array.isArray(targetArray)) targetArray = [];
			} catch {
				targetArray = [];
			}

			// Avoid duplicates
			const last = targetArray.length > 0 ? targetArray[targetArray.length - 1] : {};
			if (last.to === toStr) return false;

			const target = {
				from: this._localIsoWithOffset(fromDate),
				to: toStr,
			};

			// Load source entries
			let jsonStr = this.stateCache.get(sourceStateId)?.value ?? '[]';
			let sourceEntries = [];
			try {
				sourceEntries = JSON.parse(jsonStr);
				if (!Array.isArray(sourceEntries)) sourceEntries = [];
			} catch {
				sourceEntries = [];
			}

			// Keep only entries within the window
			sourceEntries = sourceEntries.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= fromDate.getTime() && ts < toDate.getTime();
			});
			// If there are no source entries, we can skip the aggregation and avoid creating empty entries in the target array
			if (sourceEntries.length > 0) {
				this.adapter.logger.debug(
					`statistics.js: Found ${sourceEntries.length} source entries for ${periodType} aggregation between ${fromDate.toISOString()} and ${toDate.toISOString()}`,
				);

				for (const stat of this.stats) {
					// Sum consumption for the window
					if (stat.type === statisticsType.level) continue; // Skip level statistics

					let sum = 0;
					/*
					if (stat.type === statisticsType.average) {
						stat.sum = sourceEntries.length > 0 ? sourceEntries[sourceEntries.length - 1]?.[stat.targetPath]?.['total'] : 0;
					} else {
					*/
					try {
						sourceEntries.forEach(entry => {
							sum += Number(entry[stat.targetPath]?.['value'] ?? 0);
						});
					} catch (e) {
						this.adapter.logger.warn(`statistics.js: Error during ${periodType} statistic aggregation: ${e.message}`);
					}

					sum = Math.round((Number(sum) + Number.EPSILON) * 1000) / 1000;

					target[stat.targetPath] = {
						value: Number(sum.toFixed(3)),
						unit: stat.unit || 'kWh',
					};
				}

				targetArray.push(target);
			}

			targetArray.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
			this.stateCache.set(targetStateId, JSON.stringify(targetArray), { type: 'string' });
			this.adapter.logger.debug(`Appended ${periodType} statistic ${toStr} `);
			return targetArray.length > 0;
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} aggregation: ${err.message}`);
		}
	}

	/**
	 * Calculates and updates hourly consumption statistics.
	 *
	 * This function calculates the hourly consumption statistics based on the current day's data.
	 * It retrieves the consumption data and updates the hourly consumption JSON accordingly.
	 *
	 * @returns {void}
	 */
	_calculateHourly() {
		const now = new Date();
		if (this.testing) {
			const state = this.adapter.getState('statistics.jsonHourly');
			this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });
			now.setDate(now.getDate() + 1); // set to start of day for testing to have consistent results
			now.setHours(1, 0, 0, 1); // set to 1ms after midnight to trigger hourly calculation for the new day
		}
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
		this.adapter.log.debug('### Hourly execution triggered ###');
		if (this._calculateGeneric('statistics.jsonHourly', startOfDay, lastHour)) {
			this._buildFlexchart('hourly');
		}
	}

	/**
	 * Calculates and updates daily consumption statistics from hourly data.
	 *
	 * @returns {void}
	 */
	_calculateDaily() {
		this.adapter.log.debug('### Daily execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonHourly',
			'statistics.jsonDaily',
			now => {
				// aggregation window: previous day (day that just ended)
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const yesterday = new Date(today);
				yesterday.setDate(today.getDate() - 1);
				return { from: yesterday, to: today };
			},
			'daily',
		) && this._buildFlexchart('daily'); // only update last execution time if aggregation was performed to avoid backfilling multiple days at startup
	}

	/**
	 * Calculates and updates weekly consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	_calculateWeekly() {
		this.adapter.log.debug('### Weekly execution triggered ###');
		if (
			this._calculateAggregation(
				'statistics.jsonDaily',
				'statistics.jsonWeekly',
				now => {
					// aggregation window: Monday to Sunday of the previous week (week that just ended)
					const startday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
					const lastday = new Date(startday);
					// set to Monday of previous week
					lastday.setDate(now.getDate() - (now.getDay() || 7) + 1); // set to Monday of actual week
					startday.setDate(lastday.getDate() - 7); // set to Monday of previous week
					return { from: startday, to: lastday };
				},
				'weekly',
			)
		) {
			this._buildFlexchart('weekly');
		} // only update last execution time if aggregation was performed to avoid backfilling multiple weeks at startup
	}

	/**
	 * Calculates and updates monthly consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	_calculateMonthly() {
		this.adapter.log.debug('### Monthly execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonMonthly',
			now => {
				// aggregation windowStart: previous month (month that just ended)
				const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
				const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
				return { from: prevMonth, to: thisMonth };
			},
			'monthly',
		) && this._buildFlexchart('monthly'); // only update last execution time if aggregation was performed to avoid backfilling multiple months at startup
	}

	/**
	 * Calculates and updates annual consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	_calculateAnnual() {
		this.adapter.log.debug('### Annual execution triggered ###');
		this._calculateAggregation(
			'statistics.jsonDaily',
			'statistics.jsonAnnual',
			now => {
				// aggregation window: previous year (year that just ended)
				const thisYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
				const prevYear = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
				return { from: prevYear, to: thisYear };
			},
			'annual',
		) && this._buildFlexchart('annual'); // only update last execution time if aggregation was performed to avoid backfilling multiple years at startup
	}

	/**
	 * Initialize and schedule the unified task manager.
	 * This task runs every minute and checks which statistics need to be calculated.
	 */
	_initializeTask() {
		const scheduleNextRun = () => {
			const now = new Date();
			const next = new Date(now);
			if (this.testing) {
				next.setMinutes(now.getMinutes() + 1, 0, 0); //every minute
			} else {
				next.setHours(next.getHours() + 1, 0, 0, 0); //every hour
			}

			// Skip executing tasks exactly at midnight to avoid running aggregated jobs
			if (next.getHours() === 0 && next.getMinutes() === 0) {
				next.setHours(next.getHours() + 1, 0, 0, 0); //every hour
			}
			const msToNextHour = next.getTime() - now.getTime();

			if (this.taskTimer) {
				this.adapter.clearTimeout(this.taskTimer);
			}

			this.taskTimer = this.adapter.setTimeout(() => {
				this._executeScheduledTasks();
				scheduleNextRun(); // reschedule for next hour
			}, msToNextHour);
		};
		// Schedule the next run
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
	 * Executes every midnight and performs the following tasks:
	 * - Execute all scheduled tasks to ensure that statistics are up to date.
	 * - Clear old data based on retention policies.
	 */
	mitNightProcess() {
		const now = new Date();
		this._executeScheduledTasks();
		// Clear old data based on retention policies
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		this._clearGeneric('statistics.jsonDaily', startOfYear);
		this._clearGeneric('statistics.jsonWeekly', startOfYear);
		this._clearGeneric('statistics.jsonMonthly', startOfYear);
		this._clearGeneric('statistics.jsonHourly', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0));
	}

	async initialize() {
		// load consumption JSON states (keep as string)
		let state = await this.adapter.getState('statistics.jsonHourly');
		this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonDaily');
		this.stateCache.set('statistics.jsonDaily', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonWeekly');
		this.stateCache.set('statistics.jsonWeekly', state?.val ?? '[]', { type: 'string', stored: true }); //is already stored

		state = await this.adapter.getState('statistics.jsonMonthly');
		this.stateCache.set('statistics.jsonMonthly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonAnnual');
		this.stateCache.set('statistics.jsonAnnual', state?.val ?? '[]', { type: 'string', stored: true });

		// wait until consumptionToday and so on is available to avoid running the task before the initial state is loaded
		await tools.waitForValue(() => this.stateCache.get('collected.accumulatedEnergyYield')?.value, 60000);

		// load templates — eines pro Chart-Typ
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

		this.mitNightProcess(); // execute once on startup to catch up on any missed runs while the adapter was not running
		this._initializeTask();
		this.adapter.subscribeStates(`${this._path}.*`);
	}

	_buildFlexchart(myChart, chartStyle = 'bar') {
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
				return `${from.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}..${yesterday.toLocaleTimeString('de-DE', { month: '2-digit', day: '2-digit' })}`;
			}
			if (myChart === 'monthly') {
				return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit' });
			}
			if (myChart === 'annual') {
				return from.toLocaleDateString('de-DE', { year: 'numeric' });
			}

			return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
			/*
			return myChart === 'hourly'
				? `${to.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${to.toLocaleTimeString('de-DE', {
						hour12: false,
						hour: '2-digit',
						minute: '2-digit',
					})}`
				: from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
			*/
		});

		const xAxisDataShort = myChart === 'hourly' ? xAxisData.map(label => label.split(' ')[1]) : xAxisData;

		// --- Tagesbereiche ---
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

		const seriesData = {
			solarYield: extract('solarYield'),
			consumption: extract('consumption'),
			gridExport: extract('gridExport'),
			gridImport: extract('gridImport'),
			chargeCapacity: extract('chargeCapacity'),
			dischargeCapacity: extract('dischargeCapacity'),
			SOC: extract('SOC'),
			gridExportNeg: negate(extract('gridExport')),
			chargeCapacityNeg: negate(extract('chargeCapacity')),
		};

		// --- Tooltip formatter (zeigt immer positive Werte, filtert DayBreak heraus) ---
		const tooltipFormatter = params => {
			if (!Array.isArray(params)) params = [params];
			return params
				.filter(p => p.seriesName !== 'DayBreak')
				.map(p => {
					const negatedSeries = ['Grid Export', 'Charge'];
					const val = negatedSeries.includes(p.seriesName) ? Math.abs(p.value) : p.value;
					const unit = p.seriesName === 'SOC' ? ' %' : ' kWh';
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
				// Kein Template → built-in Default
				chartStr = this._buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData);
			} else {
				// Template vorhanden → mit javascript-stringify serialisieren
				chartStr = stringify(templ);
			}
		} catch (e) {
			this.adapter.logger.warn(`statistics: invalid template for ${myChart}: ${e.message}`);
			chartStr = this._buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData);
		}

		// --- Replace data placeholders ---
		chartStr = chartStr
			// X-Achse
			.replace("'%%xAxisData%%'", JSON.stringify(xAxisData))
			.replace("'%%xAxisDataShort%%'", JSON.stringify(xAxisDataShort))
			.replace("'%%xAxisMax%%'", String(xAxisData.length - 1))
			// Originaldaten (immer positiv)
			.replace("'%%solarYield%%'", JSON.stringify(seriesData.solarYield))
			.replace("'%%consumption%%'", JSON.stringify(seriesData.consumption))
			.replace("'%%gridExport%%'", JSON.stringify(seriesData.gridExport))
			.replace("'%%gridImport%%'", JSON.stringify(seriesData.gridImport))
			.replace("'%%chargeCapacity%%'", JSON.stringify(seriesData.chargeCapacity))
			.replace("'%%dischargeCapacity%%'", JSON.stringify(seriesData.dischargeCapacity))
			.replace("'%%SOC%%'", JSON.stringify(seriesData.SOC))
			// Negierte Varianten für gegenläufige Darstellung
			.replace("'%%gridExportNeg%%'", JSON.stringify(seriesData.gridExportNeg))
			.replace("'%%chargeCapacityNeg%%'", JSON.stringify(seriesData.chargeCapacityNeg))
			// Sonstiges
			.replace("'%%dayAreas%%'", JSON.stringify(dayAreas))
			.replace("'%%chartTitle%%'", JSON.stringify(`PV Statistics — ${myChart}`))
			// Funktionen
			.replace("'%%tooltipFormatter%%'", stringify(tooltipFormatter));

		// --- In chart-type specific output state speichern ---
		this.stateCache.set(outputStateId, chartStr, { type: 'string' });
		this.adapter.logger.debug(`statistics: flexCharts built for ${myChart}/${chartStyle}`);

		return chartStr;
	}

	/**
	 * Build a flexcharts/eCharts option object from stored statistics.
	 * The chart configuration is loaded from the template state and data
	 * variables are replaced with actual series data.
	 *
	 * Supported data placeholders in the template:
	 *   %%xAxisData%%         - X-axis labels (full, with date for slider)
	 *   %%xAxisDataShort%%    - X-axis labels (short, time only for hourly)
	 *   %%solarYield%%        - Solar yield data array
	 *   %%consumption%%       - House consumption data array
	 *   %%gridExport%%        - Grid export data array
	 *   %%gridImport%%        - Grid import data array
	 *   %%chargeCapacity%%    - Battery charge data array
	 *   %%dischargeCapacity%% - Battery discharge data array
	 *   %%dayAreas%%          - Day break areas for hourly charts
	 *
	 * @param {string} myChart - one of 'hourly','daily','weekly','monthly','annual'
	 * @param {string} chartStyle - 'line' or 'bar'
	 * @returns {string} chart configuration as javascript-stringify string
	 */
	_buildFlexchart_old(myChart, chartStyle) {
		chartStyle = chartStyle || (myChart === 'hourly' ? 'line' : 'bar'); // default styles: line for hourly (to better see the curve), bar for others
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
				return `${from.toLocaleDateString('de-DE', { month: '2-digit', day: '2-digit' })}..${yesterday.toLocaleTimeString('de-DE', { month: '2-digit', day: '2-digit' })}`;
			}
			if (myChart === 'monthly') {
				return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit' });
			}
			if (myChart === 'annual') {
				return from.toLocaleDateString('de-DE', { year: 'numeric' });
			}

			return from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
			/*
			return myChart === 'hourly'
				? `${to.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${to.toLocaleTimeString('de-DE', {
						hour12: false,
						hour: '2-digit',
						minute: '2-digit',
					})}`
				: from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
			*/
		});

		const xAxisDataShort = myChart === 'hourly' ? xAxisData.map(label => label.split(' ')[1]) : xAxisData;

		// --- Tagesbereiche: abwechselnd schraffiert/unschraffiert ---
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

		const seriesData = {
			solarYield: extract('solarYield'),
			consumption: extract('consumption'),
			gridExport: extract('gridExport'),
			gridImport: extract('gridImport'),
			chargeCapacity: extract('chargeCapacity'),
			dischargeCapacity: extract('dischargeCapacity'),
			SOC: extract('SOC'),
		};

		// --- Load chart-type specific template ---
		const templateStateId = `statistics.flexCharts.template.${myChart}`;
		const outputStateId = `statistics.flexCharts.jsonOutput.${myChart}`;

		const templateStr = this.stateCache.get(templateStateId)?.value ?? '{}';
		let chartStr = '{}';

		try {
			const templ = JSON.parse(templateStr);

			if (Object.keys(templ).length === 0) {
				// Kein Template → built-in Default
				chartStr = this._buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData);
			} else {
				// Template vorhanden → mit javascript-stringify serialisieren
				chartStr = stringify(templ);
			}
		} catch (e) {
			this.adapter.logger.warn(`statistics: invalid template for ${myChart}: ${e.message}`);
			chartStr = this._buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData);
		}

		// --- Replace data placeholders ---

		chartStr = chartStr
			.replace("'%%xAxisData%%'", JSON.stringify(xAxisData))
			.replace("'%%xAxisDataShort%%'", JSON.stringify(xAxisDataShort))
			.replace("'%%solarYield%%'", JSON.stringify(seriesData.solarYield))
			.replace("'%%consumption%%'", JSON.stringify(seriesData.consumption))
			.replace("'%%gridExport%%'", JSON.stringify(seriesData.gridExport))
			.replace("'%%gridImport%%'", JSON.stringify(seriesData.gridImport))
			.replace("'%%chargeCapacity%%'", JSON.stringify(seriesData.chargeCapacity))
			.replace("'%%dischargeCapacity%%'", JSON.stringify(seriesData.dischargeCapacity))
			.replace("'%%SOC%%'", JSON.stringify(seriesData.SOC))
			.replace("'%%dayAreas%%'", JSON.stringify(dayAreas))
			.replace("'%%chartTitle%%'", JSON.stringify(`SUN2000 PV Statistics — ${myChart}`))
			.replace("'%%xAxisMax%%'", String(xAxisData.length - 1));

		// --- In chart-type specific output state speichern ---
		this.stateCache.set(outputStateId, chartStr, { type: 'string' });
		this.adapter.logger.debug(`statistics: flexCharts built for ${myChart}/${chartStyle}`);

		return chartStr;
	}

	_buildDefaultChart(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData) {
		const xAxisFormatterHourly = value => {
			if (value.includes('|')) return value;
			return value.split(' ')[1] ?? value;
		};

		const seriesType = chartStyle === 'line' ? 'line' : 'bar';
		const lineOptions =
			chartStyle === 'line' ? { smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 }, areaStyle: { opacity: 0.15 } } : {};

		// Gegenläufige Werte: negatives Vorzeichen für Export, Charge, Discharge
		const negate = arr => arr.map(v => Number((-v).toFixed(3)));

		const chart = {
			backgroundColor: '#fff',
			animation: false,
			title: {
				left: 'center',
				text: `SUN2000 Statistics — ${myChart}`,
			},
			legend: {
				top: 35,
				left: 'center',
				data: ['Solar Yield', 'Grid Export', 'Grid Import', 'Charge', 'Discharge', 'SOC', 'Consumption'],
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'cross' },
				backgroundColor: 'rgba(245,245,245,0.95)',
				borderWidth: 1,
				borderColor: '#ccc',
				padding: 10,
				textStyle: { color: '#000' },
				// Tooltip zeigt immer positive Werte — Vorzeichen für Anzeige umkehren
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
				{ left: '8%', right: '8%', top: 80, height: '50%' },
				{ left: '8%', right: '8%', top: '75%', height: '15%' },
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
				{
					// Hauptachse links — Energie mit Nulllinie in der Mitte
					scale: false,
					splitArea: { show: true },
					name: 'Energy (kWh)',
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: '{value} kWh' },
					// Nulllinie hervorheben
					splitLine: { show: true },
					axisLine: { show: true },
				},
				{
					// SOC-Achse rechts — 0..100%
					type: 'value',
					min: 0,
					max: 100,
					name: 'SOC (%)',
					nameLocation: 'middle',
					nameGap: 40,
					axisLabel: { formatter: '{value} %' },
					splitLine: { show: false },
					axisLine: { show: true },
				},
				{
					// Consumption-Achse für unteres Grid
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
				// --- Positive Werte (oberhalb Nulllinie) ---
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
				// --- Negative Werte (unterhalb Nulllinie) ---
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
				{
					name: 'Discharge',
					type: seriesType,
					data: seriesData.dischargeCapacity,
					itemStyle: { color: '#ed50e0' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				// --- SOC auf rechter Y-Achse ---
				{
					name: 'SOC',
					type: 'line',
					yAxisIndex: 1,
					data: seriesData.SOC,
					itemStyle: { color: '#ff9f40' },
					lineStyle: { width: 2, type: 'dashed' },
					symbol: 'none',
					smooth: true,
					// Kein areaStyle für SOC — bleibt als klare Linie
				},
				// --- Consumption im unteren Grid ---
				{
					name: 'Consumption',
					type: seriesType,
					data: seriesData.consumption,
					itemStyle: { color: '#337ab7' },
					xAxisIndex: 1,
					yAxisIndex: 2,
					...lineOptions,
				},
				// --- Tages-Bereiche ---
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

		// Tooltip-Formatter: negative Werte wieder positiv anzeigen
		const tooltipFormatter = params => {
			if (!Array.isArray(params)) params = [params];
			return params
				.filter(p => p.seriesName !== 'DayBreak')
				.map(p => {
					const negated = ['Grid Export', 'Charge'];
					const val = negated.includes(p.seriesName) ? Math.abs(p.value) : p.value;
					const unit = p.seriesName === 'SOC' ? ' %' : ' kWh';
					return `${p.marker}${p.seriesName}: <b>${val}${unit}</b>`;
				})
				.join('<br/>');
		};

		return stringify(chart).replace("'%%xAxisFormatter%%'", stringify(xAxisFormatterHourly)).replace("'%%tooltipFormatter%%'", stringify(tooltipFormatter));
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
	_buildDefaultChart_old(myChart, chartStyle, xAxisData, xAxisDataShort, dayAreas, seriesData) {
		const xAxisFormatterHourly = value => {
			if (value.includes('|')) return value;
			return value.split(' ')[1] ?? value;
		};

		const seriesType = chartStyle === 'line' ? 'line' : 'bar';
		const lineOptions =
			chartStyle === 'line' ? { smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2 }, areaStyle: { opacity: 0.15 } } : {};

		const chart = {
			backgroundColor: '#fff',
			animation: false,
			title: {
				left: 'center',
				text: `SUN2000 PV Statistics — ${myChart}`,
			},
			legend: {
				top: 30,
				left: 'center',
				data: ['Solar Yield', 'Consumption', 'Grid Export', 'Grid Import', 'Charge', 'Discharge'],
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'cross' },
				backgroundColor: 'rgba(245,245,245,0.95)',
				borderWidth: 1,
				borderColor: '#ccc',
				padding: 10,
				textStyle: { color: '#000' },
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
				{ left: '8%', right: '4%', top: 80, height: '55%' },
				{ left: '8%', right: '4%', top: '75%', height: '15%' },
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
				{
					scale: true,
					splitArea: { show: true },
					name: 'Energy (kWh)',
					nameLocation: 'middle',
					nameGap: 50,
					axisLabel: { formatter: '{value} kWh' },
				},
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
				{
					name: 'Solar Yield',
					type: seriesType,
					data: seriesData.solarYield,
					itemStyle: { color: '#f6c94e' },
					emphasis: { focus: 'series' },
					...lineOptions,
				},
				{
					name: 'Grid Export',
					type: seriesType,
					data: seriesData.gridExport,
					itemStyle: { color: '#5cb85c' },
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
					name: 'Charge',
					type: seriesType,
					data: seriesData.chargeCapacity,
					itemStyle: { color: '#5bc0de' },
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
				{
					name: 'Consumption',
					type: seriesType,
					data: seriesData.consumption,
					itemStyle: { color: '#337ab7' },
					xAxisIndex: 1,
					yAxisIndex: 1,
					...lineOptions,
				},
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

		return stringify(chart).replace("'%%xAxisFormatter%%'", stringify(xAxisFormatterHourly));
	}

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
				// Rekursiv für verschachtelte Objekte
				this._deepMerge(target[key], source[key]);
			} else {
				// Primitive, Arrays direkt überschreiben
				target[key] = source[key];
			}
		}
		return target;
	}

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
	 * @param {{chart?: string}} message
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
