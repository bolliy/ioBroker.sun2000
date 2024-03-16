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
			},
			{
				state: {id: 'battery.gridChargeCutoffSOC', name: 'Grid Charge Cutoff SOC', type: 'number', unit: '%', role: 'value', desc: 'reg:47088, len:1'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 100) entry.value = 100;
					if (entry.value < 0) entry.value = 0;
					return await this._writeRegisters(47088,dataType.numToArray(entry.value*10,dataType.uint16));
				}
			},
			{
				state: {id: 'battery.workingModeSettings', name: 'Working Mode Settings', type: 'number', unit: '', role: 'value', desc: 'reg:47086, len:1'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 5) entry.value = 2;
					if (entry.value < 0) entry.value = 2;
					return await this._writeRegisters(47086,dataType.numToArray(entry.value,dataType.uint16));
				}
			},
			{
				state: { id: 'battery.powerOfchargeFromGrid', name: 'power Of charge from grid', type: 'number', unit: 'W', role: 'value.power', desc: 'reg: 47242, len: 2'},
				type : deviceType.battery,
				fn: async entry => {
					if (entry.value > 5000) entry.value = 5000;
					if (entry.value < 0) entry.value = 0;
					return await this._writeRegisters(47242,dataType.numToArray(entry.value,dataType.uint32));
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

			this._TOU = true;
			if (this._TOU) {
				this.adapter.log.debug('### TOU SETTINGS ###');
				// Time of Using charging and discharging periodes (siehe Table 5-6)
				// tCDP[3] = 127 - Working mode settings - load from grid (charge)
				// tCDP[3] = 383 - Working mode settings - self-consumption (discharge)
				const tCDP = [1,0,1440,127,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
				//await writeRegistersAsync(1,47086,[5,1,500]); //[TOU,chargeFromGrid,50%]
				//await this._writeRegisters(47086,[2]); //TOU -- set later
				await this._writeRegisters(47255,tCDP);
				/*
					2 : Maximise self consumptions (default)
					5 : Time Of Use(Luna) - hilfreich bei dynamischem Stromtarif (z.B Tibber)
			  	*/
			}
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
		if (!this.inverterInfo.instance.modbusAllowed) return;
		this._modbusClient = modbusClient;
		if (!this._initialized && this.adapter.isConnected) await this._init();

		if (this._initialized) {
			let count = 0;

			for (const entry of this._map.values()) {
				if (entry.ack) continue;
				if (entry.value !== null && entry.field.fn) {
					count ++;
					if (await entry.field.fn(entry)) {
						try {
							await this.adapter.setStateAsync(this.inverterInfo.path+'.service.'+entry.field.state.id, {val: entry.value , ack: true});
							entry.ack = true;
						} catch {
							this.adapter.log.warn('Can not write state '+this.inverterInfo.path+'.service.'+entry.field.state.id);
						}
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
			this.adapter.log.debug('Try to write data to id/address ' + this._modbusClient.id + '/' + reg+'/'+data.length);
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