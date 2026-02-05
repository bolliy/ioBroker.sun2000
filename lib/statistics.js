'use strict';

const { dataRefreshRate } = require(`${__dirname}/types.js`);

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.taskTimer = null;
		this.lastExecution = {
			hourly: null,
			daily: null,
			weekly: null,
			monthly: null,
			annual: null,
		};

		this.postProcessHooks = [
			{
				refresh: dataRefreshRate.low,
				states: [
					{
						id: 'statistics.consumption.jsonHourly',
						name: 'Hourly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Hourly consumption for current day per full hour',
					},
					{
						id: 'statistics.consumption.jsonDaily',
						name: 'Daily consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Daily consumption for current month per day',
					},
					{
						id: 'statistics.consumption.jsonWeekly',
						name: 'Weekly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Weekly consumption for current year per week',
					},
					{
						id: 'statistics.consumption.jsonMonthly',
						name: 'Monthly consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Monthly consumption for current year per month',
					},
					{
						id: 'statistics.consumption.jsonAnnual',
						name: 'Annual consumption JSON',
						type: 'string',
						role: 'json',
						desc: 'Annual consumption per year',
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
	 * @param {boolean} isDiffValue - If true, calculate as difference, else use absolute value
	 * @returns {Promise<void>}
	 */
	async _calculateGeneric(stateId, consumptionKey, periodStart, periodType, isDiffValue = false) {
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

			let last = {};
			if (arr.length > 0) {
				last = arr[arr.length - 1];
				// avoid duplicates
				if (last.to === toStr) return;
			}

			let value;
			if (isDiffValue) {
				value = consumption - (last?.consumptionValue ?? 0);
				value = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
			} else {
				value = consumption;
			}

			const entry = {
				from: last.to ?? this._localIsoWithOffset(periodStart),
				to: toStr,
				consumption: value.toFixed(3),
			};

			// For hourly entries, include the current total as well
			if (periodType === 'hourly') {
				entry.consumptionToday = Number(consumption.toFixed(3));
			}

			arr.push(entry);

			// keep only current period
			arr = arr.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= periodStart.getTime();
			});

			arr.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));

			this.stateCache.set(stateId, JSON.stringify(arr), { type: 'string' });
			this.adapter.logger.debug(`Appended ${periodType} statistic ${toStr}`);
		} catch (err) {
			this.adapter.logger.warn(`Error during ${periodType} statistic hook: ${err.message}`);
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
	async _calculate() {
		const now = new Date();
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
		await this._calculateGeneric('statistics.consumption.jsonHourly', 'collected.consumptionToday', startOfDay, 'hourly', true);
	}

	/**
	 * Calculates and updates daily consumption statistics.
	 *
	 * @returns {void}
	 */
	async _calculateDaily() {
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
		await this._calculateGeneric('statistics.consumption.jsonDaily', 'collected.consumptionToday', startOfMonth, 'daily', false);
	}

	/**
	 * Calculates and updates weekly consumption statistics.
	 *
	 * @returns {void}
	 */
	async _calculateWeekly() {
		const now = new Date();
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		await this._calculateGeneric('statistics.consumption.jsonWeekly', 'collected.consumptionYear', startOfYear, 'weekly', false);
	}

	/**
	 * Calculates and updates monthly consumption statistics.
	 *
	 * @returns {void}
	 */
	async _calculateMonthly() {
		const now = new Date();
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		await this._calculateGeneric('statistics.consumption.jsonMonthly', 'collected.consumptionYear', startOfYear, 'monthly', false);
	}

	/**
	 * Calculates and updates annual consumption statistics.
	 *
	 * @returns {void}
	 */
	async _calculateAnnual() {
		const now = new Date();
		const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
		await this._calculateGeneric('statistics.consumption.jsonAnnual', 'collected.consumptionYear', startOfYear, 'annual', false);
	}

	/**
	 * Initialize and schedule the unified task manager.
	 * This task runs every minute and checks which statistics need to be calculated.
	 */
	_initializeTask() {
		const scheduleNextRun = () => {
			const now = new Date();
			const next = new Date(now);
			next.setHours(next.getHours() + 1, 0, 0, 0);
			const msToNextHour = next.getTime() - now.getTime();

			if (this.taskTimer) {
				this.adapter.clearTimeout(this.taskTimer);
			}

			this.taskTimer = this.adapter.setTimeout(async () => {
				await this._executeScheduledTasks();
				scheduleNextRun(); // reschedule for next minute
			}, msToNextHour);
		};

		scheduleNextRun();
	}

	/**
	 * Check and execute all scheduled tasks that are due.
	 */
	async _executeScheduledTasks() {
		const now = new Date();

		// Check hourly (every full hour)
		if (!this.lastExecution.hourly || this._shouldExecuteHourly(this.lastExecution.hourly, now)) {
			await this._calculate();
			this.lastExecution.hourly = now;
		}

		// Check daily (every midnight)
		if (!this.lastExecution.daily || this._shouldExecuteDaily(this.lastExecution.daily, now)) {
			await this._calculateDaily();
			this.lastExecution.daily = now;
			this.adapter.log.debug('### Daily execution triggered ###');
		}

		// Check weekly (every Sunday at midnight)
		if (!this.lastExecution.weekly || this._shouldExecuteWeekly(this.lastExecution.weekly, now)) {
			await this._calculateWeekly();
			this.lastExecution.weekly = now;
			this.adapter.log.debug('### Weekly execution triggered ###');
		}

		// Check monthly (every 1st of month at midnight)
		if (!this.lastExecution.monthly || this._shouldExecuteMonthly(this.lastExecution.monthly, now)) {
			await this._calculateMonthly();
			this.lastExecution.monthly = now;
			this.adapter.log.debug('### Monthly execution triggered ###');
		}

		// Check annual (every Jan 1st at midnight)
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
		return lastExecution.getHours() !== now.getHours() || lastExecution.getDate() !== now.getDate();
	}

	/**
	 * Check if daily calculation should run (new day).
	 * @param lastExecution
	 * @param now
	 */
	_shouldExecuteDaily(lastExecution, now) {
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

	async loadStates() {
		// load consumption JSON states (keep as string)
		let state = await this.adapter.getState('statistics.consumption.jsonHourly');
		this.stateCache.set('statistics.consumption.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.consumption.jsonDaily');
		this.stateCache.set('statistics.consumption.jsonDaily', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.consumption.jsonWeekly');
		this.stateCache.set('statistics.consumption.jsonWeekly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.consumption.jsonMonthly');
		this.stateCache.set('statistics.consumption.jsonMonthly', state?.val ?? '[]', { type: 'string', stored: true });

		state = await this.adapter.getState('statistics.consumption.jsonAnnual');
		this.stateCache.set('statistics.consumption.jsonAnnual', state?.val ?? '[]', { type: 'string', stored: true });
	}
}

module.exports = statistics;
