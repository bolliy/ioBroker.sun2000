## Example Vis

The picture below shows an example vis showing the energy flow between the different components. In the part, a float diagram shows the battery charge status, power production and power consumption over the last 48 hours. 

![Screenshot](./images/SunLuna2000Vis-v2.png)

The following states are used in the Vis example:

- `Yield Today`: sun2000.0.collected.dailyInputYield
- `Bat Charge`: sun2000.0.collected.currentDayChargeCapacity
- `Bat Discharge`: sun2000.0.collected.currentDayDischargeCapacity
- `Battery Percent`: sun2000.0.collected.SOC
- Solar panel, `PV power` : sun2000.0.collected.inputPower
- Solar panel, `Solar Yield` : sun2000.0.collected.dailySolarYield
- `Power to and from battery` : sun2000.0.collected.chargeDischargePower
- `Power to and from grid`: sun2000.0.meter.activePower
- `Power` consumption house: sun2000.0.collected.houseConsumption
- Daily power `consumption` of house`: sun2000.0.collected.consumptionToday
- Grid `Export Today`: sun2000.0.collected.gridExportToday
- Grid `Import Today`: sun2000.0.collected.gridImportToday

The following additional states are available for output: 

- Inverter Device Status: sun2000.0.inverter.0.derived.deviceStatus (e.g 'On-grid', 'Standby: detecting irradiation')
- Battery Working Mode: sun2000.0.inverter.0.battery.workingModeSettings (e.g. 2: 'Maximise Self Consumption')
- Battery Running Status: sun2000.0.inverter.0.battery.runningStatus (e.g. 'running', 'sleep mode')
- Inverter Temperature: sun2000.0.inverter.0.internalTemperature (temperature or '0' if in standby)
- Battery Unit Temperature: sun2000.0.inverter.0.battery.unit.1.batteryTemperature (temperature or '0' if in standby)
- Grid Frequency: sun2000.0.meter.gridFrequency 
