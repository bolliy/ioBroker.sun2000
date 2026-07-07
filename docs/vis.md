# Example Vis

The picture below shows an example vis showing the energy flow between the different components. In the part, a float diagram shows the battery charge status, power production and power consumption over the last 48 hours.

[![Screenshot](https://github.com/bolliy/ioBroker.sun2000/raw/main/docs/images/SunLuna2000Vis-v2.png)](/bolliy/ioBroker.sun2000/blob/main/docs/images/SunLuna2000Vis-v2.png)

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

The adapter's [statistics module](https://github.com/bolliy/ioBroker.sun2000/wiki/Statistk-(statistics)) automatically aggregates the raw inverter data into hourly/daily/weekly/monthly/annual time series under `sun2000.0.statistics.*`, including computed `selfSufficiency` and `selfConsumption` ratios. For visualizing this data in VIS, the adapter has built-in support for the [ioBroker.flexcharts](https://github.com/MyHomeMyData/ioBroker.flexcharts) adapter — no scripting or message-box wiring required.

### Requirements

- **ioBroker.web** – provides the HTTP server (default port `8082`)
- **ioBroker.flexcharts** – renders the Apache ECharts diagrams

Both can be installed via the ioBroker Admin interface.

### How it works

Each chart type has its own template state and its own output state. The adapter merges the template into the default layout and rebuilds the output automatically, every hour:

| Template state | Output state |
| --- | --- |
| `statistics.flexCharts.template.hourly` | `statistics.flexCharts.jsonOutput.hourly` |
| `statistics.flexCharts.template.daily` | `statistics.flexCharts.jsonOutput.daily` |
| `statistics.flexCharts.template.weekly` | `statistics.flexCharts.jsonOutput.weekly` |
| `statistics.flexCharts.template.monthly` | `statistics.flexCharts.jsonOutput.monthly` |
| `statistics.flexCharts.template.annual` | `statistics.flexCharts.jsonOutput.annual` |

Leave a template state at its default (`{}`) to use the built-in chart layout, which already includes Solar Yield/Grid Import/Discharge above the zero line, Grid Export/Charge below it, Battery SOC and the self-sufficiency/self-consumption ratios as dashed lines on a second Y-axis, day-break shading for hourly charts, and a zoom slider.

### Embedding a chart in VIS

Add an **iFrame** widget to your VIS view and point it at the flexcharts URL using `source=state`, which reads the chart configuration directly from the corresponding output state — no message box or forwarding script needed:

```
http://[ioBroker-ip]:8082/flexcharts/echarts.html?source=state&id=sun2000.0.statistics.flexCharts.jsonOutput.hourly
```

Replace `[ioBroker-ip]` with the address of your ioBroker instance and `sun2000.0` with your actual adapter instance if it differs. Swap `hourly` for `daily`, `weekly`, `monthly` or `annual` for the other chart types. The chart updates automatically whenever the adapter refreshes the output state.

### Customizing a chart

To change layout, colors or series, edit the corresponding `statistics.flexCharts.template.*` state with an ECharts options object — only the parts you want to override. Series data is inserted via placeholders such as `"%%solarYield%%"`, `"%%gridExport%%"` or `"%%SOC%%"`, each with a negated variant (e.g. `"%%gridExportNeg%%"`) for mirrored, below-zero layouts. Axis/metadata placeholders like `"%%xAxisDataShort%%"`, `"%%chartTitle%%"`, `"%%dayAreas%%"` and `"%%tooltipFormatter%%"` are also available.

To start from the current built-in layout instead of from scratch, write `{"command": "createTemplateFromBuiltin"}` into a template state — the adapter replaces it with a full template generated from the built-in chart, which you can then translate, recolor or extend.

To reset a chart type back to the built-in default, set its template state back to `{}`.

The full placeholder reference, the `statistics.jsonToday` live summary state, and several ready-to-use template examples (minimal bar chart, mirrored layout with SOC/ratios, line chart with area fill, day-break hourly chart, extended yield/ratio overview) are documented on the [Statistics wiki page](https://github.com/bolliy/ioBroker.sun2000/wiki/Statistk-(statistics)).