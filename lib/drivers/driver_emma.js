const { deviceType, driverClasses, dataRefreshRate, dataType } = require(`${__dirname}/../types.js`);
const DriverBase = require(`${__dirname}/driver_base.js`);

class Emma extends DriverBase {
	constructor(stateInstance, inverter, options) {
		super(stateInstance, inverter, {
			name: 'emma',
			driverClass: driverClasses.emma,
			...options,
		});

		//https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md
		const newFields = [
			/*{
				address : 30000,
				length : 50,
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
			},*/
			{
				address: 30035,
				length: 15,
				info: 'Emma Characteristic data',
				states: [
					{
						state: {
							id: 'emma.softwareVersion',
							name: 'Software version',
							type: 'string',
							unit: '',
							role: 'info.firmware',
							desc: 'reg:30035, len:15',
						},
						register: { reg: 30035, type: dataType.string, length: 8 },
					},
				],
				readErrorHook: (err, reg) => {
					reg.lastread = this._newNowTime(); //try it once
				},
			},
			{
				address: 30222,
				length: 20,
				info: 'Emma Characteristic data',
				states: [
					{
						state: { id: 'emma.model', name: 'model', type: 'string', unit: '', role: 'info.name', desc: 'reg:30222, len:20' },
						register: { reg: 30222, type: dataType.string, length: 10 },
					},
				],
				readErrorHook: (err, reg) => {
					reg.lastread = this._newNowTime(); //try it once
				},
			},
			{
				address: 30302,
				length: 50,
				info: 'Emma sampled data 1',
				refresh: dataRefreshRate.low,
				states: [
					{
						state: {
							id: 'emma.inverterTotalAbsorbedEnergy',
							name: 'Inverter total absorbed energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30302, len:4',
						},
						register: { reg: 30302, type: dataType.uint64, gain: 100 },
					},
					{
						state: {
							id: 'emma.energyChargedToday',
							name: 'Energy charged today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30306, len:2',
						},
						register: { reg: 30306, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.totalChargedEnergy',
							name: 'Total charged energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30308, len:4',
						},
						register: { reg: 30308, type: dataType.uint64, gain: 100 },
					},
					{
						state: {
							id: 'emma.energyDischargedToday',
							name: 'nergy discharged today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30312, len:2',
						},
						register: { reg: 30312, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.TotalDischargedEnergy',
							name: 'Total discharged energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30314, len:4',
						},
						register: { reg: 30314, type: dataType.uint64, gain: 100 },
					},
					{
						state: {
							id: 'emma.ESSchargeableEnergy',
							name: 'ESS chargeable energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30318, len:2',
						},
						register: { reg: 30318, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.ESSdischargeableEnergy',
							name: 'ESS dischargeable energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30320, len:2',
						},
						register: { reg: 30320, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.ratedESScapacity',
							name: 'Rated ESS capacity',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30322, len:2',
						},
						register: { reg: 30322, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.consumptionToday',
							name: 'Consumption today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30324, len:2',
						},
						register: { reg: 30324, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.totalEnergyConsumption',
							name: 'Total energy consumption',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30326, len:4',
						},
						register: { reg: 30326, type: dataType.uint64, gain: 100 },
					},
					{
						state: {
							id: 'emma.feed-inToGridToday',
							name: 'Feed-in to grid today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30330, len:2',
						},
						register: { reg: 30330, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.totalFeed-inToGrid',
							name: 'Total feed-in to grid',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30332, len:4',
						},
						register: { reg: 30332, type: dataType.uint64, gain: 100 },
					},
					{
						state: {
							id: 'emma.supplyFromGridToday',
							name: 'Supply from grid today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30336, len:2',
						},
						register: { reg: 30336, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.totalSupplyFromGrid',
							name: 'Total supply from grid',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30338, len:4',
						},
						register: { reg: 30338, type: dataType.uint64, gain: 100 },
					},
					{
						state: {
							id: 'emma.inverterEnergyYieldToday',
							name: 'Inverter energy yield today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30342, len:2',
						},
						register: { reg: 30342, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.inverterTotalEnergyYield',
							name: 'Inverter total energy yieldy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30344, len:2',
						},
						register: { reg: 30344, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.PVyieldToday',
							name: 'PV yield today',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30346, len:2',
						},
						register: { reg: 30346, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.totalPVenergyYield',
							name: 'Total PV energy yield',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30348, len:4',
						},
						register: { reg: 30348, type: dataType.uint64, gain: 100 },
					},
				],
			},
			{
				address: 30354,
				length: 12,
				info: 'Emma sampled data 2',
				refresh: dataRefreshRate.high,
				states: [
					{
						state: { id: 'emma.PVoutputPower', name: 'PV output power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:30354, len:2' },
						register: { reg: 30354, type: dataType.uint32, gain: 1000 },
					},
					{
						state: { id: 'emma.loadPower', name: 'Load power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:30356, len:2' },
						register: { reg: 30356, type: dataType.uint32, gain: 1000 },
					},
					{
						state: { id: 'emma.feed-inPower', name: 'Feed-in power', type: 'number', unit: 'kW', role: 'value.power', desc: 'reg:30358, len:2' },
						register: { reg: 30358, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.batteryChargeDischargePower',
							name: 'Battery charge/discharge power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:30360, len:2',
						},
						register: { reg: 30360, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.inverterRatedPower',
							name: 'Battery charge/discharge power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:30362, len:2',
						},
						register: { reg: 30362, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.Inverter active power',
							name: 'Inverter active power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:30364, len:2',
						},
						register: { reg: 30364, type: dataType.int32, gain: 1000 },
					},
				],
			},
			{
				address: 30368,
				length: 6,
				info: 'Emma sampled data 3',
				refresh: dataRefreshRate.low,
				states: [
					{
						state: { id: 'emma.SOC', name: 'SOC', type: 'number', unit: '%', role: 'value.battery', desc: 'reg:30368, len:1' },
						register: { reg: 30368, type: dataType.uint16, gain: 100 },
					},
					{
						state: {
							id: 'emma.ESSchargeableCapacity',
							name: 'ESS chargeable capacity',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.capacity',
							desc: 'reg:30369, len:2',
						},
						register: { reg: 30369, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.ESSdischargeableCapacity',
							name: 'ESS dischargeable capacity',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.capacity',
							desc: 'reg:30371, len:2',
						},
						register: { reg: 30371, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'emma.BackupPowerSOC',
							name: 'Backup power SOC',
							type: 'number',
							unit: '%',
							role: 'value.battery',
							desc: 'reg:30373, len:1',
						},
						register: { reg: 30373, type: dataType.uint16, gain: 100 },
					},
				],
			},
			{
				address: 30380,
				length: 31,
				info: 'Emma sampled data 4',
				refresh: dataRefreshRate.low,
				states: [
					{
						state: {
							id: 'emma.yieldThisMonth',
							name: 'Yield this month',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30380, len:2',
						},
						register: { reg: 30380, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.monthlyEnergyConsumption',
							name: 'Monthly energy consumption',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30382, len:2',
						},
						register: { reg: 30382, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.monthlyFeed-inToGrid',
							name: 'Monthly feed-in to grid',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30384, len:2',
						},
						register: { reg: 30384, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.yieldThisYear',
							name: 'Yield this year',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30386, len:2',
						},
						register: { reg: 30386, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.annualEnergyConsumption',
							name: 'Annual energy consumption',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30388, len:2',
						},
						register: { reg: 30388, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.yearlyFeed-inToGrid',
							name: 'Yearly feed-in to grid',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30390, len:2',
						},
						register: { reg: 30390, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.monthlySupplyFromGrid',
							name: 'Monthly supply from grid',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30394, len:2',
						},
						register: { reg: 30394, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.yearlySupplyFromGrid',
							name: 'Yearly supply from grid',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30396, len:2',
						},
						register: { reg: 30396, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.BackupTimeNotificationThreshold',
							name: 'Backup time notification threshold',
							type: 'number',
							unit: 'min',
							role: 'value',
							desc: 'reg:30406, len:1',
						},
						register: { reg: 30406, type: dataType.uint16 },
					},
					{
						state: {
							id: 'emma.energyChargedThisMonth',
							name: 'Energy charged this month',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30407, len:2',
						},
						register: { reg: 30407, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'emma.energyDischargedThisMonth',
							name: 'Energy discharged this month',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30409, len:2',
						},
						register: { reg: 30409, type: dataType.uint32, gain: 100 },
					},
				],
			},
			/*
			{
				address : 30407,
				length : 4,
				info : 'Emma sampled data 5',
				refresh : dataRefreshRate.low,
				states: [{
					state: {id: 'emma.energyChargedThisMonth', name: 'Energy charged this month', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:30407, len:2'},
					register: {reg: 30407, type: dataType.uint32, gain: 100}
				},
				{
					state: {id: 'emma.energyDischargedThisMonth', name: 'Energy discharged this month', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'reg:30409, len:2'},
					register: {reg: 30409, type: dataType.uint32, gain: 100}
				}]
			},
			*/
			{
				address: 31002,
				length: 1,
				info: 'Emma DST State',
				refresh: dataRefreshRate.low,
				states: [
					{
						state: { id: 'emma.DSTState', name: 'DST state', type: 'number', unit: '', role: 'value', desc: 'reg:31002, len:1' },
						register: { reg: 31002, type: dataType.uint16 },
					},
				],
			},
			{
				address: 30801,
				length: 4,
				info: 'Emma running Devices',
				states: [
					{
						state: {
							id: 'emma.numberOfInverters',
							name: 'Number of inverters found',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:30801, len:1',
						},
						register: { reg: 30801, type: dataType.uint16 },
					},
					{
						state: {
							id: 'emma.numberOfChargers',
							name: 'Number of chargers found',
							type: 'number',
							unit: '',
							role: 'value',
							desc: 'reg:30804, len:1',
						},
						register: { reg: 30804, type: dataType.uint16 },
					},
				],
				postHook: path => {
					//NEW!!
					const numberOfChargers = this.stateCache.get(`${path}emma.numberOfChargers`)?.value ?? 0;
					this.log.debug(`Number of chargers ${numberOfChargers}`);
					this.log.debug('### PostHook for InverterSun2000');
					this.identifySubdevices('charger', this.modbusId)
						.then(ret => {
							this.log.debug(`### PostHook for Emma - ret: ${JSON.stringify(ret)}`);
							for (const [i, charger] of ret.entries()) {
								const device = {
									index: i,
									duration: 0,
									modbusId: charger.slave_id,
									driverClass: driverClasses.emmaCharger,
								};
								this.adapter.devices.push(device);
								this.adapter.initDevicePath(device);
							}
						})
						.catch(err => {
							this.log.warn(`### PostHook for Emma - err: ${err}`);
						});
				},
			},
			{
				address: 31639,
				length: 52,
				info: 'Emma build-in energy sensor',
				refresh: dataRefreshRate.high,
				type: deviceType.meter,
				states: [
					{
						state: { id: 'meter.voltageL1', name: 'Phase 1 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:31639, len:2' },
						register: { reg: 31639, type: dataType.uint32, gain: 100 },
					},
					{
						state: { id: 'meter.voltageL2', name: 'Phase 2 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:31641, len:2' },
						register: { reg: 31641, type: dataType.uint32, gain: 100 },
					},
					{
						state: { id: 'meter.voltageL3', name: 'Phase 3 voltage', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:31643, len:2' },
						register: { reg: 31643, type: dataType.uint32, gain: 100 },
					},
					{
						state: { id: 'meter.currentL1', name: 'Phase 1 current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:31651, len:2' },
						register: { reg: 31651, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.currentL2', name: 'Phase 2 current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:31653, len:2' },
						register: { reg: 31653, type: dataType.int32, gain: 10 },
					},
					{
						state: { id: 'meter.currentL3', name: 'Phase 3 current', type: 'number', unit: 'A', role: 'value.current', desc: 'reg:31655, len:2' },
						register: { reg: 31655, type: dataType.int32, gain: 10 },
					},
					{
						state: {
							id: 'meter.activePower',
							name: 'Active power',
							type: 'number',
							unit: 'kW',
							role: 'value.power.active',
							desc: 'reg:31657, len:2 (>0: feed-in to grid. <0: supply from grid.)',
						},
						register: { reg: 31657, type: dataType.int32, gain: -1000 },
					},
					{
						state: { id: 'meter.powerFactor', name: 'Power factor', type: 'number', unit: '', role: 'value', desc: 'reg:31661, len:1' },
						register: { reg: 31661, type: dataType.int16, gain: 1000 },
					},
					{
						state: { id: 'meter.voltageL1-L2', name: 'Voltage L1-L2', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:31645 , len:2' },
						register: { reg: 31645, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'meter.voltageL2-L3',
							name: 'Voltage L2-L3',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:31647  , len:2',
						},
						register: { reg: 31647, type: dataType.uint32, gain: 100 },
					},
					{
						state: { id: 'meter.voltageL3-L1', name: 'Voltage L3-L1', type: 'number', unit: 'V', role: 'value.voltage', desc: 'reg:31649, len:2' },
						register: { reg: 31649, type: dataType.uint32, gain: 100 },
					},
					{
						state: {
							id: 'meter.activePowerL1',
							name: 'Active power L1',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:31651, len:2',
						},
						register: { reg: 31651, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'meter.activePowerL2',
							name: 'Active power L2',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:31653, len:2',
						},
						register: { reg: 31653, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'meter.activePowerL3',
							name: 'Active power L3',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:31655, len:2',
						},
						register: { reg: 31655, type: dataType.int32, gain: 1000 },
					},
					{
						state: {
							id: 'meter.reverseActiveEnergy',
							name: 'Reverse active energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:31679, len:4',
						},
						register: { reg: 31679, type: dataType.int64, gain: 100 },
					},
					{
						state: {
							id: 'meter.positiveActiveEnergy',
							name: 'Positive active energy',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:31687, len:4',
						},
						register: { reg: 31687, type: dataType.int64, gain: 100 },
					},
				],
			},
		];

		this.registerFields.push.apply(this.registerFields, newFields);
	}
}

class EmmaCharger extends DriverBase {
	constructor(stateInstance, inverter, options) {
		super(stateInstance, inverter, {
			name: 'emmaCharger',
			driverClass: driverClasses.emmaCharger,
			...options,
		});

		const newFields = [
			{
				address: 30000,
				length: 48,
				info: 'Emma Scharger info',
				states: [
					{
						state: { id: 'offeringName', name: 'Offering name', type: 'string', role: 'value', desc: 'reg:30000, len:15' },
						register: { reg: 30000, type: dataType.string, length: 8 },
					},
					{
						state: { id: 'esn', name: 'ESN', type: 'string', role: 'value', desc: 'reg:30015, len:16' },
						register: { reg: 30015, type: dataType.string, length: 10 },
					},
					{
						state: { id: 'softwareVersion', name: 'Software version', type: 'string', role: 'value', desc: 'reg:30031, len:16' },
						register: { reg: 30031, type: dataType.string, length: 10 },
					},
				],
			},
			{
				address: 30076,
				length: 2,
				info: 'Emma Scharger rated power',
				refresh: dataRefreshRate.high,
				states: [
					{
						state: {
							id: 'ratedPower',
							name: 'Rated power',
							type: 'number',
							unit: 'kW',
							role: 'value.power',
							desc: 'reg:30076, len:2',
						},
						register: { reg: 30076, type: dataType.uint32, gain: 10 },
					},
				],
			},
			{
				address: 30500,
				length: 10,
				info: 'Emma Scharger data 2',
				refresh: dataRefreshRate.high,
				states: [
					{
						state: {
							id: 'voltageL1',
							name: 'Phase A voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:30500, len:2',
						},
						register: { reg: 30500, type: dataType.uint32, gain: 10 },
					},
					{
						state: {
							id: 'voltageL2',
							name: 'Phase B voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:30502, len:2',
						},
						register: { reg: 30502, type: dataType.uint32, gain: 10 },
					},
					{
						state: {
							id: 'voltageL3',
							name: 'Phase C voltage',
							type: 'number',
							unit: 'V',
							role: 'value.voltage',
							desc: 'reg:30504, len:2',
						},
						register: { reg: 30504, type: dataType.uint32, gain: 10 },
					},
					{
						state: {
							id: 'totalEnergyCharged',
							name: 'total energy charged',
							type: 'number',
							unit: 'kWh',
							role: 'value.power.consumption',
							desc: 'reg:30506, len:2',
						},
						register: { reg: 30506, type: dataType.uint32, gain: 1000 },
					},
					{
						state: {
							id: 'charger temperature',
							name: 'charger temperature',
							type: 'number',
							unit: '°C',
							role: 'value.temperature',
							desc: 'reg:30508, len:2',
						},
						register: { reg: 30508, type: dataType.int32, gain: 10 },
					},
				],
			},
		];

		this.registerFields.push.apply(this.registerFields, newFields);
	}
}

module.exports = { Emma, EmmaCharger };
