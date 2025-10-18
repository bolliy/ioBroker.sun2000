'use strict';
const { deviceType, dataType } = require(`${__dirname}/../types.js`);
class ServiceQueueMap {
	constructor(adapterInstance, emma) {
		this.adapter = adapterInstance;
		this.log = this.adapter.logger;
		this.inverterInfo = emma;
		this._modbusClient = null;
		this._serviceMap = new Map();
		this._eventMap = new Map();
		this._initialized = false;
		this._name = 'emma control';

		this.serviceFields = [
			{
				state: { id: 'battery.ESSControlMode', name: 'ESS control mode', type: 'number', unit: '', role: 'level', desc: 'reg:40000, len:1' },
				type: deviceType.battery,
				fn: async event => {
					let ret = false;
					if (event.value > 6) {
						event.value = 2;
					}
					if (event.value < 2 || event.value === 3) {
						event.value = 2;
					}
					if (this.isTestMode()) {
						this.log.info(`${this._name}: the test mode is active, so the ESS control mode is always written to register 47086`);
						ret = await this._writeRegisters(47086, dataType.numToArray(event.value, dataType.uint16));
					} else {
						ret = await this._writeRegisters(40000, dataType.numToArray(event.value, dataType.uint16));
						/*
						if (ret) {
							this.inverterInfo.instance.stateCache.set(`emma.${event.id}`, event.value, { type: 'number' });
						}
						*/
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.tou.preferredUseOfSurplusPvPower',
					name: '[Time of Use mode] Preferred use of surplus PV power',
					type: 'boolean',
					unit: '',
					role: 'switch.enable',
					desc: 'reg: 40001, len: 1',
				},
				type: deviceType.battery,
				fn: async event => {
					let ret = false;

					if (this.isTestMode()) {
						this.log.info(`${this._name}: the test mode is active, so the maximum power for charging batteries from grid not transferred`);
						ret = true;
					} else {
						ret = await this._writeRegisters(40001, event.value === true ? [1] : [0]);
					}
					/*
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`emma.${event.id}`, event.value);
					}
					*/
					return ret;
				},
			},
			{
				state: {
					id: 'battery.tou.maximumPowerForChargingFromGrid',
					name: '[Time of Use mode] Maximum power for charging batteries from grid',
					type: 'number',
					unit: 'kW',
					role: 'level.power',
					desc: 'reg: 40002, len: 2',
				},
				type: deviceType.battery,
				fn: async event => {
					let ret = false;
					if (event.value > 50) {
						event.value = 50;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					if (this.isTestMode()) {
						this.log.info(`${this._name}: the test mode is active, so the maximum power for charging batteries from grid not transferred`);
						ret = true;
					} else {
						ret = await this._writeRegisters(40002, dataType.numToArray(event.value * 1000, dataType.uint32));
					}
					/*
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`emma.${event.id}`, event.value, { type: 'number' });
					}
					*/
					return ret;
				},
			},
		];
	}

	async _init() {
		if (this.inverterInfo.instance) {
			for (const item of this.serviceFields) {
				//no battery - no controls
				//if (item.type == deviceType.battery && this.inverterInfo.instance.numberBatteryUnits() === 0) continue;
				if (item.type == deviceType.meter && !this.inverterInfo?.meter) {
					continue;
				}
				if (item.type == deviceType.gridPowerControl && !this.inverterInfo?.meter) {
					continue;
				}
				if (item?.state) {
					this._serviceMap.set(item.state.id, item);
				}
			}

			for (const entry of this._serviceMap.values()) {
				//await this._initState('emma.control.',entry.state);
				const path = `emma.control.`;
				await this._initState(path, entry.state);
				const state = await this.adapter.getState(path + entry.state.id);
				if (state && state.ack === false) {
					this.set(entry.state.id, state);
				}
			}
			//subscribe all control states
			this.adapter.subscribeStates(`emma.control*`);
			this._initialized = true;

			if (this.adapter.settings?.cb.tou && !this.isTestMode()) {
				const essControlMode = await this._readHoldingRegisters(40000, 1);
				//const tou = await this._readHoldingRegisters(40004,43); //first periode
				if (essControlMode && essControlMode[0] !== 5) {
					/*
					127 - Working mode settings
					2 : Maximise self consumptions (default)
					5 : Time Of Use(Luna) - hilfreich bei dynamischem Stromtarif (z.B Tibber)

					Time of Using charging and discharging periodes (siehe Table 5-6)
					tCDP[3] = 127 - Working mode settings - load from grid (charge)
					tCDP[3] = 383 - Working mode settings - self-consumption (discharge)
					*/
					const tCDP = [
						1, 0, 1440, 127, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					];
					if (await this._writeRegisters(40004, tCDP)) {
						this.inverterInfo.instance.addHoldingRegisters((40004, tCDP));
						this.log.info(`${this._name}: The default TOU setting are transferred`);
					}
				}
			}
		}

		if (this._initialized) {
			this.log.info(`${this._name}: service queue initialized`);
		}
	}

	isTestMode() {
		return this._modbusClient?.id === 1;
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
			if (state.val !== null && !state.ack) {
				this.log.info(`${this._name}: Event - state: emma.control.${id} changed: ${state.val} ack: ${state.ack}`);
				const event = this._eventMap.get(id);
				if (event) {
					event.value = state.val;
					event.ack = false;
				} else {
					this._eventMap.set(id, { id: id, value: state.val, ack: false });
				}
			}
		}
	}

	/**
	 * Processes pending events in the service queue and attempts to execute their associated functions.
	 *
	 * @async
	 * @param {object} modbusClient - The modbus client instance used for communication.
	 *
	 * @description This function iterates over the events in the service queue, checking whether each event
	 * can be processed. It verifies conditions such as battery presence and running status, and checks if the
	 * event value is a number when required. If the event is successfully processed, it acknowledges the event
	 * by setting its state in the adapter and removes it from the event map. If the event cannot be processed
	 * after multiple attempts, it is discarded. The function initializes the service queue if it is not already
	 * initialized and the adapter is connected.
	 */

	async process(modbusClient) {
		this._modbusClient = modbusClient;

		if (this._initialized) {
			let count = 0;
			for (const event of this._eventMap.values()) {
				if (event.ack) {
					continue;
				} //allready done
				const service = this._serviceMap.get(event.id);
				if (!service.errorCount) {
					service.errorCount = 0;
				}
				if (event.value !== null && service.fn) {
					//check if battery is present and running
					if (service.state.type === 'number') {
						if (!this.isNumber(event)) {
							this.log.warn(
								`${this._name}: Event is discarded because the value ${event.value} is not a number. State: emma.control.${event.id}`,
							);
							this._eventMap.delete(event.id); //forget the event
							continue;
						}
					}
					count++;
					if (await service.fn(event)) {
						service.errorCount = 0;
						try {
							event.ack = true;
							await this.adapter.setState(`emma.control.${event.id}`, { val: event.value, ack: true });
							this._eventMap.delete(event.id);
							this.log.info(`${this._name}: write state emma.control.${event.id} : ${event.value} ack: true`);
						} catch {
							this.log.warn(`${this._name}: Can not write state emma.control.${event.id}`);
						}
					} else {
						service.errorCount++;
						if (service.errorCount > 1) {
							this._eventMap.delete(event.id); //forget it
							this.log.info(`${this._name}: Event is discarded because it could not be processed. State: emma.control.${event.id}`);
						}
					}
				}
				if (count > 1) {
					break;
				} //max 2 Events
			}
		}
		if (!this._initialized && this.adapter.isConnected) {
			await this._init();
		}
	}

	async _writeRegisters(address, data) {
		try {
			this.log.debug(`Try to write data to id/address/length ${this._modbusClient.id}/${address}/${data.length}`);
			await this._modbusClient.writeRegisters(address, data);
			this.inverterInfo.instance.addHoldingRegisters(address, data); //write also to the modbus read cache
			return true;
		} catch (err) {
			this.log.warn(
				`Error while writing to ${this._modbusClient.ipAddress} [Reg: ${address}, Len: ${data.length}, modbusID: ${this._modbusClient.id}] with: ${err.message}`,
			);
		}
	}

	async _readHoldingRegisters(address, length) {
		try {
			this.log.debug(`Try to read data to id/address/length ${this._modbusClient.id}/${address}/${length}`);
			const data = await this._modbusClient.readHoldingRegisters(address, length);
			return data;
		} catch (err) {
			this.log.warn(
				`Error while reading from ${this._modbusClient.ipAddress} [Reg: ${address}, Len: ${length}, modbusID: ${this._modbusClient.id}] with: ${err.message}`,
			);
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
}

module.exports = ServiceQueueMap;
