'use strict';
const { deviceType, driverClasses, dataType } = require(`${__dirname}/../types.js`);
class ServiceQueueMap {
	constructor(adapterInstance, inverter) {
		this.adapter = adapterInstance;
		this.log = this.adapter.logger;
		this.inverterInfo = inverter;
		this._modbusClient = null;
		this._serviceMap = new Map();
		this._eventMap = new Map();
		this._initialized = false;
		this._name = 'inverter control';
		this._emmaAvailable = this.adapter.devices.find(d => d.driverClass == driverClasses.emma);

		this.serviceFields = [
			{
				state: { id: 'startup', name: 'startup inverter', type: 'boolean', role: 'switch.enable', desc: 'reg: 40200 , len: 1' },
				type: deviceType.inverter,
				fn: async event => {
					let ret = false;
					if (event.value === true) {
						ret = await this._writeRegisters(40200, [0]);
						event.value = false;
					}
					return ret;
				},
			},
			{
				state: { id: 'shutdown', name: 'shutdown inverter', type: 'boolean', role: 'switch.enable', desc: 'reg: 40201, len: 1' },
				type: deviceType.inverter,
				fn: async event => {
					let ret = false;
					if (event.value === true) {
						ret = await this._writeRegisters(40201, [0]);
						event.value = false;
					}
					return ret;
				},
			},
			{
				state: { id: 'battery.chargeFromGridFunction', name: 'Charge from grid', type: 'boolean', role: 'switch.enable', desc: 'reg: 47087, len: 1' },
				type: deviceType.battery,
				fn: async event => {
					const ret = await this._writeRegisters(47087, event.value === true ? [1] : [0]);
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value === true ? 1 : 0);
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.maximumChargingPower',
					name: 'Maximum charging power',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'reg: 47075, len: 2',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumChargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(47075, dataType.numToArray(event.value, dataType.uint32));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.maximumDischargingPower',
					name: 'Maximum discharge power',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'reg: 47077, len: 2',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumDischargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(47077, dataType.numToArray(event.value, dataType.uint32));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				//@deprecated
				state: {
					id: 'battery.maximumChargePower',
					name: 'MaximumChargePower',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'deprecated use `maximumChargingPower` instead',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumChargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					this.log.warn(`${this._name}: maximumChargePower is deprecated use "maximumChargingPower" instead`);
					return await this._writeRegisters(47075, dataType.numToArray(event.value, dataType.uint32));
				},
			},
			{
				//@deprecated
				state: {
					id: 'battery.maximumDischargePower',
					name: 'MaximumDischargePower',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'deprecated use `maximumDischargingPower` instead',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumDischargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					this.log.warn(`${this._name}: maximumDischargePower is deprecated use "maximumDischargingPower" instead`);
					return await this._writeRegisters(47077, dataType.numToArray(event.value, dataType.uint32));
				},
			},
			{
				state: {
					id: 'battery.chargingCutoffCapacity',
					name: 'Charging cutoff capacity',
					type: 'number',
					unit: '%',
					role: 'level.max',
					desc: 'reg: 47081, len: 1',
				},
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 90) {
						event.value = 90;
					}
					const ret = await this._writeRegisters(47081, dataType.numToArray(event.value * 10, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.dischargeCutoffCapacity',
					name: 'Discharge cutoff capacity',
					type: 'number',
					unit: '%',
					role: 'level.min',
					desc: 'reg: 47082, len: 1',
				},
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 20) {
						event.value = 20;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(47082, dataType.numToArray(event.value * 10, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.gridChargeCutoffSOC',
					name: 'Grid charge cutoff SOC',
					type: 'number',
					unit: '%',
					role: 'level',
					desc: 'reg:47088, len:1',
				},
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 20) {
						event.value = 20;
					}
					const ret = await this._writeRegisters(47088, dataType.numToArray(event.value * 10, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: { id: 'battery.workingModeSettings', name: 'Working mode settings', type: 'number', unit: '', role: 'level', desc: 'reg:47086, len:1' },
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 5) {
						event.value = 2;
					}
					if (event.value < 0) {
						event.value = 2;
					}
					//only if not Emma available
					/*
					const emmaAvailable = this.adapter.devices.find(d => d.driverClass == driverClasses.emma);
					if (emmaAvailable) {
						this.log.warn(`${this._name}: Working mode can not be changed because Emma is available`);
						return false;
					}
					*/
					const ret = await this._writeRegisters(47086, dataType.numToArray(event.value, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.powerOfChargeFromGrid',
					name: 'Power of charge from grid',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'reg: 47242, len: 2',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumChargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					return await this._writeRegisters(47242, dataType.numToArray(event.value, dataType.uint32));
				},
			},
			/*
			{
				state: { id: 'battery.forcedChargingAndDischargingPower', name: 'Forced charging and discharging power', type: 'number', unit: 'W', role: 'level.power', desc: 'reg: 47084, len: 2'},
				type : deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(this.inverterInfo.path+'.battery.maximumChargePower')?.value ?? 2500;
					if (event.value > max) event.value = max;
					if (event.value < -max) event.value = -max;
					return await this._writeRegisters(47084,dataType.numToArray(event.value,dataType.int32));
				}
			},
			*/
			/*
			{
				state: { id: 'battery.maximumPowerOfChargeFromGrid', name: 'Maximum power of charge from grid', type: 'number', unit: 'W', role: 'level.power', desc: 'reg: 47244, len: 2'},
				type : deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(this.inverterInfo.path+'.battery.maximumChargePower')?.value ?? 2500;
					if (event.value > max) event.value = max;
					if (event.value < 0) event.value = 0;
					return await this._writeRegisters(47244,dataType.numToArray(event.value,dataType.uint32));
				}
			},
			*/
			{
				state: {
					id: 'battery.forcibleChargePower',
					name: 'Forcible charge power',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'reg: 47247, len: 2',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumChargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					return await this._writeRegisters(47247, dataType.numToArray(event.value, dataType.uint32));
				},
			},
			{
				state: {
					id: 'battery.forcibleDischargePower',
					name: 'Forcible discharge power',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'reg: 47249, len: 2',
				},
				type: deviceType.battery,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.maximumDischargePower`)?.value ?? 2500;
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					return await this._writeRegisters(47249, dataType.numToArray(event.value, dataType.uint32));
				},
			},
			{
				state: { id: 'battery.targetSOC', name: 'Target SOC', type: 'number', unit: '%', role: 'level', desc: 'reg: 47101 , len: 1' },
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(47101, dataType.numToArray(event.value * 10, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'battery.forcedChargingAndDischargingPeriod',
					name: 'Forced charging and discharging period',
					type: 'number',
					unit: '',
					role: 'level',
					desc: 'reg: 47083, len: 1',
				},
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 1440) {
						event.value = 1440;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					return await this._writeRegisters(47083, dataType.numToArray(event.value, dataType.uint16));
				},
			},
			{
				state: {
					id: 'battery.forcibleChargeOrDischargeSettingMode',
					name: 'Forcible charge/discharge setting mode (0: Duration,1: until SOC)',
					type: 'number',
					unit: '',
					role: 'level',
					desc: 'reg: 47246, len: 1',
				},
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 1) {
						event.value = 1;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					return await this._writeRegisters(47246, dataType.numToArray(event.value, dataType.uint16));
				},
			},
			{
				state: {
					id: 'battery.forcibleChargeOrDischarge',
					name: 'Forcible charge/discharge (0: Stop,1: Charge, 2: Discharge)',
					type: 'number',
					unit: '',
					role: 'level',
					desc: 'reg: 47100, len: 1',
				},
				type: deviceType.battery,
				fn: async event => {
					if (event.value > 2) {
						event.value = 2;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					return await this._writeRegisters(47100, dataType.numToArray(event.value, dataType.uint16));
				},
			},
			{
				state: { id: 'battery.backupPowerSOC', name: 'Backup power SOC', type: 'number', unit: '%', role: 'level', desc: 'reg: 47102, len: 1' },
				type: deviceType.battery,
				fn: async event => {
					const model = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.productModel`)?.value ?? 0;
					if (model === 1) {
						//LG
						if (event.value > 100) {
							event.value = 100;
						}
						if (event.value < 12) {
							event.value = 12;
						}
					} else {
						//LUNA
						if (event.value > 100) {
							event.value = 100;
						}
						if (event.value < 0) {
							event.value = 0;
						}
					}
					const ret = await this._writeRegisters(47102, dataType.numToArray(event.value * 10, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'grid.maximumFeedGridPower',
					name: 'Maximum feed grid power',
					type: 'number',
					unit: 'kW',
					role: 'level.power',
					desc: 'reg: 47416, len: 2',
				},
				type: deviceType.gridPowerControl,
				fn: async event => {
					const max = 100; //100 kW
					if (event.value > max) {
						event.value = max;
					}
					if (event.value < -1) {
						event.value = -1;
					}
					const ret = await this._writeRegisters(47416, dataType.numToArray(event.value * 1000, dataType.uint32));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'grid.maximumFeedGridPower_percent',
					name: 'Maximum feed grid power %',
					type: 'number',
					unit: '%',
					role: 'level',
					desc: 'reg: 47418, len: 1',
				},
				type: deviceType.gridPowerControl,
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(47418, dataType.numToArray(event.value * 10, dataType.int16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'grid.activePowerControlMode',
					name: '(0: Unlimited (default), 1: DIactive scheduling, 5: Zero power grid connection, 6: Power-limited grid connection (kW), 7: Power-limited grid connection (%))',
					type: 'number',
					unit: '',
					role: 'level',
					desc: 'reg:47415, len:1',
				},
				type: deviceType.gridPowerControl,
				fn: async event => {
					if (event.value > 7) {
						event.value = 7;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(47415, dataType.numToArray(event.value, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			//power grid scheduling
			{
				state: {
					id: 'grid.scheduling.activePowerPercentageDerating',
					name: '[power grid scheduling] Active Power percentage derating',
					type: 'number',
					unit: '%',
					role: 'level',
					desc: 'reg:40125, len:1',
				},
				type: deviceType.gridPowerControl,
				fn: async event => {
					if (event.value > 100) {
						event.value = 100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(40125, dataType.numToArray(event.value * 10, dataType.uint16));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
			{
				state: {
					id: 'grid.scheduling.FixedActivePowerDerated',
					name: '[power grid scheduling] Fixed active power derated',
					type: 'number',
					unit: 'W',
					role: 'level.power',
					desc: 'reg:40126, len:2',
				},
				type: deviceType.gridPowerControl,
				fn: async event => {
					const max = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.info.ratedPower`)?.value ?? 0;
					//+10%
					if (event.value > max * 1100) {
						event.value = max * 1100;
					}
					if (event.value < 0) {
						event.value = 0;
					}
					const ret = await this._writeRegisters(40126, dataType.numToArray(event.value, dataType.uint32));
					if (ret) {
						this.inverterInfo.instance.stateCache.set(`${this.inverterInfo.path}.${event.id}`, event.value, { type: 'number' });
					}
					return ret;
				},
			},
		];
	}

	async _init() {
		const emmaAvailable = this.adapter.devices.find(d => d.driverClass == driverClasses.emma);

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
				//await this._initState(this.inverterInfo.path+'.control.',entry.state);
				const path = `${this.inverterInfo.path}.control.`;
				await this._initState(path, entry.state, entry.state.id === 'battery.chargeFromGridFunction' && emmaAvailable ? false : true);
				const state = await this.adapter.getState(path + entry.state.id);
				if (state && state.ack === false) {
					this.set(entry.state.id, state);
				}
			}
			
			//upgrade
			const tSOC = await this.adapter.getState(`${this.inverterInfo.path}.control.battery.targetSOC `);
			if (tSOC) {
				await this.adapter.delObject(`${this.inverterInfo.path}.control.battery.targetSOC `, { recursive: false });
				if (tSOC.val !== null) {
					await this.adapter.setState(`${this.inverterInfo.path}.control.battery.targetSOC`, { val: tSOC.val, ack: tSOC.ack });
					if (tSOC.ack === false) {
						this.set('battery.targetSOC', tSOC);
					}
				}
			}

			this.adapter.subscribeStates(`${this.inverterInfo.path}.control*`);
			this._initialized = true;

			if (this.adapter.settings?.cb.tou && this.inverterInfo.instance.numberBatteryUnits() > 0) {
				const workingMode = await this._readHoldingRegisters(47086, 1);
				//const tou = await this._readHoldingRegisters(47255,43); //first periode
				if (workingMode && workingMode[0] !== 5) {
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
					if (await this._writeRegisters(47255, tCDP)) {
						this.log.info(`${this._name}: The default TOU setting are transferred to the inverter.`);
					}
				}
			}
		}

		if (this._initialized) {
			this.log.info(`${this._name}: Service queue initialized`);
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
			if (state.val !== null && !state.ack) {
				this.log.info(`${this._name}: Event - state: ${this.inverterInfo.path}.control.${id} changed: ${state.val} ack: ${state.ack}`);
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
		//if (!this.inverterInfo.instance.modbusAllowed) return;
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
					if (service.type == deviceType.battery) {
						if (this.inverterInfo.instance.numberBatteryUnits() === 0) {
							this.log.warn(`${this._name}: Event is discarded because no battery has been detected. `);
							if (!this.adapter.isReady) {
								this.log.warn(
									`${this._name}: The Adapter is not ready! Please check the value in the state sun2000.x.info.JSONhealth and the Log output.`,
								);
							}
							this._eventMap.delete(event.id); //forget the event
							continue;
						}
						const BatStatus = this.inverterInfo.instance.stateCache.get(`${this.inverterInfo.path}.battery.runningStatus`)?.value ?? -1;
						if (BatStatus !== 2 && BatStatus !== 1 && BatStatus !== -1) {
							this.log.warn(
								`${this._name}: Event is discarded because battery is not running. State: ${this.inverterInfo.path}.battery.runningStatus = ${BatStatus}. `,
							);
							this._eventMap.delete(event.id); //forget the event
							continue;
						}
					}
					if (service.state.type === 'number') {
						if (!this.isNumber(event)) {
							this.log.warn(
								`${this._name}: Event is discarded because the value ${event.value} is not a number. State: ${this.inverterInfo.path}.control.${event.id}`,
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
							await this.adapter.setState(`${this.inverterInfo.path}.control.${event.id}`, { val: event.value, ack: true });
							this._eventMap.delete(event.id);
							this.log.info(`${this._name}: write state ${this.inverterInfo.path}.control.${event.id} : ${event.value} ack: true`);
						} catch {
							this.log.warn(`${this._name}: Can not write state ${this.inverterInfo.path}.control.${event.id}`);
						}
					} else {
						service.errorCount++;
						if (service.errorCount > 1) {
							this._eventMap.delete(event.id); //forget it
							this.log.info(`${this._name}: Event is discarded because it could not be processed. ${this.inverterInfo.path}.control.${event.id}`);
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
			this.inverterInfo.instance.addHoldingRegisters(address, data);
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
	async _initState(path, state, writePermission = true) {
		await this.adapter.extendObject(path + state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: writePermission,
			},
			native: {},
		});
	}
}

module.exports = ServiceQueueMap;
