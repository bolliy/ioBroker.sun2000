'use strict';

const { deviceType, driverClasses, dataRefreshRate } = require(`${__dirname}/types.js`);
const { RiemannSum, StateMap } = require(`${__dirname}/tools.js`);
const getDriverHandler = require(`${__dirname}/drivers/index.js`);
const tools = require(`${__dirname}/tools.js`);

class Registers {
	constructor(adapterInstance) {
		this.adapter = adapterInstance;
		this.stateCache = new StateMap();

		this.externalSum = new RiemannSum();

		for (const device of this.adapter.devices) {
			//DriverInfo Instance or Sdongle
			const handler = getDriverHandler(device.driverClass);
			if (handler) {
				device.instance = new handler(this, device);
			}
		}
		//deleted deprecated states
		if (
			tools.existsState(this.adapter, `collected.usableSurplusPower`, (err, exists) => {
				if (!err && exists) {
					tools.deleteState(this.adapter, `collected.usableSurplusPower`, (err, deleted) => {
						if (!err && deleted) {
							this.adapter.logger.debug('Deleted deprecated state collected.usableSurplusPower');
						}
					});
				}
			})
		);

		this.postProcessHooks = [];
		this.inverterPostProcessHooks = [
			{
				refresh: dataRefreshRate.high,
				states: [
					{ id: 'collected.houseConsumption', name: 'House consumption', type: 'number', unit: 'kW', role: 'value.power', desc: 'Load power' },
					{ id: 'collected.activePower', name: 'Active power', type: 'number', unit: 'kW', role: 'value.power.active', desc: 'Power currently used' },
					{ id: 'collected.inputPower', name: 'Input power', type: 'number', unit: 'kW', role: 'value.power', desc: 'Power from solar' },
					{
						id: 'collected.inputPowerWithEfficiencyLoss',
						name: 'input power with efficiency loss',
						type: 'number',
						unit: 'kW',
						role: 'value.power',
						desc: 'Power from solar with efficiency loss',
					},
					{
						id: 'collected.chargeDischargePower',
						name: 'Charge/discharge power',
						desc: '(>0 charging, <0 discharging)',
						type: 'number',
						unit: 'kW',
						role: 'value.power',
					},
					/*
					{
						id: 'collected.usableSurplusPower',
						name: 'usable surplus power',
						type: 'number',
						unit: 'kW',
						role: 'value.power',
						desc: 'depreciated: Please use collected.surplus.usablePower instead',
					},
					*/
					{
						id: 'collected.surplus.power',
						name: 'surplus power',
						type: 'number',
						unit: 'kW',
						role: 'value.power',
						desc: 'Power from solar minus house consumption',
					},
					{
						id: 'collected.surplus.usablePower',
						name: 'usable surplus power',
						type: 'number',
						unit: 'kW',
						role: 'value.power',
						desc: 'Power from solar minus house consumption and usable battery power',
					},
					{ id: 'collected.externalPower', name: 'external power', type: 'number', unit: 'kW', role: 'value.power' },
				],
				fn: inverters => {
					let actPower = 0;
					let inPower = 0;
					let inPowerEff = 0;
					let chargeDischarge = 0;
					let ratedPower = 0;
					let maxDischargingPower = 0;

					function calcUsableSurplus() {
						let surplusPower = 0;
						let usableSurplusPower = 0;

						if (this.adapter.control) {
							surplusPower = feedinPower;

							const minSoc = this.adapter.control.get('usableSurplus.minSoc')?.value ?? 0;
							let bufferSoc = this.adapter.control.get('usableSurplus.bufferSoc')?.value ?? 0;
							const residualPower = this.adapter.control.get('usableSurplus.residualPower')?.value ?? 0;
							const soc = this.stateCache.get('collected.SOC')?.value ?? 0;
							const allowNegativeValue = this.adapter.control.get('usableSurplus.allowNegativeValue')?.value ?? false;
							const hysterese = this.adapter.control.get('usableSurplus.bufferHysteresis')?.value ?? 0;
							// discharge power is negative
							if (chargeDischarge < 0) {
								surplusPower += chargeDischarge;
							}

							let threshold = hysterese / 2;
							if (this.bufferOn) {
								threshold = -threshold;
							}

							if (soc > minSoc) {
								// charge power is positive - Battery is charging
								if (chargeDischarge > 0) surplusPower += chargeDischarge;

								if (bufferSoc === 0 || soc < bufferSoc + threshold) {
									surplusPower -= residualPower / 1000;
								}
							}

							usableSurplusPower = surplusPower;
							// Using battery power to calculate usable surplus power
							if (bufferSoc > 0) {
								if (soc > minSoc && soc >= bufferSoc + threshold) {
									this.bufferOn = true;
									let bufferPower = this.adapter.control.get('usableSurplus.bufferPower')?.value ?? 0;
									if (bufferPower > maxDischargingPower) {
										bufferPower = maxDischargingPower;
									}
									usableSurplusPower += bufferPower / 1000;
								} else {
									this.bufferOn = false;
								}
							} else {
								this.bufferOn = false;
							}

							if (surplusPower > ratedPower) {
								surplusPower = ratedPower;
							}

							if (usableSurplusPower > ratedPower) {
								usableSurplusPower = ratedPower;
							}
							if (!allowNegativeValue) {
								if (surplusPower < 0.01) surplusPower = 0;
								if (usableSurplusPower < 0.01) usableSurplusPower = 0;
							}

							this.adapter.logger.debug(
								`### Caculate usableSurplus power ${surplusPower} bufferOn ${this.bufferOn} soc ${soc} minSoc ${minSoc} bufferSoc ${bufferSoc} threshold ${hysterese / 2}`,
							);
						}
						return [surplusPower, usableSurplusPower];
					}

					for (const inverter of inverters) {
						if (inverter.driverClass != driverClasses.inverter) {
							continue;
						}
						actPower += this.stateCache.get(`${inverter.path}.activePower`)?.value ?? 0;
						inPower += this.stateCache.get(`${inverter.path}.inputPower`)?.value ?? 0;
						inPowerEff += this.stateCache.get(`${inverter.path}.derived.inputPowerWithEfficiencyLoss`)?.value ?? 0;
						chargeDischarge += this.stateCache.get(`${inverter.path}.battery.chargeDischargePower`)?.value ?? 0;
						ratedPower += this.stateCache.get(`${inverter.path}.info.ratedPower`)?.value ?? 0;
						maxDischargingPower += this.stateCache.get(`${inverter.path}.battery.maximumDischargingPower`)?.value ?? 0;
					}

					const feedinPower = this.stateCache.get('meter.derived.feed-inPower')?.value ?? 0;

					const extPower = this.adapter.control.get('externalPower')?.value ?? 0;
					this.externalSum.add(extPower); //riemann Sum

					//Zu geringe Erzeugerenegie
					let houseConsum = actPower - feedinPower + extPower;
					if (houseConsum < 0) {
						houseConsum = 0;
					}
					//Überschuss (Differenz)
					const surplusArray = calcUsableSurplus.bind(this)();

					this.stateCache.set('collected.inputPower', inPower, { type: 'number', renew: true });
					this.stateCache.set('collected.inputPowerWithEfficiencyLoss', inPowerEff, { type: 'number' });
					this.stateCache.set('collected.activePower', actPower, { type: 'number', renew: true });
					this.stateCache.set('collected.houseConsumption', houseConsum, { type: 'number' });
					this.stateCache.set('collected.chargeDischargePower', chargeDischarge, { type: 'number' });
					/*
					this.stateCache.set('collected.usableSurplusPower', surplusArray[1], {
						type: 'number',
					});
					*/
					this.stateCache.set('collected.surplus.power', surplusArray[0], {
						type: 'number',
					});
					this.stateCache.set('collected.surplus.usablePower', surplusArray[1], {
						type: 'number',
					});

					this.stateCache.set('collected.externalPower', extPower, { type: 'number' });
				},
			},
			{
				refresh: dataRefreshRate.low,
				states: [
					{
						id: 'collected.dailyEnergyYield',
						name: 'Daily energy yield',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
						desc: 'daily energy yield of the inverters',
					},
					{
						id: 'collected.dailyInputYield',
						name: 'Daily input yield',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
						desc: 'yield from the portal',
					},
					{
						id: 'collected.dailySolarYield',
						name: 'Daily solar yield',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
						desc: 'Riemann sum of input power with efficiency loss',
					},
					{ id: 'collected.accumulatedEnergyYield', name: 'Accumulated energy yield', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.consumptionSum', name: 'Consumption sum', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.gridExportStart', name: 'Grid export start today', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.gridImportStart', name: 'Grid import start today', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.consumptionStart', name: 'Consumption start today', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.gridExportToday', name: 'Grid export today', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.gridImportToday', name: 'Grid import today', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.consumptionToday', name: 'Consumption today', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.totalCharge', name: 'Total charge of battery', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{ id: 'collected.totalDischarge', name: 'Total discharge of battery', type: 'number', unit: 'kWh', role: 'value.power.consumption' },
					{
						id: 'collected.currentDayChargeCapacity',
						name: 'Current day charge capacity of battery',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
					},
					{
						id: 'collected.currentDayDischargeCapacity',
						name: 'Current day discharge capacity of battery',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
						desc: '',
					},
					{ id: 'collected.SOC', name: 'State of battery capacity', type: 'number', unit: '%', role: 'value.battery', desc: 'SOC' },
					{ id: 'collected.ratedCapacity', name: 'Rated of battery capacity', type: 'number', unit: 'Wh', role: 'value.capacity' },
					{
						id: 'collected.dailyExternalYield',
						name: 'daily external yield',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
						desc: 'Riemann sum of external power',
					},
					/*
					{
						id: 'collected.dailyActiveEnergy',
						name: 'Active Energy today',
						type: 'number',
						unit: 'kWh',
						role: 'value.power.consumption',
						desc: 'Amount of Riemann sum of sum of active power',
					},
					*/
				],
				fn: inverters => {
					let inYield = 0;
					let solarYield = 0;
					let outYield = 0;
					let enYield = 0;
					let activeEnergy = 0;
					let charge = 0;
					let disCharge = 0;
					let totalDisCharge = 0;
					let totalCharge = 0;
					let ratedCap = 0;
					let load = 0;
					let feedinEnergy;
					let supplyFromGrid;

					for (const inverter of inverters) {
						if (inverter.driverClass != driverClasses.inverter) {
							continue;
						}
						outYield += this.stateCache.get(`${inverter.path}.dailyEnergyYield`)?.value ?? 0;
						inYield += this.stateCache.get(`${inverter.path}.derived.dailyInputYield`)?.value;
						solarYield += this.stateCache.get(`${inverter.path}.derived.dailySolarYield`)?.value;
						enYield += this.stateCache.get(`${inverter.path}.accumulatedEnergyYield`)?.value;
						activeEnergy += this.stateCache.get(`${inverter.path}.derived.dailyActiveEnergy`)?.value ?? 0;
						if (this.stateCache.get(`${inverter.path}.battery.ratedCapacity`)?.value > 0) {
							charge += this.stateCache.get(`${inverter.path}.battery.currentDayChargeCapacity`)?.value ?? 0;
							disCharge += this.stateCache.get(`${inverter.path}.battery.currentDayDischargeCapacity`)?.value ?? 0;
							totalCharge += this.stateCache.get(`${inverter.path}.battery.totalCharge`)?.value ?? 0;
							totalDisCharge += this.stateCache.get(`${inverter.path}.battery.totalDischarge`)?.value ?? 0;
							load +=
								this.stateCache.get(`${inverter.path}.battery.ratedCapacity`)?.value *
								this.stateCache.get(`${inverter.path}.battery.SOC`)?.value;
							ratedCap += this.stateCache.get(`${inverter.path}.battery.ratedCapacity`)?.value;
						}
					}
					//this.stateCache.set('collected.dailyActiveEnergy', activeEnergy, { type: 'number' });
					this.stateCache.set('collected.dailyExternalYield', this.externalSum.sum, { type: 'number' }); //of externalPower
					this.stateCache.set('collected.dailyEnergyYield', outYield, { type: 'number' });
					this.stateCache.set('collected.dailyInputYield', inYield, { type: 'number' });
					this.stateCache.set('collected.dailySolarYield', solarYield, { type: 'number' });
					this.stateCache.set('collected.accumulatedEnergyYield', enYield, { type: 'number' });
					const sign = this.stateCache.get('meter.derived.signConventionForPowerFeed-in')?.value ?? 1;
					if (sign === -1) {
						//Emma Meter Power is positive when power is taken from grid
						//Emma Meter Power is negative when power is feed in to grid
						feedinEnergy = this.stateCache.get('meter.reverseActiveEnergy')?.value ?? 0;
						supplyFromGrid = this.stateCache.get('meter.positiveActiveEnergy')?.value ?? 0;
					} else {
						feedinEnergy = this.stateCache.get('meter.positiveActiveEnergy')?.value ?? 0;
						supplyFromGrid = this.stateCache.get('meter.reverseActiveEnergy')?.value ?? 0;
					}
					//stimmt leider nicht genau - bleibt aber erstmal bestehen
					const conSum = enYield + supplyFromGrid - feedinEnergy;
					this.stateCache.set('collected.consumptionSum', conSum, { type: 'number' });
					// compute export and import today
					this.stateCache.set('collected.gridExportToday', feedinEnergy - this.stateCache.get('collected.gridExportStart')?.value, {
						type: 'number',
					});
					this.stateCache.set('collected.gridImportToday', supplyFromGrid - this.stateCache.get('collected.gridImportStart')?.value, {
						type: 'number',
					});
					//consumption today
					this.stateCache.set(
						'collected.consumptionToday',
						activeEnergy +
							this.externalSum.sum +
							this.stateCache.get('collected.gridImportToday')?.value -
							this.stateCache.get('collected.gridExportToday')?.value,
						{ type: 'number' },
					);
					//compute battery
					this.stateCache.set('collected.totalCharge', totalCharge, { type: 'number' });
					this.stateCache.set('collected.totalDischarge', totalDisCharge, { type: 'number' });
					this.stateCache.set('collected.currentDayChargeCapacity', charge, { type: 'number' });
					this.stateCache.set('collected.currentDayDischargeCapacity', disCharge, { type: 'number' });
					this.stateCache.set('collected.ratedCapacity', ratedCap, { type: 'number' });
					this.stateCache.set('collected.SOC', Math.round(load / ratedCap), { type: 'number' });
				},
			},
		];

		//only Inverter
		this.postProcessHooks.push.apply(this.postProcessHooks, this.inverterPostProcessHooks);
		this._loadStates();
	}

	//state
	async initState(path, state) {
		//this.adapter.log.debug('[_initStat] path+id '+path+state.id);
		await this.adapter.extendObject(path + state.id, {
			type: 'state',
			common: {
				name: state.name,
				type: state.type,
				role: state.role,
				unit: state.unit,
				desc: state.desc,
				read: true,
				write: false,
			},
			native: {},
		});
	}

	async storeStates() {
		for (const stateEntry of this.stateCache.values()) {
			//if (stateEntry?.storeType === storeType.never) continue;
			if (stateEntry.stored) {
				continue;
			}
			//if (stateEntry?.storeType !== storeType.always && stateEntry.stored) continue;
			if (stateEntry.value !== null) {
				try {
					stateEntry.stored = true;
					await this.adapter.setState(stateEntry.id, { val: stateEntry.value, ack: true });
					this.adapter.logger.debug(`Fetched ${stateEntry.id}, val=${stateEntry.value}`);
				} catch (err) {
					stateEntry.stored = false;
					this.adapter.logger.warn(`Error while fetching ${stateEntry.id}, val=${stateEntry.value} err=${err.message}`);
				}
			}
		}
	}

	/**
	 * Updates the states of a given device using the specified Modbus client.
	 *
	 * This function initializes the device instance if it is not already initialized.
	 * If the device instance exists and has a newInstance method, it refreshes the
	 * instance. It then calls the updateStates method on the device instance to update
	 * its states. Logs an error if no device instance has been initialized.
	 *
	 * @param {object} device - The device object containing the instance and driverClass.
	 * @param {ModbusClient} modbusClient - The Modbus client used for communication.
	 * @param {string} refreshRate - The rate at which data should be refreshed.
	 * @param {number} duration - The duration for which the states should be updated.
	 * @returns {Promise<number>} - Returns a promise that resolves to the number of states updated.
	 */
	async updateStates(device, modbusClient, refreshRate, duration) {
		//this.adapter.log.debug('### DeviceInfo: '+device.index+' '+JSON.stringify(device.instance.info));
		if (!device.instance) {
			const handler = getDriverHandler(device.driverClass);
			if (handler) {
				device.instance = new handler(this, device);
			}
		}
		if (device.instance) {
			// If the device instance has a newInstance method, call it to refresh the instance
			if (device.instance.newInstance) {
				this.adapter.logger.debug(`DeviceInfo: ${device.index} ${JSON.stringify(device.instance.info)}`);
				device.instance = device.instance.newInstance;
				this.adapter.logger.debug(`Device: ${device.index} ${JSON.stringify(device.instance.info)}`);
			}
			return device.instance.updateStates(modbusClient, refreshRate, duration);
		}
		this.adapter.logger.error(
			`No device instance for has been initialized! {index:${device?.index}, driverClass:${device?.driverClass}, modbusID:${device?.modbusId}}`,
		);
		return 0;
	}

	//state
	async runPostProcessHooks(refreshRate) {
		for (const hook of this.postProcessHooks) {
			if (dataRefreshRate.compare(refreshRate, hook.refresh)) {
				for (const state of hook.states) {
					if (!hook.initState) {
						await this.initState('', state);
					}
				}
				hook.initState = true;
				hook.fn(this.adapter.devices);
			}
		}
		this.storeStates(); //fire and forget
	}

	//state
	async _loadStates() {
		let state = await this.adapter.getState('collected.gridExportStart');
		this.stateCache.set('collected.gridExportStart', state?.val, { type: 'number', stored: true });
		state = await this.adapter.getState('collected.gridImportStart');
		this.stateCache.set('collected.gridImportStart', state?.val, { type: 'number', stored: true });
		state = await this.adapter.getState('collected.consumptionStart');
		this.stateCache.set('collected.consumptionStart', state?.val, { type: 'number', stored: true });
		state = await this.adapter.getState('collected.dailyExternalYield');
		this.stateCache.set('collected.dailyExternalYield', state?.val, { type: 'number', stored: true });
		this.externalSum.setStart(state?.val, state?.ts);
	}

	//state
	CheckReadError(timeShift) {
		const now = new Date();
		for (const device of this.adapter.devices) {
			if (device.instance) {
				for (const [i, reg] of device.instance.registerFields.entries()) {
					if (!device.instance.modbusAllowed) {
						continue;
					} //standby
					if (reg.type == deviceType.meter && !device?.meter) {
						continue;
					} //not meter
					if (reg.type == deviceType.gridPowerControl && !device?.meter) {
						continue;
					} //power control v0.8.x

					if (reg.checkIfActive && !reg.checkIfActive()) {
						continue;
					} //NEW, PATH

					if (reg.states && reg.refresh) {
						const lastread = reg.lastread;
						const ret = {
							errno: 0,
							address: reg.address,
							info: reg.info,
							inverter: device.index,
							modbusID: device.modbusId,
							tc: now.getTime(),
						};

						if (lastread) {
							ret.lastread = lastread;
						} else {
							ret.lastread = 0;
						}

						if (now.getTime() - ret.lastread > timeShift) {
							if (reg.lastread == 0 && i == 0) {
								ret.errno = 101;
								ret.message = "Can't read data from device! Please check the configuration.";
							} else {
								ret.errno = 102;
								ret.message = 'Not all data can be read! Please inspect the adapter log.';
							}
							return ret;
						}
					}
				}
			}
		}
		return { message: 'No problems detected' };
	}

	// one minute before midnight - perform housekeeping actions
	//state
	async mitnightProcess() {
		// copy current export/import kWh - used to compute daily import/export in kWh
		const sign = this.stateCache.get('meter.derived.signConventionForPowerFeed-in')?.value ?? 1;
		if (sign === -1) {
			this.stateCache.set('collected.gridExportStart', this.stateCache.get('meter.reverseActiveEnergy')?.value ?? 0, { type: 'number' });
			this.stateCache.set('collected.gridImportStart', this.stateCache.get('meter.positiveActiveEnergy')?.value ?? 0, { type: 'number' });
		} else {
			this.stateCache.set('collected.gridExportStart', this.stateCache.get('meter.positiveActiveEnergy')?.value ?? 0, { type: 'number' });
			this.stateCache.set('collected.gridImportStart', this.stateCache.get('meter.reverseActiveEnergy')?.value ?? 0, { type: 'number' });
		}
		this.externalSum.reset(); //reset for next day
		this.stateCache.set('collected.dailyExternalYield', 0, { type: 'number' });
		// copy consumption Sum to Start for the next day
		this.stateCache.set('collected.consumptionStart', this.stateCache.get('collected.consumptionSum')?.value ?? 0, { type: 'number' });
		for (const device of this.adapter.devices) {
			if (device.instance.mitnightProcess) {
				await device.instance.mitnightProcess();
			}
		}
		this.storeStates(); //fire and forget
	}
}

module.exports = Registers;
