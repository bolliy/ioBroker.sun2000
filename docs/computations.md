# Computations

The computations implemented are described by this diagram:

![Screen](./images/HuaweiSunLuna2000-v2.png)

The following variables are used:

- Input power: sun2000.0.collected.inputPower 
- Charge capacity daily: sun2000.0.collected.currentDayChargeCapacity
- Charge capacity total: sun2000.0.collected.totalCharge
- SOC: sun2000.0.collected.SOC
- Daily solar yield: sun2000.0.collected.dailySolarYield
- Grid total - positive active Energy: sun2000.0.meter.positiveActiveEnergy
- Grid total - reverse active Energy: sun2000.0.meter.reverseActiveEnergy
- Grid active power: sun2000.0.meter.activePower
- active power: sun2000.0.meter.activePower
- Energy yield accumulated: sun2000.0.collected.accumulatedEnergyYield
- Energy yield daily: sun2000.0.collected.dailyEnergyYield
- Daily input yield: sun2000.0.collected.dailyInputYield
- CommsumptionSum: sun2000.0.collected.consumptionSum
- Self-consumption: is not saved in state
- Self-Sufficiency: is not saved in the state







- Bat Discharge: javascript.0.Solarpower.Huawei.Inverter.1.Batterystack.1.CurrentDayDischargeCapacity
- Battery Percent: javascript.0.Solarpower.Huawei.Inverter.1.Battery.SOC, darunter javascript.0.Solarpower.Derived.BatteryOverview
- Solar panel, actual power **(NEW)**: javascript.0.Solarpower.Derived.PanelPower (this is now the raw panel power, i.e., voltage times current of panel)
- Solar panel voltage and current: javascript.0.Solarpower.Huawei.Inverter.1.String.1_Voltage, javascript.0.Solarpower.Huawei.Inverter.1.String.1_Current
- Power to and from battery **(NEW)**: javascript.0.Solarpower.Derived.BatteryCharge (now takes into account when inverter is in standby mode)
- Direction of arrow at battery: javascript.0.Solarpower.Derived.IsBatteryLoading (arrow is directed left or right)
- Power to and from grid: javascript.0.Solarpower.Huawei.Meter.ActivePower
- Direction of grid arrow: javascript.0.Solarpower.Derived.IsGridExporting
- Power consumption house: javascript.0.Solarpower.Derived.HouseConsumption
- Daily power consumption of house: javascript.0.Solarpower.Derived.ConsumptionToday
- Power Export Today: javascript.0.Solarpower.Derived.GridExportToday
- Import Today: javascript.0.Solarpower.Derived.GridImportToday


