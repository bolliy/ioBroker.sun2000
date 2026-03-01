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
				type: statisticsType.delta, // value is a total that resets at the start of the period, so we need to calculate the delta to get the actual consumption for the period
			},
			{
				sourceId: 'collected.consumptionSum',
				targetPath: 'consumptionSum',
				unit: 'kWh',
				type: statisticsType.delta,
			},
			{
				sourceId: 'collected.dailySolarYield',
				targetPath: 'solarYield',
				unit: 'kWh',
				type: statisticsType.delta,
			},
			{
				sourceId: 'collected.dailyExternalYield',
				targetPath: 'externalYield',
				unit: 'kWh',
				type: statisticsType.delta,
			},
			{ sourceId: 'collected.dailyEnergyYield', targetPath: 'energyYield', unit: 'kWh', type: statisticsType.delta },
			{
				sourceId: 'collected.SOC',
				targetPath: 'SOC',
				unit: '%',
				type: statisticsType.level, // value is a level that can go up and down, so we take the value as is without calculating delta
			},
			{ sourceId: 'collected.currentDayChargeCapacity', targetPath: 'chargeCapacity', unit: 'kWh', type: statisticsType.delta },
			{ sourceId: 'collected.currentDayDischargeCapacity', targetPath: 'dischargeCapacity', unit: 'kWh', type: statisticsType.delta },
			{ sourceId: 'collected.gridExportToday', targetPath: 'gridExport', unit: 'kWh', type: statisticsType.delta },
			{ sourceId: 'collected.gridImportToday', targetPath: 'gridImport', unit: 'kWh', type: statisticsType.delta },
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
		//const now = new Date();
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
			if (stat.type === statisticsType.delta) {
				const lastTotal = Number(last[stat.targetPath]?.['total'] ?? 0);
				//reset to period start if value did not increase since last entry, otherwise take difference to last entry
				if (value >= lastTotal) {
					value -= lastTotal;
				}
			}
			value = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
			entry[stat.targetPath] = {
				value: Number(value.toFixed(3)),
			};

			if (stat.type === statisticsType.delta) {
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
				startday.setDate(now.getDate() - (now.getDay() || 7) + 1); // set to Monday of current week
				lastday.setDate(now.getDate() - (now.getDay() - 1) + 6);
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
		await this._executeScheduledTasks(); // execute immediately on startup to catch up on any missed runs while the adapter was not running
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
		//await this._clearGeneric('statistics.jsonAnnual', new Date(1970, 0, 1, 0, 0, 0, 0));
	}

	async initialize() {
		// load consumption JSON states (keep as string)
		let state = await this.adapter.getState('statistics.jsonHourly');
		this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statisticsjsonDaily');
		this.stateCache.set('statistics.jsonDaily', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonWeekly');
		this.stateCache.set('statistics.jsonWeekly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonMonthly');
		this.stateCache.set('statistics.jsonMonthly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonAnnual');
		this.stateCache.set('statistics.jsonAnnual', state?.val ?? '[]', { type: 'string', stored: true });

		// wait until consumptionToday and so on is available to avoid running the task before the initial state is loaded
		await tools.waitForValue(() => this.stateCache.get('collected.consumptionToday')?.value, 60000);
		await tools.waitForValue(() => this.stateCache.get('collected.dailySolarYield')?.value, 60000);
		await tools.waitForValue(() => this.stateCache.get('collected.SOC')?.value, 60000);
		this._initializeTask();
	}
}

module.exports = statistics;
