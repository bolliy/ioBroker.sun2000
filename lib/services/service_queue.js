'use strict';
const {deviceType,dataType} = require(__dirname + '/../types.js');
class ServiceQueueMap  {
	constructor (adapterInstance,inverter) {
		this.adapter = adapterInstance;
		this.inverterInfo = inverter;
		this._modbusClient = undefined;
		this._map = new Map();
		this._initialized = false;

		this.serviceFields = [
			{
				state: {id: 'battery.chargeFromGridFunction', name: 'Charge from Grid', type: 'boolean', role: 'value', desc: 'reg: 47087, len: 1'},
				type : deviceType.battery,
				fn: async entry => {
					return await this._writeRegisters(47087,entry.value === true ? [1]: [0]);
				}
			},
			{
				state: { id: 'battery.maximumChargePower', name: 'MaximumChargePower', type: 'number', unit: 'W', role: 'value.power', desc: 'reg: 47075, len: 2'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 5000) entry.value = 5000;
					if (entry.value < 0) entry.value = 0;
					return await this._writeRegisters(47075,dataType.numToArray(entry.value,dataType.uint32));
				}
			},
			{
				state: { id: 'battery.maximumDischargePower', name: 'MaximumDischargePower', type: 'number', unit: 'W', role: 'value.power', desc: 'reg: 47077, len: 2'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 5000) entry.value = 5000;
					if (entry.value < 0) entry.value = 0;
					return await this._writeRegisters(47077,dataType.numToArray(entry.value,dataType.uint32));
				}

			},
			{
				state: {id: 'battery.chargingCutoffCapacity', name: 'Charging Cutoff Capacity', type: 'number', unit: '%', role: 'value', desc: 'reg: 7081, len: 1'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 100) entry.value = 100;
					if (entry.value < 0) entry.value = 0;
					return await this._writeRegisters(47081,dataType.numToArray(entry.value*10,dataType.uint16));
				}
			},
			{
				state: {id: 'battery.dischargeCutoffCapacity', name: 'Discharge Cutoff Capacity', type: 'number', unit: '%', role: 'value', desc: 'reg: 47082, len: 1'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 20) entry.value = 20;
					if (entry.value < 0) entry.value = 0;
					return await this._writeRegisters(47082,dataType.numToArray(entry.value*10,dataType.uint16));
				}
			}

		];

	}

	async _init() {
		if (this.inverterInfo.instance) {
			for (const item of this.serviceFields) {
				if (item?.state) {
					this._map.set(item.state.id, { field : item , value : null, ack : false });
				}
			}
			for (const entry of this._map.values()) {
				if (entry.field.type == deviceType.battery && this.inverterInfo?.numberBatteryUnits == 0) continue; //no battery

				await this._initState(this.inverterInfo.path+'.service.',entry.field.state);
				const state = await this.adapter.getStateAsync(this.inverterInfo.path+'.service.'+entry.field.state.id);
				entry.value = state ? state.val : null;
				entry.ack = state ? state.ack : true;
			}
			this.adapter.subscribeStates(this.inverterInfo.path+'.service*');
			this._initialized = true;
		}
	}

	get(id) {
		return this._map.get(id);
	}

	set(id, state) {
		const entry = this._map.get(id);
		if (state && entry) {
			this.adapter.log.info(`state: ${id} changed: ${state.val} ack: ${state.ack}`);
			entry.value = state?.val;
			entry.ack = state?.ack;
		}
	}

	values () {
		return this._map.values();
	}

	async process(modbusClient) {
		if (!this._initialized && this.adapter.isConnected) await this._init();

		if (this._initialized) {
			this._modbusClient = modbusClient;
			let count = 0;

			for (const entry of this._map.values()) {
				if (entry.ack) continue;
				if (entry.value !== null && entry.field.fn) {
					count ++;
					if (await entry.field.fn(entry)) {
						await this.adapter.setStateAsync(this.inverterInfo.path+'.service.'+entry.field.state.id, {val: entry.value , ack: true});
						entry.ack = true;
					}
				//this.adapter.log.debug('#### '+this.inverterInfo.path+'.service.'+entry.field.state.id+' : '+entry.value);
				} else {
					entry.ack = true;
				}
				if (count > 1) break; //max 2
			}
		}
	}

	async _writeRegisters(reg,data) {
		try {
			this.adapter.log.debug('Try to write data to id/address ' + this._modbusClient.id + '/' + reg+'/'+data);
			await this._modbusClient.writeRegisters(reg,data);
			return true;
		} catch (err) {
			this.adapter.log.warn(`Error while writing to ${this._modbusClient.ipAddress} [Reg: ${reg}, Len: ${data.length}, modbusID: ${this._modbusClient.id}] with: ${err.message}`);
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