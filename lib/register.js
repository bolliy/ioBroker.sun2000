
/* eslint-disable quotes */
const {registerType,batteryStatus,dataRefreshRate,dataType} = require(__dirname + '/types.js');


class Registers {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		//https://www.iobroker.net/#de/documentation/basics/roles.md
		this.registerFields = [
			{
				address : 37765,
				length : 2,
				info : 'Battery Charge And Discharge Power',
				refresh : dataRefreshRate.high,
				type : registerType.inverter,
				states : [{
					state: {id: 'battery.chargeDischargePower', name: 'Charge/Discharge power', desc: '(>0 charging, <0 discharging)', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 37765, type: dataType.int32, gain:1000}
				}]
			},
			{
				address : 32080,
				length : 2,
				info : 'Inverter Activ Power',
				refresh : dataRefreshRate.high,
				type : registerType.inverter,
				states : [{
					state: {id: 'activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power currently used'},
					register: {reg: 32080, type: dataType.int32, gain:1000}
				}]
			},
			{
				address : 32064,
				length : 2,
				info : 'Input Power',
				refresh : dataRefreshRate.high,
				type : registerType.inverter,
				states : [{
					state: {id: 'inputPower', name: 'Input power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from PV'},
					register: {reg: 32064, type: dataType.int32, gain:1000}
				}]
			},
			{
				address : 37113,
				length : 2,
				info : 'meter active power',
				refresh : dataRefreshRate.high,
				type : registerType.meter,
				states : [{
					state: { id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kW', role: 'value.power', desc: '(>0: feed-in to the power grid. <0: supply from the power grid.)' },
					register: { reg: 37113, type: dataType.int32, gain:1000 }
				}]
			},
			{
				address : 37000,
				length : 68,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery,
				states: [{
					state: { id: 'battery.currentDayChargeCapacity', name: 'CurrentDayChargeCapacity', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'TBD' },
					register: { reg: 37015, type: dataType.uint32, gain: 100 }
				},
				{	state: { id: 'battery.maximumChargePower', name: 'MaximumChargePower', type: 'number', unit: 'W', role: 'value.power', desc: '' },
					register: { reg: 37046, type: dataType.uint32 }
				},
				{	state: { id: 'battery.maximumDischargePower', name: 'MaximumDischargePower', type: 'number', unit: 'W', role: 'value.power', desc: '' },
					register: { reg: 37046, type: dataType.uint32}
				}]
			},
			{
				address : 38200,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery
			},
			{
				address : 30000,
				length : 81,
				info : 'model info, SN, max Power (static info)',
				type : registerType.inverter,
				states: [{
					state: {id: 'info.model', name: 'Model', type: 'string', role: 'state'},
					register: {reg: 30000, type: dataType.string, length: 15}
				},
				{
					state: {id: 'info.modelID', name: 'Model ID', type: 'number', role: 'state'},
					register: {reg: 30070, type: dataType.uint16}
				},
				{
					state: {id: 'info.serialNumber', name: 'Serial number', type: 'string', role: 'state'},
					register: {reg: 30015, type: dataType.string, length: 10}
				},
				{
					state: {id: 'info.ratedPower', name: 'Rated power', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 30073, type: dataType.int32, gain:1000}
				},
				{
					state: {id: 'info.numberMPPTrackers', name: 'Number of MPP trackers', type: 'number', unit: '', role: 'state'},
					register: {reg: 30072, type: dataType.uint16}
				}]
			},
			{
				address : 37800,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery
			},
			{
				address : 38300,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery
			},
			{
				address : 38400,
				length : 100,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery
			},
			{
				address : 47081,
				length : 8,
				info : 'additional battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery
			},
			{
				address : 32000,
				length : 116,
				info : 'inverter status',
				refresh : dataRefreshRate.low,
				type : registerType.inverter,
				states: [
					{
						state: {id: 'peakActivePowerCurrentDay', name: 'Peak active power of current day', type: 'number', unit: 'kW', role: 'value.power.max'},
						register: {reg: 32078, type: dataType.int32, gain:1000}
					},
					{
						state: {id: 'efficiency', name: 'Efficiency', type: 'number', unit: '%', role: 'value.efficiency'},
						register: {reg: 32086, type: dataType.uint16, gain: 100}
					},
					{
						state: {id: 'internalTemperature', name: 'Internal temperature', type: 'number', unit: '°C', role: 'value.temp'},
						register: {reg: 32087, type: dataType.int16, gain: 10}
					}]
			},
			{
				address : 37100,
				length : 114,
				info : 'meter info',
				refresh : dataRefreshRate.low,
				type : registerType.meter
			},
			{
				address : 37700,
				length : 100,
				info : 'battery information',
				refresh : dataRefreshRate.low,
				type : registerType.battery,
				states: [{
					state: {id: 'battery.runningState', name: 'Running state', type: 'string', role: 'value'},
					register: {reg: 37762, type: dataType.uint16, length: 1},
					mapper: value => Promise.resolve(batteryStatus[value])
				},
				{
					state: {id: 'battery.SOC', name: 'State of capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'SOC'},
					register: {reg: 37760, type: dataType.uint16, gain: 10}
				},
				{
					state: { id: 'battery.currentDayDischargeCapacity', name: 'CurrentDayDischargeCapacity', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'TBD' },
					register: { reg: 37786, type: dataType.uint32,  gain: 100 }
				}]
			}
		];

	}


	/*
	async readRegisters(modbusClient,refreshRate,stopOnError = true) {
		//timeAvailable
		let readError = 0;
		for (const field of this.registerFields) {

			if (! dataRefreshRate.compare(refreshRate,field.refresh)) continue;
			this.adapter.log.debug(JSON.stringify(field));
			try {
				this.adapter.log.debug("Try to read data from id/address " + modbusClient.id + "/" + field.address);
				const data = await modbusClient.readHoldingRegisters(field.address, field.length);
				this.adapter.log.debug("Data: " + data);
				this.buffer.set(field.address,data);
				field.lastupdate = new Date().getTime();
			} catch (err) {
				this.adapter.log.warn(`Error while reading from ${modbusClient.ipAddress}: [${field.address}|${field.length}] '' with : ${err.message}`);
				readError += 1;
				if (stopOnError) break;
			}
		}
		return readError == 0;
	}
	*/

	async _initState(path, state) {
		//this.adapter.log.info('setObjectAsync '+path+state.id);
		await this.adapter.setObjectAsync(path+state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: false
			},
			native: {}
		});
	}


	_fromArray(data,address,field) {
		//nullish coalescing Operator (??)
		const len = field.register.length ?? dataType.size(field.register.type);
		const pos = field.register.reg - address;
		return dataType.convert(data.slice(pos,pos+len),field.register.type);
	}

	async storeStates(reg,data) {
		//this.adapter.log.debug('[register.storeStates] '+JSON.stringify(reg));
		if (reg.states) {
			for(const field of reg.states) {
				const state = field.state;
				let value = this._fromArray(data,reg.address,field);
				if (value !== null) {
					if (field.register.gain) {
						value /= field.register.gain;
					}
					if (field.mapper) {
						value = await field.mapper(value);
					}
					/*
					if (updateEntry.postUpdateHook) {
						await updateEntry.postUpdateHook(adapter, updateEntry.value);
					} */
					let path = '';
					if (reg.type !== registerType.meter) path = this.inverterInfo.path+'.';
					if (!state.staid ) {
						await this._initState(path,state);
						state.staid = true;
					}
					//this.adapter.log.info('StateID '+path+state.id);
					await this.adapter.setStateAsync(path+state.id, {val: value , ack: true});

					this.adapter.log.debug(`Fetched value ${path+state.id}, val=${value}`);
				}
			}
		}
	}

	async updateStates(modbusClient,refreshRate,duration) {
		const start = new Date().getTime();
		this.inverterInfo = this.adapter.getInverterInfo(modbusClient.id);
		//The number of Registers reads
		let readRegisters = 0;
		for (const reg of this.registerFields) {
			if (duration) {
				if (new Date().getTime() - start > (duration - 2000)) {
					this.adapter.log.debug('Duration: '+Math.round(duration/1000)+' used time: '+ (new Date().getTime() - start)/1000);
					return readRegisters;
				}
			}
			if (!reg.states || reg.states.length == 0) continue;  				//no states ?!
			if (!dataRefreshRate.compare(refreshRate,reg.refresh)) continue;
			//refresh rate low or empty
			if ( refreshRate !== dataRefreshRate.high) {
				if (reg.lastread) {
					if (!reg.refresh) continue;
					if  ((start - reg.lastread) < 60000) {
						this.adapter.log.debug('Letztes Update :'+(start - reg.lastread ));
						continue;
					}
				}
			}
			//this.adapter.log.debug(JSON.stringify(reg));
			try {
				this.adapter.log.debug("Try to read data from id/address " + modbusClient.id + "/" + reg.address);
				const data = await modbusClient.readHoldingRegisters(reg.address, reg.length);
				//this.adapter.log.debug("Data " + reg.info+':'+data);
				this.storeStates(reg,data); //fire and forget
				readRegisters += 1;
				reg.lastread = new Date().getTime();
			} catch (err) {
				this.adapter.log.warn(`Error while reading from ${modbusClient.ipAddress}: [${reg.address}|${reg.length}] '' with : ${err.message}`);
			}
		}
		return readRegisters;
	}

}

module.exports = Registers;

