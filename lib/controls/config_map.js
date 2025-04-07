'use strict';
//const { deviceType } = require(`${__dirname}/../types.js`);
class ConfigMap {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		this.log = this.adapter.logger;
		this._serviceMap = new Map();
		this._eventMap = new Map();
		this._initialized = false;
		this._path = 'control';

		this.serviceFields = [
			{
				state: {
					id: 'usableSurplus.minSoc',
					name: 'minmum SoC',
					type: 'number',
					unit: '%',
					role: 'level',
					desc: 'Use of battery charging power above the specified SoC value (%)',
				},
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					event.value = Math.round(event.value);
					return true;
				},
			},
			{
				state: {
					id: 'usableSurplus.bufferSoc',
					name: 'buffer SoC',
					type: 'number',
					unit: '%',
					role: 'level',
					desc: 'battery is used as a buffer above Soc (%) value',
				},
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					event.value = Math.round(event.value);
					return true;
				},
			},
			{
				state: {
					id: 'usableSurplus.bufferPower',
					name: 'Discharge power from buffer',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'battery is used as a buffer with power',
				},
				fn: async event => {
					if (event.value > 5000) {
						event.value = 5000;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					event.value = Math.round(event.value);
					return true;
				},
			},
			{
				state: {
					id: 'usableSurplus.residualPower',
					name: 'residual Power',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'Sets the target operating point of the surplus regulation',
				},
				fn: async event => {
					if (event.value > 1000) {
						event.value = 1000;
					}
					if (event.value < -1000) {
						event.value = -1000;
					}
					event.value = Math.round(event.value);
					return true;
				},
			},
			{
				state: {
					id: 'usableSurplus.allowNegativeValue',
					name: 'allow negative value',
					type: 'boolean',
					role: 'switch.enable',
					desc: 'Allows negative value for usableSurplusPower',
				},
				fn: async event => {
					if (event.value !== true && event.value !== false) {
						event.value = false;
					}
					return true;
				},
			},
			{
				state: {
					id: 'externalPower',
					name: 'external power',
					type: 'number',
					role: 'level.power',
					unit: 'kW',
					desc: 'external energy production',
				},
				fn: async event => {
					if (event.value < 0) event.values = 0;
					event.value = Math.round(event.value * 1000) / 1000;
					return true;
				},
			},
		];
	}

	async init() {
		for (const item of this.serviceFields) {
			if (item?.state) {
				this._serviceMap.set(item.state.id, item);
			}
		}
		//read value
		for (const entry of this._serviceMap.values()) {
			await this._initState(`${this._path}.`, entry.state);
			const state = await this.adapter.getState(`${this._path}.${entry.state.id}`);

			if (state) {
				this.set(entry.state.id, state);
			}
		}
		this.adapter.subscribeStates(`${this._path}.*`);
		this._initialized = true;
	}

	/**
	 * @description Check if the value of the event is a number and optionally round it to the nearest integer.
	 * @param {object} event The event object
	 * @param {boolean} [round] If true, the value is rounded to the nearest integer
	 * @returns {boolean} True if the value is a number, false otherwise
	 */
	isNumber(event, round = true) {
		if (isNaN(event.value)) {
			return false;
		}
		if (round) event.value = Math.round(event.value);
		return true;
	}

	get(id) {
		return this._eventMap.get(id);
	}

	set(id, state) {
		const service = this._serviceMap.get(id);
		if (state && service) {
			if (state.val !== null) {
				if (!state.ack) this.log.info(`Control: Event - state: ${this._path}.${id} changed: ${state.val} ack: ${state.ack}`);
				const event = this._eventMap.get(id);
				if (event) {
					event.value = state.val;
					event.ack = state.ack;
				} else {
					this._eventMap.set(id, { id: id, value: state.val, ack: state.ack });
				}
				this._process(id);
			}
		}
	}

	//state
	async _initState(path, state) {
		await this.adapter.extendObject(path + state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: true,
			},
			native: {},
		});
	}

	async _process(id) {
		const event = this.get(id);
		const service = this._serviceMap.get(event.id);
		if (event.value !== null && service.fn) {
			if (service.state.type === 'number') {
				if (!this.isNumber(event, false)) {
					this.log.warn(`Control: Event is discarded because the value ${event.value} is not a number. State: ${this._path}.${event.id}`);
					return;
				}
			}
			if (await service.fn(event)) {
				await this.adapter.setState(`${this._path}.${event.id}`, { val: event.value, ack: true });
				event.ack = true;
			}
		}
	}
}

module.exports = ConfigMap;
