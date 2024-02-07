'use strict';
const suncalc = require('suncalc2');

class StateMap  {
	constructor () {
		this.stateMap = new Map();
	}

	get(id) {
		return this.stateMap.get(id);
	}

	set(id, value, options) {
		if (options?.type == 'number' && isNaN(value)) return;
		if (id == 'inverter.0.inputPower') console.log('#### '+value);

		if (value !== null) {
			if (options?.type == 'number') {
				value = Math.round((value + Number.EPSILON) * 1000) / 1000; //3rd behind
			}
			if (options?.renew || this.get(id)?.value !== value) {
				if (options?.stored ) {
					this.stateMap.set(id, {id: id, value: value, stored: options.stored});
				} else {
					this.stateMap.set(id, {id: id, value: value});
				}
			}
		}
	}

	values () {
		return this.stateMap.values();
	}

}

class RiemannSum {
	constructor (autoResetAtMitnight = true) {
		this._resetAtMitnight = autoResetAtMitnight;
		this.reset();
	}

	get lastDate() {
		return this._lastDate ? this._lastDate: new Date();
	}

	add (newValue) {
		//Obersumme bilden
		const now = new Date();
		if (this._resetAtMitnight) {
			const night = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(), // today, ...
				0, 0, 0 // ...at 00:00:00 hours
			);
			if (this.lastDate && this.lastDate.getTime() <= night.getTime()) {
				this.reset();
			}
		}
		this._sum += newValue * (now.getTime() - this.lastDate.getTime())/3600/1000; //Hour/Sekunden
		this._lastDate = now;
	}

	reset() {
		this._sum = 0;
		this._lastDate = new Date();
	}

	get sum() {
		return this._sum;
	}

	setStart(sum, ts) {
		this._sum = sum;
		this._lastDate = new Date(ts);
	}
}


// Get longitude an latidude from system config
async function getSystemData(adapter) {
	const state = await adapter.getForeignObjectAsync('system.config');
	if (state) {
		adapter.config.longitude = state.common.longitude;
		adapter.config.latitude = state.common.latitude;
		adapter.log.info('system longitude ' + adapter.config.longitude + ' latitude ' + adapter.config.latitude);
	}
}


function getAstroDate (adapter,pattern, date, offsetMinutes) {
	if (date === undefined) {
		date = new Date();
	}
	if (typeof date === 'number') {
		date = new Date(date);
	}

	if ((!adapter.latitude  && adapter.latitude  !== 0) ||
		(!adapter.longitude && adapter.longitude !== 0)) {
		adapter.log.warn('Longitude or latitude does not set. Cannot use astro.');
		return;
	}

	// ensure events are calculated independent of current time
	date.setHours(12, 0, 0, 0);
	let ts = suncalc.getTimes(date, adapter.latitude, adapter.longitude)[pattern];

	if (ts === undefined || ts.getTime().toString() === 'NaN') {
		adapter.log.warn(`Cannot calculate astro date "${pattern}" for ${adapter.latitude}, ${adapter.longitude}`);
	}

	adapter.log.debug(`getAstroDate(pattern=${pattern}, date=${date}) => ${ts}`, 'info');

	if (offsetMinutes !== undefined) {
		ts = new Date(ts.getTime() + (offsetMinutes * 60000));
	}
	return ts;
}


module.exports = {
	StateMap,
	RiemannSum,
	getSystemData,
	getAstroDate
};


