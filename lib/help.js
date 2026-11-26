'use strict';

/**
 * The answer of the message "help": what the instance does and answers, written for an AI agent
 * (e.g. ioBroker.pi-agent, or the MCP server with `send_to`) and for script authors.
 * Keep it in sync with `onMessage` in main.js, with the states created by the adapter and with the wiki.
 */

const WIKI = 'https://github.com/bolliy/ioBroker.sun2000/wiki';

/**
 * The commands the instance answers. write: true if the command has an effect.
 */
const COMMANDS = [
	{ command: 'help', write: false },
	// TODO: add further sendTo commands of the adapter here (e.g. the flexcharts message)
];

/**
 * @param {string} [namespace] e.g. 'sun2000.0'
 * @returns {{help: string, commands: {command: string, write: boolean}[]}} answer of the message "help"
 */
function getHelp(namespace) {
	const ns = namespace || 'sun2000.0';
	const help = `ioBroker.sun2000: reads Huawei SUN2000 inverters, LUNA2000 batteries, power meters, EMMA and SmartLogger/Smart Dongle via Modbus TCP.
An agent can tell how much the house consumes, the PV produces, how the battery is charged or discharged, whether the grid is feeding in or drawing, and the energy of today and in total.
It can also change settings of the surplus regulation, the battery, time-of-use windows and the grid feed-in limit by writing states. Reading is done by reading states; the only message is help.
The full documentation (German/English, far more detail than here, all device states) is in the wiki: ${WIKI}

Commands (sendTo ${ns}; errors answer {error, reason?}):
- help: this text; answer {help, commands: [{command, write}]}. Changes nothing.

States (${ns}.*): all values are already scaled to the unit given. Not every state exists on every setup (without battery or meter there are no battery or meter states).
Live power in kW (updated every few seconds):
- collected.inputPower: PV power of all inverters
- collected.activePower: AC output power of all inverters
- collected.houseConsumption: house consumption (calculated, never below 0)
- collected.chargeDischargePower: battery power, >0 charging, <0 discharging
- meter.derived.feed-inPower: grid power, >0 feeding into the grid, <0 drawing from the grid
- collected.surplus.power: PV surplus; collected.surplus.usablePower: surplus a consumer may use (depends on the control.usableSurplus.* settings)
- collected.externalPower: external production, entered by the user in control.externalPower
Energy in kWh (updated slower):
- collected.dailySolarYield: PV yield today; collected.dailyEnergyYield: inverter yield today
- collected.consumptionToday: consumption today
- collected.gridExportToday, collected.gridImportToday: grid export and import today
- collected.currentDayChargeCapacity, collected.currentDayDischargeCapacity: battery charge and discharge today
- collected.accumulatedEnergyYield: lifetime yield; collected.totalCharge, collected.totalDischarge: lifetime battery charge and discharge
Daily energy sums in kWh, calculated by the adapter by integrating the live power values over time (Riemann sum), restart at 0 at midnight, survive an adapter restart. They are more finely resolved than the register values above and can differ slightly from the Huawei portal:
- collected.sumDaily.houseConsumption: house consumption today
- collected.sumDaily.inputPower: PV energy today (DC side of all inverters)
- collected.sumDaily.activePower: AC energy of all inverters today
- collected.sumDaily.chargePower, collected.sumDaily.dischargePower: energy charged into / discharged from the battery today
- collected.sumDaily.feed-inPower: energy fed into the grid today
- collected.sumDaily.feed-outPower: energy drawn from the grid today (note the name: feed-out = from the grid)
Battery: collected.SOC (%, state of charge), collected.ratedCapacity (Wh).
Statistics (JSON strings): statistics.jsonToday (today incl. selfSufficiency and selfConsumption in %), statistics.jsonHourly / jsonDaily / jsonWeekly / jsonMonthly / jsonAnnual (arrays of {from, to, <key>: {value, unit}}).
Single devices (info, battery, grid, PV strings, alarms) are below their device path in the object tree (e.g. ${ns}.inverter.0.*); name and unit are in the object. Alarms: <device>.derived.alarmJSON.

Control: write with ack false. Done = the adapter acknowledges it (ack true) after it wrote the value to the device; out-of-range values are clamped. The adapter processes at most two writes per cycle.
Surplus regulation (adapter internal, no hardware is changed):
- control.usableSurplus.minSoc (%, 0-100): the battery is only counted as surplus above this SoC
- control.usableSurplus.bufferSoc (%, 0-100, 0 = off): above this SoC the battery serves as buffer
- control.usableSurplus.bufferPower (W, 0-5000): discharge power taken from the buffer
- control.usableSurplus.residualPower (W, -1000 to 1000): target operating point of the surplus regulation
- control.usableSurplus.bufferHysteresis (%, 0-10)
- control.usableSurplus.allowNegativeValue (boolean): allow negative usable surplus
- control.externalPower (kW, >= 0): external production, counted into consumption

Battery control (changes the hardware; ${ns}.inverter.x.control.battery.*, x = index of the inverter 0..4; with an EMMA instead ${ns}.emma.control.battery.*). Detailed scenarios: ${WIKI}/Battery-control
- The battery must be in RUNNING mode, otherwise writes fail (wake it up first: ${WIKI}/Speichersystem-aufwecken-(wake-up-Luna)). Without a detected battery the write is discarded with a warning.
- workingModeSettings (0-5, default 2 for invalid values): 2 = maximise self consumption, 5 = time of use (TOU). Do not use other values unless the user asks.
- chargeFromGridFunction (boolean): allow charging from the grid / from AC side (e.g. a second PV generator or a cheap tariff).
- powerOfChargeFromGrid (W, up to maximumChargePower): charge power from the grid. gridChargeCutoffSOC (%, 20-100): grid charging stops at this SoC.
- maximumChargingPower, maximumDischargingPower (W, up to the battery maximum): limit the charge / discharge power, e.g. to keep a wallbox from emptying the house battery.
- chargingCutoffCapacity (%, 90-100, deprecated): stop charging at this SoC. dischargeCutoffCapacity (%, 0-20): stop discharging at this SoC.
- backupPowerSOC (%, 0-100, LG battery min 12): minimum SoC reserved for backup power; it has priority over dischargeCutoffCapacity.
- targetSOC (%, 0-100).
- Charge from the grid, typical sequence: chargeFromGridFunction = true, workingModeSettings = 5 (TOU windows needed, see below), optionally powerOfChargeFromGrid and gridChargeCutoffSOC. To stop: chargeFromGridFunction = false, workingModeSettings = 2.
- Charge from AC side only (no tariff): chargeFromGridFunction = true and workingModeSettings = 2.
EMMA (${ns}.emma.control.battery.*; wiki ${WIKI}/Emma:-Battery-control): ESSControlMode (2 = maximise self consumption, 5 = TOU), tou.maximumPowerForChargingFromGrid (kW, 0-50), tou.preferredUseOfSurplusPvPower (boolean). Charging from the AC side must first be enabled in the Huawei app (no Modbus register for it). Start grid charging: ESSControlMode = 5 and a charge power; end it: ESSControlMode = 2.

Time of use windows (TOU): ${WIKI}/Time-of-Use-control-(TOU)
- State tou.chargeDischargeTimeWindows (string, JSON) at ${ns}.inverter.x.control.battery.tou.* and ${ns}.emma.control.battery.tou.*. Only active when workingModeSettings / ESSControlMode is 5. An EMMA has its own TOU that can override the inverters' settings.
- Value: JSON array, at most 14 windows: [{"start":"00:00","end":"06:00","mode":"charge","days":["Mon","Tue","Wed","Thu","Fri"]}, {"start":"17:00","end":"20:00","mode":"discharge","days":["Sat","Sun"]}]
- start and end are HH:MM (24 h), start must be before end (no window across midnight: split it). mode: charge | discharge. days: Mon Tue Wed Thu Fri Sat Sun (full English names are accepted).
- Overlapping windows are not checked, the Huawei firmware resolves them: avoid them.
- Writing replaces all windows. An invalid value is rejected with one warning in the log (no ack). Read the current value first and change only what the user wants.

Grid feed-in limit (export control, changes the hardware; ${ns}.inverter.x.control.grid.* and ${ns}.emma.control.grid.*): ${WIKI}/Begrenzung-Netzeinspeisung-(Export-Control)
- Only writable if a power meter is configured for the device.
- grid.activePowerControlMode: 0 = unlimited (default), 5 = zero power feed-in, 6 = limited in kW, 7 = limited in %. Inverter also accepts 1 = DI active scheduling.
- grid.maximumFeedGridPower (kW, up to 100; -1 = not set): maximum feed-in for mode 6. grid.maximumFeedGridPower_percent (%, 0-100): for mode 7.
- Set the limit value first and the mode last. Never set the limit to 0 or a mode other than 0 without the user knowing: it curtails the PV system and costs yield. With an EMMA the limits belong to the EMMA.
- grid.scheduling.* (active power derating) is a separate, stronger intervention, see ${WIKI}/Wirkleistungsbegrenzung-(Active-Power-Derating).

How to act:
- Which device: if more than one inverter exists and the user names none, ask which one; do not guess. Use the states under collected for the whole system.
- Never guess state names; list the object tree below ${ns} and read the object (name, unit, role, desc) first.
- Mind the signs: chargeDischargePower >0 = charging, meter.derived.feed-inPower >0 = feeding in.
- Write control states only on the user's request. Say which state you set to which value and ask first for anything that changes the hardware (battery control, TOU windows, feed-in limit); wrong values can stop charging, empty the battery or cost money. Read the wiki page of the topic before you write.
- Change one thing at a time, note the previous value and tell it to the user so it can be restored.
- After a write, check that it was acknowledged (ack true, may take a few polling intervals): that means sent to the device, not yet effective. Then read the value back (battery states in the object tree show what the device reports) before you say it is done. If it stays unacknowledged, read the log of the instance with level warn: it says why (the adapter drops an event after two failed tries). Do not write again in a loop.
- At night or in standby values may be 0 or stale; check ${ns}.info.connection and the log before you say something is broken.
- Tell values with unit and sensible rounding: "House uses 1.2 kW, PV delivers 3.4 kW, the battery charges with 1.8 kW (SoC 64 %)". Small kW values as W.
- Do not poll faster than the adapter updates (about every 5 s for power).`;

	return { help, commands: COMMANDS.map(c => ({ command: c.command, write: c.write })) };
}

module.exports = { getHelp, COMMANDS };
