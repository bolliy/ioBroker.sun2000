
const {deviceType,dataRefreshRate} = require(__dirname + '/types.js');
const {StateMap} = require(__dirname + '/tools.js');
const getDriverHandler = require(__dirname + '/drivers.js');

class Registers {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		this.stateCache = new StateMap();
		for (const inverter of this.adapter.inverters) {
			//DriverInfo Instance
			this.createInverterInstance(inverter);
		}

		this._loadStates();

		this.postProcessHooks = [
			{
				refresh : dataRefreshRate.high,
				states : [
					{id: 'collected.houseConsumption', name: 'House Consumption', type: 'number', unit: 'kW', role: 'value.power', desc: ''},
					{id: 'collected.activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'Power currently used'},
					{id: 'collected.inputPower', name: 'Input power' , type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from solar'},
					{id: 'collected.inputPowerWithEfficiencyLoss', name: 'input power with efficiency loss' , type: 'number', unit: 'kW', role: 'value.power', desc: ''},
					{id: 'collected.chargeDischargePower', name: 'Charge/Discharge power', desc: '(>0 charging, <0 discharging)', type: 'number', unit: 'kW', role: 'value.power'},
				],
				fn : (inverters) => {
					let sum = 0;
					let inPower = 0;
					let inPowerEff = 0;
					let chargeDischarge = 0;
					for (const inverter of inverters) {
						sum  += this.stateCache.get(inverter.path+'.activePower')?.value;
						inPower += this.stateCache.get(inverter.path+'.inputPower')?.value;
						inPowerEff += this.stateCache.get(inverter.path+'.derived.inputPowerWithEfficiencyLoss')?.value;
						chargeDischarge += this.stateCache.get(inverter.path+'.battery.chargeDischargePower')?.value;
					}
					//this.adapter.log.debug('++++ collected.inputPower '+inPower);
					this.stateCache.set('collected.inputPower',inPower,{type: 'number', renew : true});
					this.stateCache.set('collected.inputPowerWithEfficiencyLoss',inPowerEff,{type: 'number'});
					this.stateCache.set('collected.activePower',sum,{type: 'number', renew : true});
					sum -= this.stateCache.get('meter.activePower')?.value;
					this.stateCache.set('collected.houseConsumption',sum,{type: 'number'});
					this.stateCache.set('collected.chargeDischargePower',chargeDischarge,{type: 'number'});
				}

			},
			{
				refresh : dataRefreshRate.low,
				states : [
					{id: 'collected.dailyEnergyYield', name: 'Daily Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'daily output yield of the inverters'},
					{id: 'collected.dailyInputYield', name: 'Daily Portal Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'Try to recreate the yield from the portal'},
					{id: 'collected.dailySolarYield', name: 'Daily Solar Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'Riemann sum of input power with efficiency loss'},
					{id: 'collected.accumulatedEnergyYield', name: 'Accumulated Energy Yield', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.consumptionSum', name: 'Consumption Sum', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridExportStart', name: 'Grid Export Start Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridImportStart', name: 'Grid Export Start Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.consumptionStart', name: 'Consumption Start Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridExportToday', name: 'Grid Export Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.gridImportToday', name: 'Grid Import Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.consumptionToday', name: 'Consumption Today', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.totalCharge', name: 'Total Charge of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.totalDischarge', name: 'Total Discharge of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption'},
					{id: 'collected.currentDayChargeCapacity', name: 'Current Day Charge Capacity of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{id: 'collected.currentDayDischargeCapacity', name: 'Current Day Discharge Capacity of Battery', type: 'number', unit: 'kWh', role: 'value.power.consumption', desc: 'TBD' },
					{id: 'collected.SOC', name: 'State of battery capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'SOC'},
					{id: 'collected.ratedCapacity', name: 'Rated of battery Capacity', type: 'number', unit: 'Wh', role: 'value.capacity'}
				],
				fn : (inverters) => {
					let inYield = 0; //deprecated
					let solarYield = 0;
					let outYield = 0;
					let enYield = 0;
					let charge = 0;
					let disCharge = 0;
					let totalDisCharge = 0;
					let totalCharge = 0;
					let ratedCap = 0;
					let load = 0;
					for (const inverter of inverters) {
						outYield += this.stateCache.get(inverter.path+'.dailyEnergyYield')?.value;
						inYield += this.stateCache.get(inverter.path+'.derived.dailyInputYield')?.value; //deprecated
						solarYield += this.stateCache.get(inverter.path+'.derived.dailySolarYield')?.value;
						enYield += this.stateCache.get(inverter.path+'.accumulatedEnergyYield')?.value;
						charge += this.stateCache.get(inverter.path+'.battery.currentDayChargeCapacity')?.value;
						disCharge += this.stateCache.get(inverter.path+'.battery.currentDayDischargeCapacity')?.value;
						totalCharge += this.stateCache.get(inverter.path+'.battery.totalCharge')?.value;
						totalDisCharge += this.stateCache.get(inverter.path+'.battery.totalDischarge')?.value;
						if (this.stateCache.get(inverter.path+'.battery.ratedCapacity')?.value > 0) {
							load += this.stateCache.get(inverter.path+'.battery.ratedCapacity')?.value * this.stateCache.get(inverter.path+'.battery.SOC')?.value;
							ratedCap += this.stateCache.get(inverter.path+'.battery.ratedCapacity')?.value;
						}
					}
					this.stateCache.set('collected.dailyEnergyYield',outYield, {type: 'number'});
					this.stateCache.set('collected.dailyInputYield',inYield, {type: 'number'});  //deprecated
					this.stateCache.set('collected.dailySolarYield',solarYield, {type: 'number'});
					this.stateCache.set('collected.accumulatedEnergyYield',enYield,  {type: 'number'});
					const conSum = enYield + this.stateCache.get('meter.reverseActiveEnergy')?.value - this.stateCache.get('meter.positiveActiveEnergy')?.value;
					this.stateCache.set('collected.consumptionSum',conSum,  {type: 'number'});
					// compute export and import today
					this.stateCache.set('collected.gridExportToday',this.stateCache.get('meter.positiveActiveEnergy')?.value -
										this.stateCache.get('collected.gridExportStart')?.value,  {type: 'number'});
					this.stateCache.set('collected.gridImportToday',this.stateCache.get('meter.reverseActiveEnergy')?.value -
										this.stateCache.get('collected.gridImportStart')?.value,  {type: 'number'});
					// compute consumption today
					this.stateCache.set('collected.consumptionSum',this.stateCache.get('collected.accumulatedEnergyYield')?.value +
										this.stateCache.get('meter.reverseActiveEnergy')?.value -
										this.stateCache.get('meter.positiveActiveEnergy')?.value,  {type: 'number'});
					this.stateCache.set('collected.consumptionToday', this.stateCache.get('collected.consumptionSum')?.value -
										this.stateCache.get('collected.consumptionStart')?.value,  {type: 'number'});
					//compute battery
					this.stateCache.set('collected.totalCharge',totalCharge, {type: 'number'});
					this.stateCache.set('collected.totalDischarge',totalDisCharge, {type: 'number'});
					this.stateCache.set('collected.currentDayChargeCapacity',charge, {type: 'number'});
					this.stateCache.set('collected.currentDayDischargeCapacity',disCharge, {type: 'number'});
					this.stateCache.set('collected.ratedCapacity',ratedCap, {type: 'number'});
					this.stateCache.set('collected.SOC',Math.round(load/ratedCap), {type: 'number'});
				}
			}
		];


	}

	//state
	async initState(path, state) {
		//this.adapter.log.debug('[_initStat] path+id '+path+state.id);
		await this.adapter.extendObjectAsync(path+state.id, {
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

	async storeStates() {
		for (const stateEntry of this.stateCache.values()) {
			if (stateEntry.stored) continue;
			if (stateEntry.value !== null) {
				try {
					stateEntry.stored = true;
					await this.adapter.setStateAsync(stateEntry.id, {val: stateEntry.value , ack: true});
					this.adapter.log.debug(`Fetched ${stateEntry.id}, val=${stateEntry.value}`);
				} catch (err) {
					stateEntry.stored = false;
					this.adapter.log.warn(`Error while fetching ${stateEntry.id}, val=${stateEntry.value} err=${err.message}`);
				}
			}
		}
	}

	createInverterInstance(inverter,modelId = 0) {
		const handler = getDriverHandler(modelId);
		if (handler) {
			inverter.device = new handler(this,inverter, { modelId : modelId });
		}
	}

	//wrapper
	async updateStates(inverter,modbusClient,refreshRate,duration) {
		//Hat sich das Device ModelId geänder!
		//InverterInfo hat die modelId = 0
		if (inverter.device.info?.modelId !== 0) {
			const newModelId = inverter.device.info?.modelId;
			if ( newModelId > 0) {
				this.createInverterInstance(inverter,newModelId);
				this.adapter.log.debug(JSON.stringify(inverter.device.info));
				if (inverter.device.info?.modelId !== newModelId) {
					this.adapter.log.error('No Huawei device could be assigned for model id '+newModelId);
					this.adapter.log.info('Please create an issue: https://github.com/bolliy/ioBroker.sun2000/issues');
				}
			} else {
				this.adapter.log.error('No Huawei device could be identified.');
			}
		}
		return inverter.device.updateStates(modbusClient,refreshRate,duration);
	}


	//state
	async runPostProcessHooks(refreshRate) {
		for (const hook of this.postProcessHooks) {
			if (dataRefreshRate.compare(refreshRate,hook.refresh)) {
				for (const state of hook.states) {
					if (!hook.initState) {
						await this.initState('',state);
					}
					hook.fn(this.adapter.inverters);
				}
				hook.initState = true;
			}
		}
		this.storeStates(); //fire and forget
	}

	//state
	async _loadStates() {
		let state = await this.adapter.getStateAsync('collected.gridExportStart');
		this.stateCache.set('collected.gridExportStart',state?.val, {type : 'number', stored : true });
		state = await this.adapter.getStateAsync('collected.gridImportStart');
		this.stateCache.set('collected.gridImportStart',state?.val, {type : 'number', stored : true });
		state = await this.adapter.getStateAsync('collected.consumptionStart');
		this.stateCache.set('collected.consumptionStart',state?.val, {type : 'number', stored : true });
		for (const inverter of this.adapter.inverters) {
			state = await this.adapter.getStateAsync(inverter.path+'.derived.dailySolarYield');
			state?.val && inverter.device.solarSum.setStart(state.val,state.ts);
		}
	}

	//state
	CheckReadError(timeShift) {
		const now = new Date();
		for (const inverter of this.adapter.inverters) {
			for (const [i, reg] of inverter.device.registerFields.entries()) {
				if (reg.type == deviceType.meter && inverter.meter == false) continue; //not meter
				if (reg.type == deviceType.battery && inverter?.numberBatteryUnits == 0) continue; //battery
				if (reg.type == deviceType.batteryUnit2 && inverter?.numberBatteryUnits < 2) continue; //battery Unit2
				if (reg.states && reg.refresh) {
					//const lastread = reg['lastread'+inverter.index];
					const lastread = reg.lastread;
					const ret = {
						errno : 0,
						address : reg.address,
						info : reg.info,
						inverter : inverter.index,
						modbusID : inverter.modbusId,
						tc : now.getTime()
					};

					if (lastread) {
						ret.lastread = lastread;
					} else {
						ret.lastread = 0;
					}

					if (now.getTime()-ret.lastread > timeShift) {
						if (reg.lastread == 0 && i == 0) {
							ret.errno = 101;
							ret.message = 'Can\'t read data from inverter! Please check the configuration.';
						} else {
							ret.errno = 102;
							ret.message =  'Not all data can be read! Please inspect the sun2000 log.';
						}
						return ret ;
					}
				}
			}
		}
		return {message: 'No problems detected'};
	}

	// one minute before midnight - perform housekeeping actions
	//state
	async mitnightProcess () {
		// copy current export/import kWh - used to compute daily import/export in kWh
		this.stateCache.set('collected.gridExportStart',this.stateCache.get('meter.positiveActiveEnergy')?.value, {type : 'number'});
		this.stateCache.set('collected.gridImportStart',this.stateCache.get('meter.reverseActiveEnergy')?.value, {type : 'number'});
		// copy consumption Sum to Start for the next day
		this.stateCache.set('collected.consumptionStart',this.stateCache.get('collected.consumptionSum')?.value, {type : 'number'});
		this.storeStates(); //fire and forget
	}

}

module.exports = Registers;

