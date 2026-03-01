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
- `Grid active power`: sun2000.0.meter.derived.feed-inPower
- `Power` consumption house: sun2000.0.collected.houseConsumption
- Daily `consumption` of house`: sun2000.0.collected.consumptionToday
- Grid `Export Today`: sun2000.0.collected.gridExportToday
- Grid `Import Today`: sun2000.0.collected.gridImportToday

The following additional states are available for output: 

- `Inverter Device Status`: sun2000.0.inverter.0.derived.deviceStatus (e.g 'On-grid', 'Standby: detecting irradiation')
- `Battery Working Mode`: sun2000.0.inverter.0.battery.workingModeSettings (e.g. 2: 'Maximise Self Consumption')
- `Battery Running Status`: sun2000.0.inverter.0.battery.derived.runningStatus (e.g. 'running', 'sleep mode')
- `Inverter Temperature`: sun2000.0.inverter.0.internalTemperature (temperature or '0' if in standby)
- `Battery Unit Temperature`: sun2000.0.inverter.0.battery.unit.1.batteryTemperature (temperature or '0' if in standby)
- `Grid Frequency`: sun2000.0.meter.gridFrequency 


## Flexcharts support for statistics

The adapter now generates JSON arrays for hourly/daily/weekly/monthly/annual
statistics in states such as `sun2000.0.statistics.jsonHourly` etc.  These can
be rendered by the [ioBroker.flexcharts](https://github.com/MyHomeMyData/ioBroker.flexcharts)
adapter by using a small script or via the built‑in message callback.

A state `sun2000.0.statistics.flexChartTemplate` is provided where you can store
an eCharts options object – only the parts you want to customise.  The adapter
will merge this template into a default chart layout and fill the `xAxis` and
`series` data automatically.

To request a chart via message box you can send a message with `command: "statistics"`
and a `message.chart` property equal to `hourly`, `daily`, `weekly`, `monthly`
or `annual`.  The payload returned is the final chart options object, which
flexcharts can consume when using `source=script`.

Example script (in JavaScript adapter instance 0):

```js
onMessage(obj => {
    if (obj.command === 'statistics') {
        // forward to sun2000 instance
        sendTo('sun2000.0', 'statistics', obj.message, res => {
            // res contains chart options, set a state or return to flexcharts
            setState('0_userdata.0.flexcharts.sun2000.chart', JSON.stringify(res));
        });
    }
});
```

The default template plots every tracked `targetPath` in a separate line series.
You can override layout, colours, tooltips etc. via the template state.
