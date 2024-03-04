const {deviceType,driverClasses,storeType,dataRefreshRate,dataType} = require(__dirname + '/../types.js');
const DriverBase = require(__dirname + '/driver_base.js');

class Scharger extends DriverBase{
	constructor(stateInstance,charger,options) {
		super(stateInstance,charger,
			{
				name: 'smart charger',
				driverClass : driverClasses.charger,
				...options,
			});
		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			{
				address : 4096,
				length : 14,
				info : 'Collected Signal',
				refresh : dataRefreshRate.medium,
				type : deviceType.inverter,
				states : [{
					state: {id: 'voltageL1', name: 'voltage L1', desc: 'reg:4096, len:2', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 4096, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'voltageL2', name: 'voltage L2', desc: 'reg:4098, len:2', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 4098, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'voltageL3', name: 'voltage L3', desc: 'reg:4100, len:2', type: 'number', unit: 'V', role: 'value.voltage'},
					register: {reg: 4100, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'currentL1', name: 'current L1', desc: 'reg:4102, len:2', type: 'number', unit: 'W', role: 'value.current'},
					register: {reg: 4102, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'currentL2', name: 'current L2', desc: 'reg:4104, len:2', type: 'number', unit: 'W', role: 'value.current'},
					register: {reg: 4104, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'currentL3', name: 'current L3', desc: 'reg:4106, len:2', type: 'number', unit: 'W', role: 'value.current'},
					register: {reg: 4106, type: dataType.uint32, gain: 10}
				},
				{
					state: {id: 'totalOutputPower', name: 'total output Power ', desc: 'reg:4108, len:2', type: 'number', unit: 'kW', role: 'value.power'},
					register: {reg: 4108, type: dataType.uint32, gain: 10},
					store : storeType.always
				}]
			}
		];

		this.registerFields.push.apply(this.registerFields,newFields);
	}
}

module.exports = Scharger;