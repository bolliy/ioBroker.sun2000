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

const { dataRefreshRate, statisticsType } = require(`${__dirname}/types.js`);
const tools = require(`${__dirname}/tools.js`);

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.taskTimer = null;
		this.testing = false; // set to true for testing purposes
		// initialize to current time to avoid immediate backfill on startup
		//const nowInit = new Date();
		this.lastExecution = {
			hourly: undefined,
			daily: undefined,
			weekly: undefined,
			monthly: undefined,
			annual: undefined,
		};

		this.stats = [
			{
				sourceId: 'collected.consumptionToday',
				targetPath: 'consumption',
				unit: 'kWh',
				type: statisticsType.deltaReset, // value is a total that resets at the start of the period, so we need to calculate the delta to get the actual consumption for the period
			},
			/*
			{
				sourceId: 'collected.consumptionSum',
				targetPath: 'consumptionSum',
				unit: 'kWh',
				type: statisticsType.delta,
			},
			*/
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
					/*
					{
						id: 'statistics.flexChartTemplate',
						name: 'Flexcharts template',
						type: 'string',
						role: 'json',
						desc: 'Optional eCharts option object that will be merged into the default chart. Leave empty for the built‑in layout.',
						initVal: '{}',
					},
					*/
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

	async _calculateGeneric(stateId, periodStart, periodEnde) {
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
	}

	/**
	 * Calculates and updates hourly consumption statistics.
	 *
	 * This function calculates the hourly consumption statistics based on the current day's data.
	 * It retrieves the consumption data and updates the hourly consumption JSON accordingly.
	 *
	 * @returns {void}
	 */
	async _calculateHourly() {
		const now = new Date();
		if (this.testing) {
			const state = await this.adapter.getState('statistics.jsonHourly');
			this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });
			now.setDate(now.getDate() + 1); // set to start of day for testing to have consistent results
			now.setHours(1, 0, 0, 1); // set to 1ms after midnight to trigger hourly calculation for the new day
		}
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		const lastHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
		this.adapter.log.debug('### Hourly execution triggered ###');
		this._calculateGeneric('statistics.jsonHourly', startOfDay, lastHour) && (this.lastExecution.hourly = now); // only update last execution time if calculation was performed to avoid backfilling multiple hours at startup
	}

	async _clearGeneric(stateId, periodStart) {
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
	async _calculateAggregation(sourceStateId, targetStateId, getWindow, periodType) {
		try {
			const now = new Date();
			const window = getWindow(now);
			const fromDate = window.from;
			const toDate = window.to;
			if (now < toDate) {
				this.adapter.logger.debug(`statistics.js: Skipping ${periodType} aggregation because current time is before end of aggregation window`);
				return;
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
			if (last.to === toStr) return;

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

			// Retention: keep entries from retention start onwards
			/*
			const retentionStart = getRetentionStart(now);
			targetArray = targetArray.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= retentionStart.getTime();
			});
			*/

			targetArray.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
			this.stateCache.set(targetStateId, JSON.stringify(targetArray), { type: 'string' });
			this.adapter.logger.debug(`Appended ${periodType} statistic ${toStr} `);
			return true;
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} aggregation: ${err.message}`);
		}
	}

	/**
	 * Calculates and updates daily consumption statistics from hourly data.
	 *
	 * @returns {void}
	 */
	async _calculateDaily() {
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
		) && (this.lastExecution.daily = new Date()); // only update last execution time if aggregation was performed to avoid backfilling multiple days at startup
	}

	/**
	 * Calculates and updates weekly consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	async _calculateWeekly() {
		this.adapter.log.debug('### Weekly execution triggered ###');
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
		) && (this.lastExecution.weekly = new Date()); // only update last execution time if aggregation was performed to avoid backfilling multiple weeks at startup
	}

	/**
	 * Calculates and updates monthly consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	async _calculateMonthly() {
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
		) && (this.lastExecution.monthly = new Date()); // only update last execution time if aggregation was performed to avoid backfilling multiple months at startup
	}

	/**
	 * Calculates and updates annual consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	async _calculateAnnual() {
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
		) && (this.lastExecution.annual = new Date()); // only update last execution time if aggregation was performed to avoid backfilling multiple years at startup
	}

	/**
	 * Initialize and schedule the unified task manager.
	 * This task runs every minute and checks which statistics need to be calculated.
	 */
	async _initializeTask() {
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

			this.taskTimer = this.adapter.setTimeout(async () => {
				await this._executeScheduledTasks();
				scheduleNextRun(); // reschedule for next hour
			}, msToNextHour);
		};
		//await this._executeScheduledTasks(); // execute immediately on startup to catch up on any missed runs while the adapter was not running
		// Schedule the next run
		scheduleNextRun();
	}
	async _executeScheduledTasks() {
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
	async mitNightProcess() {
		const now = new Date();
		await this._executeScheduledTasks();
		// Clear old data based on retention policies
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		await this._clearGeneric('statistics.jsonDaily', startOfYear);
		await this._clearGeneric('statistics.jsonWeekly', startOfYear);
		await this._clearGeneric('statistics.jsonMonthly', startOfYear);
		await this._clearGeneric('statistics.jsonHourly', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0));
	}

	async initialize() {
		// load consumption JSON states (keep as string)
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

		// load optional flexchart template
		/*
		state = await this.adapter.getState('statistics.flexChartTemplate');
		this.stateCache.set('statistics.flexChartTemplate', state?.val ?? '{}', { type: 'string', stored: true });
        */
		// wait until consumptionToday and so on is available to avoid running the task before the initial state is loaded
		/*
		await tools.waitForValue(() => this.stateCache.get('collected.consumptionToday')?.value, 60000);
		await tools.waitForValue(() => this.stateCache.get('collected.dailySolarYield')?.value, 60000);
		await tools.waitForValue(() => this.stateCache.get('collected.SOC')?.value, 60000);
		*/
		await tools.waitForValue(() => this.stateCache.get('collected.accumulatedEnergyYield')?.value, 60000);
		this.mitNightProcess(); // execute once on startup to catch up on any missed runs while the adapter was not running
		this._initializeTask();
	}

	/**
	 * Build a flexcharts/eCharts option object from stored statistics.
	 * The returned object may be sent to a callback for flexcharts' script source.
	 *
	 * @param {string} myChart - one of 'hourly','daily','weekly','monthly','annual'
	 * @returns {object} chart configuration
	 */
	_buildFlexchart(myChart) {
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

		// default chart configuration (based on flexcharts discussion example)
		const chart = {
			tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
			legend: { show: true, orient: 'horizontal', left: 'center', top: 25 },
			title: { left: 'center', text: 'Statistics ' },
			grid: { right: '20%' },
			toolbox: { feature: { dataView: { show: true, readOnly: false }, restore: { show: true }, saveAsImage: { show: true } } },
			xAxis: [{ type: 'category', axisTick: { alignWithLabel: true }, data: [] }],
			yAxis: [{ type: 'value', position: 'left', alignTicks: true, axisLine: { show: true }, axisLabel: { formatter: '{value}' } }],
			series: [],
		};

		// merge with user-provided template if available
		const templateStr = this.stateCache.get('statistics.flexChartTemplate')?.value;
		if (templateStr) {
			try {
				const templ = JSON.parse(templateStr);
				for (const key of Object.keys(templ)) {
					if (chart[key] && typeof chart[key] === 'object' && typeof templ[key] === 'object') {
						// merge sub-objects shallowly
						Object.assign(chart[key], templ[key]);
					} else {
						chart[key] = templ[key];
					}
				}
			} catch (e) {
				this.adapter.logger.warn(`statistics: invalid flexChartTemplate JSON: ${e.message}`);
			}
		}

		// fill data arrays and collect units from stats definitions
		const xAxis = [];
		const seriesData = {};
		const unitMap = {}; // targetPath -> unit string

		for (const stat of this.stats) {
			unitMap[stat.targetPath] = stat.unit || '';
		}

		for (const entry of data) {
			const from = new Date(entry.from);
			//const to = new Date(entry.to);
			const xVal =
				myChart === 'hourly'
					? from.toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' })
					: from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
			xAxis.push(xVal);
			for (const stat of this.stats) {
				const val = Number(entry[stat.targetPath]?.value ?? 0);
				if (!seriesData[stat.targetPath]) {
					seriesData[stat.targetPath] = [];
				}
				seriesData[stat.targetPath].push(Number(val.toFixed(3)));
			}
		}
		chart.xAxis[0].data = xAxis;

		// apply unit information to axis/tooltip if there is a single unit or per-series
		const units = new Set(Object.values(unitMap).filter(u => u));
		if (units.size === 1) {
			const singleUnit = [...units][0];
			// update default yAxis label and tooltip formatter
			chart.yAxis[0].name = singleUnit ? `(${singleUnit})` : '';
			chart.yAxis[0].axisLabel.formatter = `{value}${singleUnit ? ` ${singleUnit}` : ''}`;
			chart.tooltip.formatter = params => {
				if (!Array.isArray(params)) params = [params];
				return params.map(p => `${p.seriesName}: ${p.value}${singleUnit ? ` ${singleUnit}` : ''}`).join('<br/>');
			};
		} else if (units.size > 1) {
			// multiple units – show per-series unit in tooltip
			chart.tooltip.formatter = params => {
				if (!Array.isArray(params)) params = [params];
				return params
					.map(p => {
						const u = unitMap[p.seriesName] || '';
						return `${p.seriesName}: ${p.value}${u ? ` ${u}` : ''}`;
					})
					.join('<br/>');
			};
		}

		// if chart.series was pre-populated by template use names, otherwise create default series
		if (chart.series && chart.series.length > 0) {
			chart.series.forEach(s => {
				// try exact name first, otherwise case-insensitive lookup
				let key = s.name;
				if (seriesData[key]) {
					s.data = seriesData[key];
				} else {
					// find matching key ignoring case
					const found = Object.keys(seriesData).find(k => k.toLowerCase() === String(key).toLowerCase());
					if (found) {
						s.data = seriesData[found];
					} else {
						s.data = [];
					}
				}
				// ensure unit is added from stats definitions if not present
				if (!s.unit) {
					let unitVal = unitMap[key];
					if (!unitVal) {
						const foundu = Object.keys(unitMap).find(k => k.toLowerCase() === String(key).toLowerCase());
						if (foundu) unitVal = unitMap[foundu];
					}
					s.unit = unitVal || '';
				}
			});
		} else {
			chart.series = Object.keys(seriesData).map(name => ({
				name,
				type: 'line',
				data: seriesData[name],
				unit: unitMap[name] || '',
			}));
		}
		chart.title.text += myChart;
		return chart;
	}

	_buildFlexchart2(myChart) {
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
		/*
		const xAxisData = data.map(entry => {
			const from = new Date(entry.from);
			return myChart === 'hourly'
				? from.toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' })
				: from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
		});
		*/

		// --- X-Axis labels --- bleibt mit Datum+Uhrzeit für den Slider ---
		const xAxisData = data.map(entry => {
			const from = new Date(entry.from);
			return myChart === 'hourly'
				? `${from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${from.toLocaleTimeString('de-DE', {
						hour12: false,
						hour: '2-digit',
						minute: '2-digit',
					})}`
				: from.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
		});

		// Für hourly: zweites Array nur mit Uhrzeit für die Hauptachse
		const xAxisDataShort = myChart === 'hourly' ? xAxisData.map(label => label.split(' ')[1]) : xAxisData;

		// --- Series data extraction ---
		const extract = key =>
			data.map(e => {
				const v = Number(e[key]?.value ?? 0);
				return Number(v.toFixed(3));
			});

		const solarYield = extract('solarYield');
		const consumption = extract('consumption');
		const gridExport = extract('gridExport');
		const gridImport = extract('gridImport');
		const chargeCapacity = extract('chargeCapacity');
		const dischargeCapacity = extract('dischargeCapacity');

		// --- Chart configuration (intraday-breaks-2 layout) ---
		const chart = {
			backgroundColor: '#fff',
			animation: false,
			title: {
				left: 'center',
				text: `PV Statistics — ${myChart}`,
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
			// Two grids: main chart (top 60%) + consumption bar (bottom 16%)
			grid: [
				{ left: '8%', right: '4%', top: 80, height: '55%' },
				{ left: '8%', right: '4%', top: '75%', height: '15%' },
			],
			xAxis: [
				{
					// Hauptachse — nur Uhrzeit
					type: 'category',
					data: xAxisDataShort, // <-- kurzes Array ohne Datum
					scale: true,
					boundaryGap: false,
					axisLine: { onZero: false },
					splitLine: { show: false },
					axisPointer: { z: 100 },
					min: 0,
					max: xAxisDataShort.length - 1,
				},
				{
					// Untere Achse (Consumption-Panel) — ausgeblendet
					type: 'category',
					gridIndex: 1,
					data: xAxisData, // <-- volles Array mit Datum für den Slider
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
			// dataZoom covers full range by default (start:0, end:100)
			dataZoom: [
				{
					type: 'inside',
					xAxisIndex: [0, 1],
					start: 0,
					end: 100,
				},
				{
					show: true,
					xAxisIndex: [0, 1],
					type: 'slider',
					bottom: 5,
					start: 0,
					end: 100,
				},
			],
			series: [
				{
					name: 'Solar Yield',
					type: 'bar',
					data: solarYield,
					itemStyle: { color: '#f6c94e' },
					emphasis: { focus: 'series' },
				},
				{
					name: 'Grid Export',
					type: 'bar',
					data: gridExport,
					itemStyle: { color: '#5cb85c' },
					emphasis: { focus: 'series' },
				},
				{
					name: 'Grid Import',
					type: 'bar',
					data: gridImport,
					itemStyle: { color: '#ec0000' },
					emphasis: { focus: 'series' },
				},
				{
					name: 'Charge',
					type: 'bar',
					data: chargeCapacity,
					itemStyle: { color: '#5bc0de' },
					emphasis: { focus: 'series' },
				},
				{
					name: 'Discharge',
					type: 'bar',
					data: dischargeCapacity,
					itemStyle: { color: '#f0ad4e' },
					emphasis: { focus: 'series' },
				},
				// Consumption as bar in lower grid
				{
					name: 'Consumption',
					type: 'bar',
					xAxisIndex: 1,
					yAxisIndex: 1,
					data: consumption,
					itemStyle: { color: '#337ab7' },
				},
			],
		};

		// --- Merge optional user template ---
		const templateStr = this.stateCache.get('statistics.flexChartTemplate')?.value;
		if (templateStr) {
			try {
				const templ = JSON.parse(templateStr);
				for (const key of Object.keys(templ)) {
					if (chart[key] && typeof chart[key] === 'object' && typeof templ[key] === 'object') {
						Object.assign(chart[key], templ[key]);
					} else {
						chart[key] = templ[key];
					}
				}
			} catch (e) {
				this.adapter.logger.warn(`statistics: invalid flexChartTemplate JSON: ${e.message}`);
			}
		}

		return chart;
	}

	/**
	 * Build a candlestick chart option object based on the intraday-breaks-2 example, adapted for PV yields and consumption.
	 *
	 * @param {string} myChart - one of 'hourly','daily','weekly','monthly','annual'
	 * @returns {object} ECharts option object for candlestick chart
	 */
	_buildCandlestickChart(myChart) {
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
		// Prepare data in [time, open, high, low, close, volume] format for PV data
		// Assumption: Use 'solarYield' as primary stat for OHLC simulation (open/close as start/end, high/low with small variance)
		// Use 'consumption' as volume proxy. Adjust logic based on your data; this is a basic simulation for aggregated data.
		const chartData = data.map(entry => {
			const time = `${new Date(entry.from).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${new Date(
				entry.from,
			).toLocaleTimeString('de-DE', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
			const value = Number(entry.solarYield?.value ?? 0);
			const total = Number(entry.solarYield?.total ?? value);
			const volume = Number(entry.consumption?.value ?? 0); // Use consumption as volume proxy
			// Simulate OHLC: open/close as value/total, high/low with small variance (adjust for real min/max if available)
			const open = value;
			const close = total;
			const high = Math.max(open, close) * 1.05; // Example: 5% higher for high
			const low = Math.min(open, close) * 0.95; // Example: 5% lower for low
			return [time, open, high, low, close, volume];
		});

		// Default candlestick chart configuration (based on intraday-breaks-2 example, adapted for PV)
		const chart = {
			backgroundColor: '#fff',
			animation: false,
			legend: {
				bottom: 10,
				left: 'center',
				data: ['Solar Yield', 'MA5', 'MA10', 'MA20', 'MA30'],
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: {
					type: 'cross',
				},
				backgroundColor: 'rgba(245, 245, 245, 95)',
				borderWidth: 1,
				borderColor: '#ccc',
				padding: 10,
				textStyle: {
					color: '#000',
				},
				position: function (pos, params, el, elRect, size) {
					const obj = { top: 10 };
					obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
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
					brush: { type: ['lineX', 'clear'] },
				},
			},
			brush: {
				xAxisIndex: 'all',
				brushLink: 'all',
				outOfBrush: { colorAlpha: 0.1 },
			},
			visualMap: {
				show: false,
				seriesIndex: 5,
				dimension: 2,
				pieces: [
					{ value: 1, color: '#00da3c' }, // Green for positive (e.g., yield increase)
					{ value: -1, color: '#ec0000' }, // Red for negative (e.g., yield decrease)
				],
			},
			grid: [
				{ left: '10%', right: '8%', height: '50%' },
				{ left: '10%', right: '8%', top: '63%', height: '16%' },
			],
			xAxis: [
				{
					type: 'category',
					data: chartData.map(item => item[0]),
					scale: true,
					boundaryGap: false,
					axisLine: { onZero: false },
					splitLine: { show: false },
					min: 'dataMin',
					max: 'dataMax',
					axisPointer: { z: 100 },
				},
				{
					type: 'category',
					gridIndex: 1,
					data: chartData.map(item => item[0]),
					scale: true,
					boundaryGap: false,
					axisLine: { onZero: false },
					axisTick: { show: false },
					splitLine: { show: false },
					axisLabel: { show: false },
					min: 'dataMin',
					max: 'dataMax',
				},
			],
			yAxis: [
				{
					scale: true,
					splitArea: { show: true },
					name: 'Yield (kWh)', // Adapted for PV
					axisLabel: { formatter: '{value} kWh' },
				},
				{
					scale: true,
					gridIndex: 1,
					splitNumber: 2,
					//axisLabel: { show: false },
					axisLine: { show: false },
					axisTick: { show: false },
					splitLine: { show: false },
					name: 'Consumption (kWh)', // Adapted for volume
					axisLabel: { formatter: '{value} kWh' },
				},
			],
			dataZoom: [
				{
					type: 'inside',
					xAxisIndex: [0, 1],
					start: 98,
					end: 100,
				},
				{
					show: true,
					xAxisIndex: [0, 1],
					type: 'slider',
					top: '97%',
					start: 98,
					end: 100,
				},
			],
			series: [
				{
					name: 'Solar Yield',
					type: 'candlestick',
					data: chartData.map(item => [item[1], item[2], item[3], item[4]]), // [open, high, low, close]
					itemStyle: {
						color: '#00da3c', // Green for positive yield
						color0: '#ec0000', // Red for negative
						borderColor: '#00da3c',
						borderColor0: '#ec0000',
					},
				},
				{
					name: 'MA5',
					type: 'line',
					data: this._calculateMA(5, chartData),
					smooth: true,
					lineStyle: { opacity: 0.5 },
				},
				{
					name: 'MA10',
					type: 'line',
					data: this._calculateMA(10, chartData),
					smooth: true,
					lineStyle: { opacity: 0.5 },
				},
				{
					name: 'MA20',
					type: 'line',
					data: this._calculateMA(20, chartData),
					smooth: true,
					lineStyle: { opacity: 0.5 },
				},
				{
					name: 'MA30',
					type: 'line',
					data: this._calculateMA(30, chartData),
					smooth: true,
					lineStyle: { opacity: 0.5 },
				},
				{
					name: 'Consumption',
					type: 'bar',
					xAxisIndex: 1,
					yAxisIndex: 1,
					data: chartData.map(item => item[5]), // Volume as consumption
				},
			],
		};

		// Merge with user-provided template if available
		const templateStr = this.stateCache.get('statistics.flexChartTemplate')?.value;
		if (templateStr) {
			try {
				const templ = JSON.parse(templateStr);
				for (const key of Object.keys(templ)) {
					if (chart[key] && typeof chart[key] === 'object' && typeof templ[key] === 'object') {
						Object.assign(chart[key], templ[key]);
					} else {
						chart[key] = templ[key];
					}
				}
			} catch (e) {
				this.adapter.logger.warn(`statistics: invalid flexChartTemplate JSON: ${e.message}`);
			}
		}

		return chart;
	}

	/**
	 * Helper function to calculate Moving Average for candlestick data.
	 *
	 * @param {number} dayCount - Number of periods for MA
	 * @param {Array} data - Chart data array
	 * @returns {Array} MA data
	 */
	_calculateMA(dayCount, data) {
		const result = [];
		for (let i = 0, len = data.length; i < len; i++) {
			if (i < dayCount) {
				result.push('-');
				continue;
			}
			let sum = 0;
			for (let j = 0; j < dayCount; j++) {
				sum += data[i - j][4]; // close value
			}
			result.push(sum / dayCount);
		}
		return result;
	}

	/**
	 * Entry point for adapter to handle messages related to statistics/flexcharts.
	 *
	 * @param {{chart?: string}} message
	 * @param {Function} callback
	 */
	handleFlexMessage(message, callback) {
		const chartType = message?.chart || 'hourly';
		const result = this._buildFlexchart2(chartType);
		//const result = this._buildFlexchart(chartType);
		if (callback && typeof callback === 'function') {
			callback(result);
		}
	}
}

module.exports = statistics;
