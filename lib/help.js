'use strict';

/**
 * The answer of the message "help": what the instance does and answers, written for an AI agent
 * (e.g. ioBroker.pi-agent, or the MCP server with `send_to`) and for script authors.
 * Keep it in sync with `onMessage` in main.js and with the states created by the adapter.
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
It can also change a few settings of the surplus regulation by writing states. Reading is done by reading states; the only message is help.
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
Battery: collected.SOC (%, state of charge), collected.ratedCapacity (Wh).
Statistics (JSON strings): statistics.jsonToday (today incl. selfSufficiency and selfConsumption in %), statistics.jsonHourly / jsonDaily / jsonWeekly / jsonMonthly / jsonAnnual (arrays of {from, to, <key>: {value, unit}}).
Single devices (info, battery, grid, PV strings, alarms) are below their device path in the object tree (e.g. ${ns}.inverter.0.*); name and unit are in the object. Alarms: <device>.derived.alarmJSON.

Control: write with ack false. Done = the adapter acknowledges it (ack true) after it applied the value; out-of-range values are clamped.
- control.usableSurplus.minSoc (%, 0-100): the battery is only counted as surplus above this SoC
- control.usableSurplus.bufferSoc (%, 0-100, 0 = off): above this SoC the battery serves as buffer
- control.usableSurplus.bufferPower (W, 0-5000): discharge power taken from the buffer
- control.usableSurplus.residualPower (W, -1000 to 1000): target operating point of the surplus regulation
- control.usableSurplus.bufferHysteresis (%, 0-10)
- control.usableSurplus.allowNegativeValue (boolean): allow negative usable surplus
- control.externalPower (kW, >= 0): external production, counted into consumption
More control states act on the hardware (battery working mode, charge and discharge limits, feed-in limit, time-of-use windows, EMMA): <device>.control.*, ${ns}.emma.control.*, ${ns}.inverter.x.control.* . Read the wiki page of the state before you write one.

How to act:
- Which device: if more than one inverter exists and the user names none, ask which one; do not guess. Use the states under collected for the whole system.
- Never guess state names; list the object tree below ${ns} and read the object (name, unit, role, desc) first.
- Mind the signs: chargeDischargePower >0 = charging, meter.derived.feed-inPower >0 = feeding in.
- Write control states only on the user's request. Say which state you set to which value and ask first for anything that changes the hardware (working mode, limits, feed-in); wrong values can stop charging or cost money.
- After a write, check that it was acknowledged (ack true, may take a few polling intervals): that means sent to the device, not yet effective. Then read the value back before you say it is done. If it stays unacknowledged, read the log of the instance with level warn: it says why (the adapter drops an event after two failed tries). Do not write again in a loop.
- At night or in standby values may be 0 or stale; check ${ns}.info.connection and the log before you say something is broken.
- Tell values with unit and sensible rounding: "House uses 1.2 kW, PV delivers 3.4 kW, the battery charges with 1.8 kW (SoC 64 %)". Small kW values as W.
- Do not poll faster than the adapter updates (about every 5 s for power).`;

	return { help, commands: COMMANDS.map(c => ({ command: c.command, write: c.write })) };
}

module.exports = { getHelp, COMMANDS };
