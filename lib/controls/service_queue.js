'use strict';
const {deviceType,dataType} = require(__dirname + '/../types.js');
class ServiceQueueMap  {
	constructor (adapterInstance,inverter) {
		this.adapter = adapterInstance;
		this.log = this.adapter.logger;
		this.inverterInfo = inverter;
		this._modbusClient = undefined;
		this._serviceMap = new Map();
		this._eventMap = new Map();
		this._initialized = false;

		this.serviceFields = [
			{
				state: {id: 'battery.chargeFromGridFunction', name: 'Charge from Grid', type: 'boolean', role: 'value', desc: 'reg: 47087, len: 1'},
				type : deviceType.battery,
				fn: async event => {
					const ret = await this._writeRegisters(47087,event.value === true ? [1]: [0]);
					if (ret) this.inverterInfo.instance.stateCache.set(this.inverterInfo.path+'.'+event.id, event.value === true ? 1: 0);
					return ret;
				}
			},
			{
				state: { id: 'battery.maximumChargePower', name: 'MaximumChargePower', type: 'number', unit: 'W', role: 'value.power', desc: 'reg: 47075, len: 2'},
				type : deviceType.battery,
				fn: async event => {
					if (event.value > 5000) event.value = 5000;
					if (event.value < 0) event.value = 0;
					return await this._writeRegisters(47075,dataType.numToArray(event.value,dataType.uint32));
				}
			},
			{
				state: { id: 'battery.maximumDischargePower', name: 'MaximumDischargePower', type: 'number', unit: 'W', role: 'value.power', desc: 'reg: 47077, len: 2'},
				type : deviceType.battery,
				fn: async event => {
					if (event.value > 5000) event.value = 5000;
					if (event.value < 0) event.value = 0;
					return await this._writeRegisters(47077,dataType.numToArray(event.value,dataType.uint32));
				}
			},
			{
				state: {id: 'battery.chargingCutoffCapacity', name: 'Charging Cutoff Capacity', type: 'number', unit: '%', role: 'value', desc: 'reg: 7081, len: 1'},
				type : deviceType.battery,
				fn: async (event) => {
					if (event.value > 100) event.value = 100;
					if (event.value < 90) event.value = 90;
					const ret = await this._writeRegisters(47081,dataType.numToArray(event.value*10,dataType.uint16));
					if (ret) this.inverterInfo.instance.stateCache.set(this.inverterInfo.path+'.'+event.id, event.value);
					return ret;

				}
			},
			{
				state: {id: 'battery.dischargeCutoffCapacity', name: 'Discharge Cutoff Capacity', type: 'number', unit: '%', role: 'value', desc: 'reg: 47082, len: 1'},
				type : deviceType.battery,
				fn: async event => {
					if (event.value > 20) event.value = 20;
					if (event.value < 0) event.value = 0;
					const ret = await this._writeRegisters(47082,dataType.numToArray(event.value*10,dataType.uint16));
					if (ret) this.inverterInfo.instance.stateCache.set(this.inverterInfo.path+'.'+event.id, event.value);
					return ret;
				}
			},
			{
				state: {id: 'battery.gridChargeCutoffSOC', name: 'Grid Charge Cutoff SOC', type: 'number', unit: '%', role: 'value', desc: 'reg:47088, len:1'},
				type : deviceType.battery,
				fn: async event => {
					if (event.value > 100) event.value = 100;
					if (event.value < 20) event.value = 20;
					const ret = await this._writeRegisters(47088,dataType.numToArray(event.value*10,dataType.uint16));
					if (ret) this.inverterInfo.instance.stateCache.set(this.inverterInfo.path+'.'+event.id, event.value);
					return ret;
				}
			},
			{
				state: {id: 'battery.workingModeSettings', name: 'Working Mode Settings', type: 'number', unit: '', role: 'value', desc: 'reg:47086, len:1'},
				type : deviceType.battery,
				fn: async event => {
					if (event.value > 5) event.value = 2;
					if (event.value < 0) event.value = 2;
					const ret = await this._writeRegisters(47086,dataType.numToArray(event.value,dataType.uint16));
					if (ret) this.inverterInfo.instance.stateCache.set(this.inverterInfo.path+'.'+event.id, event.value);
					return ret;
				}
			},
			{
				state: { id: 'battery.powerOfChargeFromGrid', name: 'power Of charge from grid', type: 'number', unit: 'W', role: 'value.power', desc: 'reg: 47242, len: 2'},
				type : deviceType.battery,
				fn: async event => {
					if (event.value > 5000) event.value = 5000;
					if (event.value < 0) event.value = 0;
					return await this._writeRegisters(47242,dataType.numToArray(event.value,dataType.uint32));
				}
			}
		];

	}

	async _init() {
		if (this.inverterInfo.instance) {
			for (const item of this.serviceFields) {
				//no battery - no controls
				if (item.type == deviceType.battery && this.inverterInfo?.numberBatteryUnits == 0) continue;

				if (item?.state) {
					//this._map.set(item.state.id, { field : item , value : null, ack : false });
					this._serviceMap.set(item.state.id, item);
				}
			}
			for (const entry of this._serviceMap.values()) {
				await this._initState(this.inverterInfo.path+'.control.',entry.state);
				const state = await this.adapter.getStateAsync(this.inverterInfo.path+'.control.'+entry.state.id);
				if (state && state.ack === false) {
					this.set(entry.state.id,state);
				}
			}
			this.adapter.subscribeStates(this.inverterInfo.path+'.control*');
			this._initialized = true;

			if (this.adapter.settings?.cb.tou && this.inverterInfo?.numberBatteryUnits > 0) {
				const workingMode = await this._readHoldingRegisters(47086,1);
				//const tou = await this._readHoldingRegisters(47255,43); //first periode
				if (workingMode &&  workingMode[0] !== 5 ) {
					/*
					127 - Working mode settings
					2 : Maximise self consumptions (default)
					5 : Time Of Use(Luna) - hilfreich bei dynamischem Stromtarif (z.B Tibber)

					Time of Using charging and discharging periodes (siehe Table 5-6)
					tCDP[3] = 127 - Working mode settings - load from grid (charge)
					tCDP[3] = 383 - Working mode settings - self-consumption (discharge)
					*/
					const tCDP = [1,0,1440,127,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
					if (await this._writeRegisters(47255,tCDP)) this.adapter.logger.info('Control: The default TOU settings are stored.');
				}
			}
		}
	}

	get(id) {
		return this._eventMap.get(id);
	}

	set(id, state) {
		const service = this._serviceMap.get(id);
		if (state && service) {
			if (state.val !== null && !state.ack) {
				this.log.info(`Control: Event - state: ${id} changed: ${state.val} ack: ${state.ack}`);
				const event = this._eventMap.get(id);
				if (event) {
					event.value = state.val;
					event.ack = false;
				} else {
					this._eventMap.set(id, {id: id, value: state.val, ack: false });
				}
			}
		}
	}

	values () {
		return this._map.values();
	}

	async process(modbusClient) {
		if (!this.inverterInfo.instance.modbusAllowed) return;
		this._modbusClient = modbusClient;

		if (this._initialized) {
			let count = 0;
			for (const event of this._eventMap.values()) {
				if (event.ack) continue; //allready done
				const service = this._serviceMap.get(event.id);
				if (event.value !== null && service.fn) {
					count ++;
					if (await service.fn(event)) {
						try {
							event.ack = true;
							await this.adapter.setStateAsync(this.inverterInfo.path+'.control.'+event.id, {val: event.value , ack: true});
							this._eventMap.delete(event.id);
							this.log.info('Control: write state '+this.inverterInfo.path+'.control.'+event.id+' : '+event.value+' ack: true');
						} catch {
							this.log.warn('Control: Can not write state '+this.inverterInfo.path+'.control.'+event.id);
						}
					}
				}
				if (count > 1) break; //max 2
			}
		}
		if (!this._initialized && this.adapter.isConnected) await this._init();
	}

	async _writeRegisters(address,data) {
		try {
			this.log.debug('Try to write data to id/address ' + this._modbusClient.id + '/' + address+'/'+data.length);
			await this._modbusClient.writeRegisters(address,data);
			this.inverterInfo.instance.addHoldingRegisters(address,data);
			return true;
		} catch (err) {
			this.log.warn(`Error while writing to ${this._modbusClient.ipAddress} [Reg: ${address}, Len: ${data.length}, modbusID: ${this._modbusClient.id}] with: ${err.message}`);
		}
	}

	async _readHoldingRegisters(address,length) {
		try {
			this.log.debug('Try to read data to id/address ' + this._modbusClient.id + '/' + address+'/'+length);
			const data = await this._modbusClient.readHoldingRegisters(address,length);
			return data;
		} catch (err) {
			this.log.warn(`Error while reading from ${this._modbusClient.ipAddress} [Reg: ${address}, Len: ${length}, modbusID: ${this._modbusClient.id}] with: ${err.message}`);
		}
	}

	//state
	async _initState(path, state) {
		await this.adapter.extendObjectAsync(path+state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: true
			},
			native: {}
		});
	}

}

module.exports = ServiceQueueMap;