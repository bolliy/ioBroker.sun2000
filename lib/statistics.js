'use strict';

const { dataRefreshRate, statisticsType } = require(`${__dirname}/types.js`);

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.taskTimer = null;
		this.testing = false; // set to true for testing purposes
		// initialize to current time to avoid immediate backfill on startup
		const nowInit = new Date();
		this.lastExecution = {
			hourly: nowInit,
			daily: nowInit,
			weekly: nowInit,
			monthly: nowInit,
			annual: nowInit,
		};

		this.postProcessHooks = [
			{
				refresh: dataRefreshRate.low,
				states: [
					{
						id: 'statistics.jsonHourly',
						name: 'Hourly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Hourly consumption for current day per full hour',
						initVal: '[]',
					},
					{
						id: 'statistics.consumption.jsonDaily',
						name: 'Daily consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Daily consumption for current month per day',
						initVal: '[]',
					},
					{
						id: 'statistics.consumption.jsonWeekly',
						name: 'Weekly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Weekly consumption for current year per week',
						initVal: '[]',
					},
					{
						id: 'statistics.consumption.jsonMonthly',
						name: 'Monthly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Monthly consumption for current year per month',
						initVal: '[]',
					},
					{
						id: 'statistics.consumption.jsonAnnual',
						name: 'Annual consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Annual consumption per year',
						initVal: '[]',
					},
				],
			},
		];

		this._initializeTask();
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
	async _calculateGeneric(stateId, consumptionKey, periodStart, periodType) {
		try {
			const now = new Date();
			const consumption = this.stateCache.get(consumptionKey)?.value;
			if (consumption === null || consumption === undefined) return;

			const toStr = this._localIsoWithOffset(now);
			let jsonStr = this.stateCache.get(stateId)?.value ?? '[]';
			let arr = [];
			try {
				arr = JSON.parse(jsonStr);
				if (!Array.isArray(arr)) arr = [];
			} catch {
				arr = [];
			}

			let fromDate = periodStart;
			let value = consumption;
			let last = {};
			if (arr.length > 0) {
				last = arr[arr.length - 1];
				// avoid duplicates
				if (last.to === toStr) return;
				const lastTotal = Number(last['consumptionToday'] ?? 0);
				//reset to period start if value did not increase since last entry, otherwise take difference to last entry
				if (value >= lastTotal) {
					//fromDate = new Date(last.to);
					value -= lastTotal;
				}
				const lastToDate = new Date(last.to);
				// reset to period start if last entry is in the future (can happen if clock was adjusted), otherwise take last entry date as fromDate
				if (lastToDate >= periodStart || new Date(toStr) <= periodStart) {
					fromDate = lastToDate;
				}
			} else {
				value = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
			}

			const entry = {
				from: this._localIsoWithOffset(fromDate),
				to: toStr,
				['consumption']: Number(value.toFixed(3)),
				['consumptionToday']: Number(consumption.toFixed(3)),
			};

			arr.push(entry);

			arr.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));

			this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
			this.adapter.logger.debug(`Appended ${periodType} statistic ${toStr}`);
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} statistic hook: ${err.message}`);
		}
	}

	async _calculateGeneric2(stateId, periodStart) {
		const stats = [
			{
				sourceId: 'collected.consumptionToday',
				targetPath: 'consumption',
				unit: 'kWh',
				type: statisticsType.delta, // value is a total that resets at the start of the period, so we need to calculate the delta to get the actual consumption for the period
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
			{ sourceId: 'collected.dailyInputYield', targetPath: 'inputYield', unit: 'kWh', type: statisticsType.delta },
			{
				sourceId: 'collected.consumptionSum',
				targetPath: 'consumptionSum',
				unit: 'kWh',
				type: statisticsType.delta,
			},
			{
				sourceId: 'collected.SOC',
				targetPath: 'SOC',
				unit: '%',
				type: statisticsType.level, // value is a level that can go up and down, so we take the value as is without calculating delta
			},
			{ sourceId: 'collected.gridExportToday', targetPath: 'gridExportToday', unit: 'kWh', type: statisticsType.delta },
			{ sourceId: 'collected.gridImportToday', targetPath: 'gridImportToday', unit: 'kWh', type: statisticsType.delta },
		];

		const now = new Date();
		const toStr = this._localIsoWithOffset(now);
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
			if (last.to === toStr) return;
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

		for (const stat of stats) {
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
		await this._calculateGeneric2('statistics.jsonHourly', startOfDay);
	}

	async _clearHourly() {
		const now = new Date();
		const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		const consumption = this.stateCache.get('collected.consumptionToday')?.value;
		if (consumption === null || consumption === undefined) return;

		let jsonStr = this.stateCache.get('statistics.consumption.jsonHourly')?.value ?? '[]';
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

		this.stateCache.set('statistics.jsonHourly', JSON.stringify(arr), { type: 'string' });
	}

	/**
	 * Calculates and aggregates consumption statistics based on the given parameters.
	 *
	 * This function calculates and aggregates the consumption statistics based on the source entries within a specific window.
	 * It retrieves the source entries, filters them based on the window, calculates the sum of consumption, and appends the result to the target array.
	 *
	 * @param {string} sourceStateId - The ID of the source state to retrieve entries from.
	 * @param {string} targetStateId - The ID of the target state to append the aggregated result.
	 * @param {Function} getWindowStart - A function that returns the start date of the window based on the current date.
	 * @param {Function} getRetentionStart - A function that returns the start date for retention of entries.
	 * @param {string} periodType - The type of period for which the aggregation is performed.
	 * @param {string} [valueName] - The key to access the consumption value in the source entries.
	 * @param {boolean} [takeLastValue] - Flag to indicate whether to take the last value from the source entries for aggregation.
	 * @returns {void}
	 */
	async _calculateAggregation(sourceStateId, targetStateId, getWindowStart, getRetentionStart, periodType, valueName = 'consumption', takeLastValue = false) {
		try {
			const now = new Date();
			const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
			const toStr = this._localIsoWithOffset(toDate);
			const fromDate = getWindowStart(now);

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

			// Sum consumption for the window
			let sum = 0;
			if (takeLastValue) {
				sum = sourceEntries.length > 0 ? sourceEntries[sourceEntries.length - 1]?.[valueName] : 0;
			} else {
				try {
					sourceEntries.forEach(entry => {
						sum += Number(entry[valueName] ?? 0);
					});
				} catch (e) {
					this.adapter.logger.warn(`Error during ${periodType} statistic aggregation: ${e.message}`);
				}
			}

			sum = Math.round((Number(sum) + Number.EPSILON) * 1000) / 1000;

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

			targetArray.push({
				from: this._localIsoWithOffset(fromDate),
				to: toStr,
				consumption: sum.toFixed(3),
			});

			// Retention: keep entries from retention start onwards
			const retentionStart = getRetentionStart(now);
			targetArray = targetArray.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= retentionStart.getTime();
			});

			targetArray.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));
			this.stateCache.set(targetStateId, JSON.stringify(targetArray), { type: 'string' });
			this.adapter.logger.debug(`Appended ${periodType} statistic ${toStr} val=${sum}`);
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
		await this._calculateAggregation(
			'statistics.consumption.jsonHourly',
			'statistics.consumption.jsonDaily',
			now => {
				// aggregation window: yesterday
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const yesterday = new Date(today);
				yesterday.setDate(today.getDate() - 1);
				return yesterday;
			},
			now => {
				// retention: current year
				return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
			},
			'daily',
			'consumptionToday',
			true,
		);
	}

	/**
	 * Calculates and updates weekly consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	async _calculateWeekly() {
		await this._calculateAggregation(
			'statistics.consumption.jsonDaily',
			'statistics.consumption.jsonWeekly',
			now => {
				// aggregation window: previous 7 days
				const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
				const weekAgo = new Date(today);
				weekAgo.setDate(today.getDate() - 7);
				return weekAgo;
			},
			now => {
				// retention: current year
				return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
			},
			'weekly',
		);
	}

	/**
	 * Calculates and updates monthly consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	async _calculateMonthly() {
		await this._calculateAggregation(
			'statistics.consumption.jsonDaily',
			'statistics.consumption.jsonMonthly',
			now => {
				// aggregation windowStart: previous month (month that just ended)
				//const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
				const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
				return prevMonth;
			},
			now => {
				// retention: current year
				return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
			},
			'monthly',
		);
	}

	/**
	 * Calculates and updates annual consumption statistics from daily data.
	 *
	 * @returns {void}
	 */
	async _calculateAnnual() {
		await this._calculateAggregation(
			'statistics.consumption.jsonDaily',
			'statistics.consumption.jsonAnnual',
			now => {
				// aggregation window: previous year (year that just ended)
				//const thisYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
				const prevYear = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
				return prevYear;
			},
			() => {
				// retention: all years (no filtering)
				return new Date(1970, 0, 1, 0, 0, 0, 0);
			},
			'annual',
		);
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

			this.taskTimer = this.adapter.setTimeout(async () => {
				await this._executeScheduledTasks();
				scheduleNextRun(); // reschedule for next hour
			}, msToNextHour);
		};

		scheduleNextRun();
	}

	/**
	 * Check and execute all scheduled tasks that are due.
	 */
	async _executeScheduledTasks() {
		const now = new Date();

		// Finally hourly for the new hour
		if (!this.lastExecution.hourly || this._shouldExecuteHourly(this.lastExecution.hourly, now)) {
			await this._calculateHourly();
			this.lastExecution.hourly = now;
		}

		// DAILY first: must run before hourly clears hourly-array at midnight
		if (!this.lastExecution.daily || this._shouldExecuteDaily(this.lastExecution.daily, now)) {
			await this._calculateDaily();
			this.lastExecution.daily = now;
			this.adapter.log.debug('### Daily execution triggered ###');
		}

		// Weekly/Monthly/Annual rely on daily, so run them after daily
		if (!this.lastExecution.weekly || this._shouldExecuteWeekly(this.lastExecution.weekly, now)) {
			await this._calculateWeekly();
			this.lastExecution.weekly = now;
			this.adapter.log.debug('### Weekly execution triggered ###');
		}

		if (!this.lastExecution.monthly || this._shouldExecuteMonthly(this.lastExecution.monthly, now)) {
			await this._calculateMonthly();
			this.lastExecution.monthly = now;
			this.adapter.log.debug('### Monthly execution triggered ###');
		}

		if (!this.lastExecution.annual || this._shouldExecuteAnnual(this.lastExecution.annual, now)) {
			await this._calculateAnnual();
			this.lastExecution.annual = now;
			this.adapter.log.debug('### Annual execution triggered ###');
		}
	}

	/**
	 * Check if hourly calculation should run (every full hour).
	 * @param lastExecution
	 * @param now
	 */
	_shouldExecuteHourly(lastExecution, now) {
		if (this.testing) {
			return lastExecution.getMinutes() !== now.getMinutes() || lastExecution.getDate() !== now.getDate();
		}
		return lastExecution.getHours() !== now.getHours() || lastExecution.getDate() !== now.getDate();
	}

	/**
	 * Check if daily calculation should run (new day).
	 * @param lastExecution
	 * @param now
	 */
	_shouldExecuteDaily(lastExecution, now) {
		if (this.testing) {
			return lastExecution.getHours() !== now.getHours() || lastExecution.getDate() !== now.getDate();
		}
		return lastExecution.getDate() !== now.getDate();
	}

	/**
	 * Check if weekly calculation should run (new week on Sunday).
	 * @param lastExecution
	 * @param now
	 */
	_shouldExecuteWeekly(lastExecution, now) {
		const lastDay = lastExecution.getDay();
		const currentDay = now.getDay();
		return lastDay !== 0 && currentDay === 0; // transition to Sunday
	}

	/**
	 * Check if monthly calculation should run (new month).
	 * @param lastExecution
	 * @param now
	 */
	_shouldExecuteMonthly(lastExecution, now) {
		return lastExecution.getMonth() !== now.getMonth();
	}

	/**
	 * Check if annual calculation should run (new year).
	 * @param lastExecution
	 * @param now
	 */
	_shouldExecuteAnnual(lastExecution, now) {
		return lastExecution.getFullYear() !== now.getFullYear();
	}

	async mitNightProcess() {
		await this._executeScheduledTasks();
	}

	async loadStates() {
		// load consumption JSON states (keep as string)
		let state = await this.adapter.getState('statistics.jsonHourly');
		this.stateCache.set('statistics.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statisticsjsonDaily');
		this.stateCache.set('statistics.jsonDaily', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonWeekly');
		this.stateCache.set('statistics.jsonWeekly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jsonMonthly');
		this.stateCache.set('statistics.jsonMonthly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.jonAnnual');
		this.stateCache.set('statistics.jsonAnnual', state?.val ?? '[]', { type: 'string', stored: true });
	}
}

module.exports = statistics;
