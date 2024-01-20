'use strict';

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
			if (options?.renew || this.get(id)?.value !== value) {
				if (options?.type == 'number') {
					value = Math.round((value + Number.EPSILON) * 1000) / 1000; //3rd behind
				}
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
	constructor (initValue = 0) {
		this._sum = initValue;
		this._lastDate = new Date();
	}

	add (newValue) {
		//Obersumme
		const now = new Date();
		const night = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(), // today, ...
			0, 0, 0 // ...at 00:00:00 hours
		);
		if (this._lastDate.getTime() <= night.getTime()) {
			this.reset();
		}
		this._sum += newValue * (now.getTime() - this._lastDate.getTime())/3600/1000; //Hour/Sekunden
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


module.exports = {
	StateMap,
	RiemannSum
};