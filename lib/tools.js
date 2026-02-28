'use strict';

const suncalc = require('suncalc2');
//const {storeType} = require(__dirname + '/types.js');

class Logging {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		this._quiet = false;
	}

	get quiet() {
		return this._quiet;
	}

	beQuiet(quiet) {
		this._quiet = quiet;
	}

	debug(msg) {
		this.adapter.log.debug(msg);
	}

	info(msg) {
		if (this._quiet) {
			this.debug(`Info: ${msg}`);
		} else {
			this.adapter.log.info(msg);
		}
	}

	silly(msg) {
		if (this._quiet) {
			this.debug(`Warn: ${msg}`);
		} else {
			this.adapter.log.silly(msg);
		}
	}

	warn(msg) {
		if (this._quiet) {
			this.debug(`Warn: ${msg}`);
		} else {
			this.adapter.log.warn(msg);
		}
	}

	error(msg) {
		if (this._quiet) {
			this.debug(`Error: ${msg}`);
		} else {
			this.adapter.log.error(msg);
		}
	}
}

class StateMap {
	constructor() {
		this.stateMap = new Map();
	}

	round(num, decimalPlaces = 0) {
		var p = Math.pow(10, decimalPlaces);
		var n = num * p * (1 + Number.EPSILON);
		return Math.round(n) / p;
	}

	get(id) {
		return this.stateMap.get(id);
	}

	set(id, value, options) {
		if (options?.type == 'number' && isNaN(value)) {
			return;
		}
		if (value !== null) {
			if (options?.type == 'number') {
				//value = Math.round((value + Number.EPSILON) * 1000) / 1000; //3rd behind
				value = this.round(value, 3);
			}

			const existing = this.get(id); //existing entry

			const mapOptions = {
				id: id,
				value: value,
				stored: existing?.stored ? existing.stored : false,
			};
			if (options?.renew || existing?.value !== value) {
				mapOptions.stored = false;
			}
			if (options?.stored) {
				mapOptions.stored = options.stored;
			}

			this.stateMap.set(id, mapOptions);
		}
	}

	values() {
		return this.stateMap.values();
	}
}

class RegisterMap {
	constructor() {
		this._map = new Map();
		this._mapDefaults = new Map();
		//only for inverter
		this._defaults = [
			{
				reg: 37000, //battery.unit.1.runningStatus
				value: 0,
				len: 1,
			},
			{
				reg: 37741, //battery.unit.2.runningStatus
				value: 0,
				len: 1,
			},
			{
				reg: 37760, //SOC
				value: 0,
				len: 1,
			},
			{
				reg: 37765, //Battery Charge And Discharge Power
				value: 0,
				len: 2,
			},
		];

		for (const item of this._defaults) {
			for (let i = 0; i < item.len; i++) {
				this._mapDefaults.set(item.reg, item.value);
			}
		}
	}

	get(startAddr, length, useDefaults = false) {
		const values = [];
		for (let i = 0; i < length; i++) {
			values[i] = this._map.get(startAddr + i);
			if (useDefaults && values[i] == null) {
				values[i] = this._mapDefaults.get(startAddr + i);
			}
		}
		return values;
	}

	set(startAddr, values) {
		for (let i = 0; i < values?.length; i++) {
			const value = values[i];
			this._map.set(startAddr + i, value);
		}
	}

	values() {
		return this._map.values();
	}
}

class RiemannSum {
	constructor(autoResetAtMitnight = true) {
		this._resetAtMitnight = autoResetAtMitnight;
		this.reset();
	}

	get lastDate() {
		return this._lastDate ? this._lastDate : new Date();
	}

	/**
	 * Adds the new value to calculate the Riemann sum.
	 *
	 * This function calculates the Riemann sum by adding the new value multiplied by the time elapsed since the last value,
	 * updating the total sum. If the auto reset at midnight is enabled, it resets the sum at midnight.
	 *
	 * @param {number} newValue - The new value to be added for Riemann sum calculation.
	 */
	add(newValue) {
		//Obersumme bilden
		const now = new Date();
		if (this._resetAtMitnight) {
			const lastnight = new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(), // today, ...
				0,
				0,
				0, // ...at 00:00:00 hours
			);
			if (this.lastDate?.getTime() < lastnight.getTime()) {
				this.reset();
			}
		}
		if (!isNaN(newValue)) {
			this._sum += (newValue * (now.getTime() - this.lastDate.getTime())) / 3600000; //Hour/Sekunden
			this._lastDate = now;
		}
	}

	reset() {
		this._sum = 0;
		this._lastDate = new Date();
	}

	get sum() {
		return this._sum;
	}

	setStart(sum, ts) {
		if (!isNaN(sum)) {
			this._sum = sum;
			this._lastDate = new Date(ts);
		} else {
			this.reset();
		}
	}
}

//https://stackoverflow.com/questions/38802959/how-to-lock-on-object-which-shared-by-multiple-async-method-in-nodejs
const createAsyncLock = () => {
	const queue = [];
	let active = false;
	return fn => {
		let deferredResolve;
		let deferredReject;
		const deferred = new Promise((resolve, reject) => {
			deferredResolve = resolve;
			deferredReject = reject;
		});
		const exec = async () => {
			await fn().then(deferredResolve, deferredReject);
			if (queue.length > 0) {
				queue.shift()();
			} else {
				active = false;
			}
		};
		if (active) {
			queue.push(exec);
		} else {
			active = true;
			exec();
		}
		return deferred;
	};
};

/**
 * Warten auf einen Wert, der von einer Funktion zurückgegeben wird.
 * Der Wert wird alle 100ms geprüft. Wenn der Wert innerhalb der angegebenen Zeit nicht gesetzt wurde, wird ein Timeout-Fehler zurückgegeben.
 * @param {Function} func - Die Funktion, die den Wert zurückgibt.
 * @param {number} [timeout] - Die maximale Wartezeit in ms.
 * @returns {Promise} - Ein Promise, das den Wert zurückgibt oder einen Timeout-Fehler wirft.
 */
const waitForValue = (func, timeout = 5000) => {
	return new Promise((resolve, reject) => {
		const timer = setInterval(() => {
			const variable = func();
			if (variable !== undefined && variable !== null) {
				clearInterval(timer);
				resolve(variable);
			}
			timeout -= 100;
			if (timeout <= 0) {
				clearInterval(timer);
				reject('Timeout: Wert wurde nicht rechtzeitig gesetzt.');
			}
		}, 100); // alle 100ms prüfen
	});
};

// Get longitude an latidude from system config
async function getSystemData(adapter) {
	const state = await adapter.getForeignObjectAsync('system.config');
	if (state) {
		adapter.config.longitude = state.common.longitude;
		adapter.config.latitude = state.common.latitude;
		adapter.log.info(`system longitude ${adapter.config.longitude} latitude ${adapter.config.latitude}`);
	}
}

function getAstroDate(adapter, pattern, date, offsetMinutes) {
	if (date === undefined) {
		date = new Date();
	}
	if (typeof date === 'number') {
		date = new Date(date);
	}

	if ((!adapter.latitude && adapter.latitude !== 0) || (!adapter.longitude && adapter.longitude !== 0)) {
		adapter.logger.warn('Longitude or latitude does not set. Cannot use astro.');
		return;
	}

	// ensure events are calculated independent of current time
	date.setHours(12, 0, 0, 0);
	let ts = suncalc.getTimes(date, adapter.latitude, adapter.longitude)[pattern];

	if (ts === undefined || ts.getTime().toString() === 'NaN') {
		adapter.logger.warn(`Cannot calculate astro date "${pattern}" for ${adapter.latitude}, ${adapter.longitude}`);
	}

	adapter.logger.debug(`getAstroDate(pattern=${pattern}, date=${date}) => ${ts}`, 'info');

	if (offsetMinutes !== undefined) {
		ts = new Date(ts.getTime() + offsetMinutes * 60000);
	}
	return ts;
}

function isSunshine(adapter) {
	if (adapter.settings.sunrise && adapter.settings.sunset) {
		const now = new Date();
		/*
		const sunrise = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(), // today, ...
			14, 18, 0 // ...at 00:00:00 hours
		);

		const sunset = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(), // today, ...
			14, 16, 0  // ...at 00:00:00 hours
		);

		return (now.getTime() > sunrise.getTime() || now.getTime() < sunset.getTime());
		*/

		return now.getTime() > adapter.settings.sunrise.getTime() && now.getTime() < adapter.settings.sunset.getTime();
	}
	return true;
}

//contains a value in array
function contains(r, val) {
	const len = r.length;
	let i = 0;

	for (; i < len; i++) {
		if (r[i] === val) {
			return i;
		}
	}
	return -1;
}

async function existsState(adapter, id, callback) {
	if (typeof callback === 'function') {
		adapter.getObject(id, (err, obj) => callback(err, obj && obj.type === 'state'));
	} else {
		const obj = await adapter.getObjectAsync(id);
		if (obj) {
			return obj.type === 'state';
		}
	}
}

async function deleteState(adapter, id, callback) {
	if (typeof callback === 'function') {
		adapter.delObject(id, { recursive: false }, callback);
	} else {
		return await adapter.delObjectAsync(id, { recursive: false });
	}
}

module.exports = {
	Logging,
	StateMap,
	RegisterMap,
	RiemannSum,
	createAsyncLock,
	waitForValue,
	getSystemData,
	getAstroDate,
	isSunshine,
	contains,
	existsState,
	deleteState,
};
