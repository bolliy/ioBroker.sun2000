'use strict';

const { deviceType, storeType, dataRefreshRate, dataType } = require(`${__dirname}/types.js`);

class statistics {
	constructor(adapterInstance, stateCache) {
		this.adapter = adapterInstance;
		this.stateCache = stateCache;
		this.hourTimer = null;

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
				],
				fn: () => {
					this.adapter.log.debug('### statistics._hourly() -> fn ###');
				},
			},
		];

		this._hourly();
	}

	get processHooks() {
		return this.postProcessHooks;
	}

	async _calculate() {
		try {
			const now = new Date();
			const prevHour = new Date(now);
			//prevHour.setHours(prevHour.getHours() - 1, 0, 0, 0);
			prevHour.setHours(prevHour.getHours(), prevHour.getMinutes() - 1, 0, 0);

			const consumptionToday = this.stateCache.get('collected.consumptionToday')?.value;
			if (consumptionToday === null || consumptionToday === undefined) return;

			const localIsoWithOffset = d => {
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
			};
			const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
			const toStr = localIsoWithOffset(now);
			let jsonStr = this.stateCache.get('statistics.consumption.jsonHourly')?.value ?? '[]';
			let arr = [];
			try {
				arr = JSON.parse(jsonStr);
				if (!Array.isArray(arr)) arr = [];
			} catch {
				arr = [];
			}

			let fromStr = localIsoWithOffset(startOfDay);
			let last = {};
			if (arr.length > 0) {
				last = arr[arr.length - 1];
				// avoid duplicates
				if (last.to === toStr) return;
				fromStr = last.to;
			}
			const consumption = consumptionToday - (last?.consumptionToday ?? 0);
			const value = Math.round((Number(consumption) + Number.EPSILON) * 1000) / 1000;
			arr.push({ from: fromStr, to: toStr, consumptionToday: Number(consumptionToday.toFixed(3)), comsumption: value.toFixed(3) });

			// keep only current day
			arr = arr.filter(item => {
				const ts = Date.parse(item.from);
				return !Number.isNaN(ts) && ts >= startOfDay.getTime();
			});

			arr.sort((a, b) => Date.parse(a.to) - Date.parse(b.to));

			this.stateCache.set('statistics.consumption.jsonHourly', JSON.stringify(arr), { type: 'string' });
			this.adapter.logger.debug(`Appended hourly statistic ${toStr} val=${value}`);
		} catch (err) {
			this.adapter.logger.warn(`Error during hourly statistic hook: ${err.message}`);
		}
	}

	/**
	 * Function that runs hourly tasks and resets itself for the next hour.
	 */
	async _hourly() {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
		//const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0); //test every minute
		const msToNextHour = next.getTime() - now.getTime();

		if (this.hourTimer) {
			this.adapter.clearTimeout(this.hourTimer);
		}
		this.hourTimer = this.adapter.setTimeout(async () => {
			this.adapter.log.debug(`### Hourly ${Math.round(msToNextHour / 1000)} sec ###`);

			await this._calculate();
			this._hourly(); //      reset again next hour.
		}, msToNextHour);
	}

	async loadStates() {
		// load hourly consumption json (keep as string)
		let state = await this.adapter.getState('statistics.consumption.jsonHourly');
		this.stateCache.set('statistics.consumption.jsonHourly', state?.val ?? '[]', { type: 'string', stored: true });
	}
}

module.exports = statistics;
