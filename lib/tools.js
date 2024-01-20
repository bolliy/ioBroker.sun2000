'use strict';

class ReemanSum {
	constructor (initValue = 0) {
		this._sum = initValue;
		this._lastDate = new Date();
	}

	add (newValue) {
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

	reset () {
		this._sum = 0;
		this._lastDate = new Date();
	}
}


module.exports = {
	ReemanSum
};