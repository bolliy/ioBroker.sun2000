const {deviceType,driverClasses,dataRefreshRate,dataType} = require(__dirname + '/../types.js');
const DriverBase = require(__dirname + '/driver_base.js');

class Emma extends DriverBase{
	constructor(stateInstance,inverter,options) {
		super(stateInstance,inverter,
			{
				name: 'emma',
				driverClass : driverClasses.emma,
				...options,
			});

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 30000,
				length : 44,
				info : 'Emma Characteristic data',
				states: [{
					state: {id: 'emma.offeringName', name: 'offering name', type: 'string', unit: '', role: 'info.display', desc: 'reg:30000, len:15'},
					register: {reg: 30000, type: dataType.string, length: 8}
				},
				{
					state: {id: 'emma.SN', name: 'serial number', type: 'string', unit: '', role: 'info.serial', desc: 'reg:30015, len:10'},
					register: {reg: 30015, type: dataType.string, length: 5}
				},
				{
					state: {id: 'emma.softwareVersion', name: 'Software version', type: 'string', unit: '', role: 'info.firmware', desc: 'reg:30035, len:15'},
					register: {reg: 30035, type: dataType.string, length: 8}
				}
				]
			},
			{
				address : 30222,
				length : 10,
				info : 'Emma Characteristic data',
				states: [
					{
						state: {id: 'emma.model', name: 'model', type: 'string', unit: '', role: 'info.name', desc: 'reg:30035, len:20'},
						register: {reg: 30222, type: dataType.string, length: 10}
					}
				]
			},
			{
				address : 30302,
				length : 1,
				info : 'Emma sampled data',
				refresh : dataRefreshRate.low,
				states: [{
					state: {id: 'emma.inverterTotalAbsorbedEnergy', name: 'Inverter total absorbed energy', type: 'number', unit: 'kWh', role: 'value', desc: 'reg:30302, len:4'},
					register: {reg: 30302, type: dataType.uint64, gain: 100}
				}]
			},
			{
				address : 31002,
				length : 1,
				info : 'Emma DST State',
				refresh : dataRefreshRate.low,
				states: [{
					state: {id: 'emma.DSTState', name: 'DST State', type: 'number', unit: '', role: 'value', desc: 'reg:31002, len:1'},
					register: {reg: 31002, type: dataType.uint16}
				}]
			},
			{
				address : 30801,
				length : 4,
				info : 'Emma running Devices',
				refresh : dataRefreshRate.low,
				states: [{
					state: {id: 'emma.numberOfInverters', name: 'Number of inverters found', type: 'number', unit: '', role: 'value', desc: 'reg:40801, len:1'},
					register: {reg: 30801, type: dataType.uint16}
				},
				{
					state: {id: 'slogger.numberOfCharger', name: 'Number of chargers found', type: 'number', unit: '', role: 'value', desc: 'reg:40804, len:1'},
					register: {reg: 30804, type: dataType.uint16}
				}
				]
			}
		];
		this.registerFields.push.apply(this.registerFields,newFields);
		//this.postUpdateHooks.push.apply(this.postUpdateHooks,newHooks);
	}

}

class EmmaMeter extends DriverBase{
	constructor(stateInstance,inverter,options) {
		super(stateInstance,inverter,
			{
				name: 'emmaMeter',
				driverClass : driverClasses.emmaMeter,
				...options,
			});
		this._testMode = false;
		//this._testMode = (this._modbusId == 1);

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 32260,
				length : 105,
				info : 'Emma external smart meter info',
				refresh : dataRefreshRate.high,
				type : deviceType.meter,
				states: [
					{
						state: {id: 'meter.voltageL1', name: 'Phase 1 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32260, len:2'},
						register: {reg: 32260, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'meter.voltageL2', name: 'Phase 2 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32262, len:2'},
						register: {reg: 32262, type: dataType.uint32, gain:100}
					},
					{
						state: {id: 'meter.voltageL3', name: 'Phase 3 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32264, len:2'},
						register: {reg: 32264, type: dataType.uint32, gain:100}
					},
					{
						state: {id: 'meter.currentL1', name: 'Phase 1 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32272, len:2'},
						register: {reg: 32272, type: dataType.int32, gain:10}
					},
					{
						state: {id: 'meter.currentL2', name: 'Phase 2 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32274, len:2'},
						register: {reg: 32274, type: dataType.int32, gain:10}
					},
					{
						state: {id: 'meter.currentL3', name: 'Phase 3 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:32276, len:2'},
						register: {reg: 32276, type: dataType.int32, gain:10}
					},
					{
						state: {id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'reg:32278, len:2 (>0: feed-in to grid. <0: supply from grid.)' },
						register: { reg: 32278, type: dataType.int32, gain:1000}
					},
					{
						state: {id: 'meter.reactivePower', name: 'Reactive Power', type: 'number', unit: 'VAr', role: 'value.power.reactive', desc: 'reg:32280, len:2'},
						register: {reg: 32280, type: dataType.int32}
					},
					{
						state: {id: 'meter.powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value', desc: 'reg:32284, len:1'},
						register: {reg: 32284, type: dataType.int16, gain: 1000}
					},
					{
						state: {id: 'meter.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32266 , len:2'},
						register: {reg: 32266 , type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'meter.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32268  , len:2'},
						register: {reg: 32268, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'meter.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:32270, len:2'},
						register: {reg: 32270, type: dataType.uint32, gain: 100}
					},
					{
						state: {id: 'meter.activePowerL1', name: 'Active Power L1', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:32335, len:2'},
						register: {reg: 32335, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'meter.activePowerL2', name: 'Active Power L2', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:32337, len:2'},
						register: {reg: 32337, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'meter.activePowerL3', name: 'Active Power L3', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:32339, len:2'},
						register: {reg: 32339, type: dataType.int32, gain: 1000}
					},
					{
						state: {id: 'meter.positiveActiveEnergy', name: 'Positive Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:32357, len:4'},
						register: {reg: 32357, type: dataType.int64, gain: 100}
					},
					{
						state: {id: 'meter.reverseActiveEnergy', name: 'Reverse Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:32349, len:4'},
						register: {reg: 32349, type: dataType.int64, gain: 100}
					},
					{
						state: {id: 'meter.accumulatedReactivePower', name: 'Accumulated Reactive Power', type: 'number', unit: 'kVarh', role: 'value.power.reactive.consumption', desc: 'reg:32361, len:4'},
						register: {reg: 32361, type: dataType.int64, gain: 100}
					}
				]
			}
		];

		const newTestFields = [
			{
				address : 37100,
				length : 38,
				info : 'Test Emma external smart meter info',
				refresh : dataRefreshRate.high,
				type : deviceType.meter,
				states: [{
					state: {id: 'meter.voltageL1', name: 'Phase 1 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37101, len:2'},
					register: {reg: 37101, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL2', name: 'Phase 2 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37103, len:2'},
					register: {reg: 37103, type: dataType.int32, gain:10}
				},
				{
					state: {id: 'meter.voltageL3', name: 'Phase 3 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37105, len:2'},
					register: {reg: 37105, type: dataType.int32, gain:10}
				},
				{
					state: {id: 'meter.currentL1', name: 'Phase 1 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37107, len:2'},
					register: {reg: 37107, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.currentL2', name: 'Phase 2 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37109, len:2'},
					register: {reg: 37109, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.currentL3', name: 'Phase 3 Current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37111, len:2'},
					register: {reg: 37111, type: dataType.int32, gain:100}
				},
				{
					state: {id: 'meter.activePower', name: 'ActivePower', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'reg:37113, len:2 (>0: feed-in to grid. <0: supply from grid.)' },
					register: { reg: 37113, type: dataType.int32, gain:1000 }
				},
				{
					state: {id: 'meter.reactivePower', name: 'Reactive Power', type: 'number', unit: 'VAr', role: 'value.power.reactive', desc: 'reg:37115, len:2'},
					register: {reg: 37115, type: dataType.int32}
				},
				{
					state: {id: 'meter.powerFactor', name: 'Power Factor', type: 'number', unit: '', role: 'value', desc: 'reg:37117, len:1'},
					register: {reg: 37117, type: dataType.int16, gain: 1000}
				},
				/*
				{
					state: {id: 'meter.gridFrequency', name: 'Grid Frequency', type: 'number', unit: 'Hz', role: 'value.frequency', desc: 'reg:37118, len:1'},
					register: {reg: 37118, type: dataType.int16, gain: 100}
				},
				*/
				{
					state: {id: 'meter.positiveActiveEnergy', name: 'Positive Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37119, len:2'},
					register: {reg: 37119, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.reverseActiveEnergy', name: 'Reverse Active Energy', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:37121, len:2'},
					register: {reg: 37121, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.accumulatedReactivePower', name: 'Accumulated Reactive Power', type: 'number', unit: 'kVarh', role: 'value.power.reactive.consumption', desc: 'reg:37123, len:2'},
					register: {reg: 37123, type: dataType.int32, gain: 100}
				},
				{
					state: {id: 'meter.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37126, len:2'},
					register: {reg: 37126, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL2-L3', name: 'Voltage L2-L3', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37128, len:2'},
					register: {reg: 37128, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:37130, len:2'},
					register: {reg: 37130, type: dataType.int32, gain: 10}
				},
				{
					state: {id: 'meter.activePowerL1', name: 'Active Power L1', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37132, len:2'},
					register: {reg: 37132, type: dataType.int32,}
				},
				{
					state: {id: 'meter.activePowerL2', name: 'Active Power L2', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37134, len:2'},
					register: {reg: 37134, type: dataType.int32}
				},
				{
					state: {id: 'meter.activePowerL3', name: 'Active Power L3', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:37136, len:2'},
					register: {reg: 37136, type: dataType.int32}
				}
				]
			}
		];

		if (this._testMode) this.registerFields.push.apply(this.registerFields,newTestFields);
		else this.registerFields.push.apply(this.registerFields,newFields);
		//this.postUpdateHooks.push.apply(this.postUpdateHooks,newHooks);
	}

}

module.exports = {Emma,EmmaMeter};
