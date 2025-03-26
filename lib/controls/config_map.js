'use strict';
const { deviceType } = require(`${__dirname}/../types.js`);
class ConfigMap {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		this.log = this.adapter.logger;
		this._serviceMap = new Map();
		this._eventMap = new Map();
		this._initialized = false;
		this._path = 'config.';

		this.serviceFields = [
			{
				state: { id: 'surplus.SocLimit', name: 'Charge from grid', type: 'number', role: 'level', desc: 'usableSurplusPower' },
				type: deviceType.gridPowerControl,
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					/*
					const ret = await this._writeRegisters(47087, event.value === true ? [1] : [0]);
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value === true ? 1 : 0);
					}
					*/
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
			await this._initState(this._path, entry.state);
			const state = await this.adapter.getState(this._path + entry.state.id);
			if (state) {
				this.set(entry.state.id, state);
			}
		}

		this._initialized = true;

		if (this._initialized) {
			this.log.info('Control: Config queue initialized');
		}
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
				this.log.info(`Control: Event - state: ${id} changed: ${state.val} ack: ${state.ack}`);
				const event = this._eventMap.get(id);
				if (event) {
					event.value = state.val;
					event.ack = state.ack;
				} else {
					this._eventMap.set(id, { id: id, value: state.val, ack: state.ack });
				}
				if (!event.ack) {
					this._process(event);
				}
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

	async _process(event) {
		await this.adapter.setState(`${this._path}.${event.id}`, { val: event.value, ack: true });
		event.ack = true;
	}
}

module.exports = ConfigMap;
