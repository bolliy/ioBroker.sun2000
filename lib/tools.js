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

class RegisterMap  {
	constructor () {
		this._map = new Map();
		this._mapDefaults = new Map();

		this._defaults = [
			{ 	reg: 37000, //battery.unit.1.runningStatus
				value : 0,
				len: 1
			},
			{ 	reg: 37741, //battery.unit.2.runningStatus
				value : 0,
				len: 1
			},
			{ 	reg: 37760, //SOC
				value : 0,
				len: 0
			},
			{ 	reg: 37765, //Battery Charge And Discharge Power
				value : 0,
				len: 2
			}
		];

		for (const item of this._defaults) {
			for (let i=0; i < item.len; i++) {
				this._mapDefaults.set(item.reg, item.value);
			}
		}
	}

	get(startAddr, length, useDefaults = false) {
		const values = [];
		for (let i = 0; i < length; i++) {
			values[i] = this._map.get(startAddr+i);
			if (useDefaults && values[i] == null) values[i] = this._mapDefaults.get(startAddr+i);
		}
		return values;
	}

	set(startAddr, values) {
		for (let i = 0; i < values.length; i++ ) {
			const value = values[i];
			this._map.set(startAddr+i, value);
		}
	}

	values () {
		return this._map.values();
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
	RegisterMap,
	RiemannSum,
	getSystemData,
	getAstroDate
};


