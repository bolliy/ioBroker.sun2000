const { driverClasses, dataRefreshRate, dataType } = require(`${__dirname}/../types.js`);
const DriverBase = require(`${__dirname}/driver_base.js`);

class Sdongle extends DriverBase {
	constructor(stateInstance, charger, options) {
		super(stateInstance, charger, {
			name: 'smart dongle',
			driverClass: driverClasses.sdongle,
			...options,
		});

		const newFields = [
			{
				address: 30015,
				length: 56,
				info: 'SDongle info 1',
				states: [
					{
						state: { id: 'sdongle.sn', name: 'Serial number', type: 'string', unit: '', role: 'value', desc: 'reg:30015, len:10' },
						register: { reg: 30015, type: dataType.string, length: 6 },
					},
					{
						state: { id: 'sdongle.OSVersion', name: 'OS version', type: 'string', unit: '', role: 'value', desc: 'reg:30050, len:15' },
						register: { reg: 30050, type: dataType.string, length: 8 },
					},
					{
						state: { id: 'sdongle.protokolVersion', name: 'Protokol version', type: 'number', unit: '', role: 'value', desc: 'reg:30068, len:2' },
						register: { reg: 30068, type: dataType.uint32 },
					},
				],
			},
			{
				address: 37410,
				length: 1,
				info: 'SDongle info 2',
				states: [
					{
						state: { id: 'sdongle.type', name: 'Type', type: 'number', unit: '', role: 'value', desc: 'reg:37410, len:1' },
						register: { reg: 37410, type: dataType.uint16 },
					},
				],
			},
			{
				address: 37411,
				length: 1,
				info: 'SDongle Device Search Status',
				refresh: dataRefreshRate.low,
				states: [
					{
						state: {
							id: 'sdongle.deviceSearchStatus',
							name: 'Device search status',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:37411, len:1',
						},
						register: { reg: 37411, type: dataType.uint16 },
					},
				],
			},
			{
				address: 37498,
				length: 20,
				info: 'Power data',
				//refresh : dataRefreshRate.high,
				refresh: dataRefreshRate.medium,
				states: [
					{
						state: {
							id: 'sdongle.totalInputPower',
							name: 'Total input power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:37498, len:2',
						},
						register: { reg: 37498, type: dataType.uint32, gain: 1000 },
					},
					{
						state: { id: 'sdongle.loadPower', name: 'Load power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:37500, len:2' },
						register: { reg: 37500, type: dataType.uint32, gain: 1000 },
					},
					{
						state: { id: 'sdongle.gridPower', name: 'Grid power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:37502, len:2' },
						register: { reg: 37502, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'sdongle.totalBatteryPower',
							name: 'Total battery power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:37504, len:2',
						},
						register: { reg: 37504, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'sdongle.totalActivePower',
							name: 'Total active power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:37516, len:2',
						},
						register: { reg: 37516, type: dataType.int32, gain: 1000 },
					},
				],
			},
		];

		this.registerFields.push.apply(this.registerFields, newFields);
	}

	//overload
	get modbusAllowed() {
		// the first device is the master
		if (this.adapter.devices[0].driverClass === driverClasses.inverter && this.adapter.devices[0].instance) {
			return this.adapter.devices[0].instance.modbusAllowed; //ask the master
		}
		return false;
	}
}

module.exports = Sdongle;
