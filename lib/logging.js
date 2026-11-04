'use strict';

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

	debug(msgFn) {
		// Only log debug messages if the log level is set to 'debug' or 'silly'
		if (this.adapter.log.level === 'debug' || this.adapter.log.level === 'silly') {
			this.adapter.log.debug(typeof msgFn === 'function' ? msgFn() : msgFn);
		}
	}

	info(msg) {
		if (this._quiet) {
			this.debug(`Info: ${msg}`);
		} else {
			this.adapter.log.info(msg);
		}
	}

	silly(msg) {
		// Only log silly messages if the log level is set to 'silly'
		if (this.adapter.log.level === 'silly') {
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

	/**
	 * Logs a warning when a condition becomes active, repeats it at most every repeatMs
	 * while the condition persists and logs an info message when it is over.
	 *
	 * @param {string} key - unique key of the condition
	 * @param {boolean} active - is the condition currently active?
	 * @param {() => string} msgFn - creates the warning text (only called if a warning is written)
	 * @param {() => string} [okMsgFn] - info text on recovery
	 * @param {number} [repeatMs] - minimum time between two repeated warnings (default: 30 minutes)
	 */
	warnOnChange(key, active, msgFn, okMsgFn, repeatMs = 30 * 60 * 1000) {
		this._warnState ??= {};
		const s = (this._warnState[key] ??= { active: false, last: 0 });
		if (active) {
			const now = Date.now();
			if (!s.active || now - s.last >= repeatMs) {
				this.warn(`${typeof msgFn === 'function' ? msgFn() : msgFn}`);
				s.last = now;
			}
			s.active = true;
		} else if (s.active) {
			s.active = false;
			if (okMsgFn) {
				this.info(`${typeof okMsgFn === 'function' ? okMsgFn() : okMsgFn}`);
			}
			/*else {
				this.adapter.log.info(`W: ${key}: back to normal.`);
			}
            */
		}
	}
}

module.exports = Logging;
