![Logo](admin/sun2000.png)
# ioBroker.sun2000

[![NPM version](https://img.shields.io/npm/v/iobroker.sun2000.svg)](https://www.npmjs.com/package/iobroker.sun2000)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sun2000.svg)](https://www.npmjs.com/package/iobroker.sun2000)
![Number of Installations](https://iobroker.live/badges/sun2000-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/sun2000-stable.svg)
[![Documentation](https://img.shields.io/badge/Documentation-2D963D?logo=read-the-docs&logoColor=white)](https://github.com/bolliy/ioBroker.sun2000/blob/main/docs/README.md)
[![Wiki](https://img.shields.io/badge/wiki-documentation-forestgreen)](https://github.com/bolliy/ioBroker.sun2000/wiki)
[![Donate](https://img.shields.io/badge/paypal-donate%20|%20spenden-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=ZTX3VP9LZBDCG)
[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/bolliy)


[![NPM](https://nodei.co/npm/iobroker.sun2000.png?downloads=true)](https://nodei.co/npm/iobroker.sun2000/)

**Tests:** ![Test and Release](https://github.com/bolliy/ioBroker.sun2000/workflows/Test%20and%20Release/badge.svg)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.**\
For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)!\

## sun2000 adapter for ioBroker

Read and write register data from Huawei SUN2000 inverter and LUNA2000 battery using Modbus TCP. Third-party devices can access via the modbus proxy. Even a Huawei SmartLogger or an Huawei Emma can be integrated.

[Huawei product information](https://solar.huawei.com/en/professionals/all-products?residential-smart-pv)

Feel free to follow the discussions in the german [iobroker forum](https://forum.iobroker.net/topic/71768/test-adapter-sun2000-v0-1-x-huawei-wechselrichter)

## Requirements
* Node.js 22 or higher
* ioBroker host (js-controller) 6.0.11 or higher
* ioBroker admin 7.6.20 or higher

## Documentation

See the [documentation page](https://github.com/bolliy/ioBroker.sun2000/blob/main/docs/README.md) or 
browse in the [wiki](https://github.com/bolliy/ioBroker.sun2000/wiki)

## Supported hardware

* HUAWEI Inverter SUN2000 Serie (M0,M1,M2 and higher) 
* HUAWEI Smart Dongle-WLAN-FE / min. Softwareversion: V100R001C00SPC133 (SDongleA-05)
* HUAWEI Luna2000 Battery
* HUAWEI Smart Power Sensor DTSU666-H or DDSU666-H
* HUAWEI Smart Logger / min. Softwareversion: V300R023C10SPC311
* HUAWEI EMMA / min. Softwareversion: V100R024C00SPC101

## Feature list

* Up to `5 inverters` (master/slave) supported, each with an optional battery module.
* `Real-time` values (input/output power, charge/discharge power, grid consumption) are read at a fixed interval; states are only written on changed data to reduce load on the ioBroker instance.
* [`Battery charge control`](https://github.com/bolliy/ioBroker.sun2000/wiki/Battery-control): control charging mode (e.g. "charge from grid"), charging capacity and power.
* [`Time-of-Use (TOU) scheduling`](https://github.com/bolliy/ioBroker.sun2000/wiki/Battery-control): define weekly charge/discharge time windows via a simple JSON interface (up to 14 segments/week, German & English day names) — supported for both inverter and EMMA.
* [`Force charge/discharge battery`](https://github.com/bolliy/ioBroker.sun2000/wiki/Erzwungenes-Laden-und-Entladen-der-Batterie-(Force-charge-discharge-battery)): mainly for testing the connected battery.
* Battery `charge/discharge efficiency` calculated daily (`collected.derived.chargeEfficiency` / `dischargeEfficiency`), computed once at midnight to avoid intra-day distortion between fast AC and slower BMS register updates.
* [`Export Control`](https://github.com/bolliy/ioBroker.sun2000/wiki/Begrenzung-Netzeinspeisung-(Export-Control)): limit grid feed-in power (kW or %) where local regulations require it.
* [`SmartGuard / grid power control`](https://github.com/bolliy/ioBroker.sun2000/issues/285) (EMMA): power supply configuration and mains-fault handling registers.
* [`modbus-proxy`](https://github.com/bolliy/ioBroker.sun2000/wiki/Modbus-Proxy): lets third-party devices (wallbox, energy manager, …) read data even while the inverter's Modbus interface is in use by the adapter, with automatic direct-read fallback if the cached value is missing or stale.
* Huawei [`SmartLogger`](https://github.com/bolliy/ioBroker.sun2000/wiki/SmartLogger) integration for monitoring/managing the PV system.
* Huawei [`Emma`](https://github.com/bolliy/ioBroker.sun2000/wiki/Emma) integration: combines Modbus access, WiFi/Ethernet connectivity and the DDSU/DTSU-666H smart meter in one unit; also supports EV chargers and load control via selected Shelly devices.
* Huawei [`Charger`](https://github.com/bolliy/ioBroker.sun2000/issues/171) via EMMA: chargers are auto-detected and stored under their own path.
* [`Statistics`](https://github.com/bolliy/ioBroker.sun2000/wiki/Statistk-(statistics)): historical data aggregated into hourly/daily/weekly/monthly/annual summaries, plus a configurable live power chart (1–15 min interval), with a user-definable **consumption breakdown** into sub-categories (e.g. wallbox, heat pump).
  Visualized via built-in Apache ECharts configurations (customizable templates) or the ioBroker flexcharts adapter.
* [`Surplus Power Control`](https://github.com/bolliy/ioBroker.sun2000/wiki/%C3%9Cberschuss-(surplus)): calculates how much self-generated solar power is available for home devices instead of being fed into the grid.


## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 2.6.0 (2026-07-22)
* (booliy/claude) Optimization of memory usage
* (bolliy/claude) Added six new EMMA control registers ([#285](https://github.com/bolliy/ioBroker.sun2000/issues/285))
* (bolliy/claude) Implemented Time-of-Use (TOU)
* (booliy/claude) modbus-proxy: Direct register reading on cache mismatch

### 2.5.1 (2026-06-29)
- (bolliy) fix: update service queue logic ([#283](https://github.com/bolliy/ioBroker.sun2000/discussions/283))
- (bolliy) statistics fix: adjust reset handling logic to treat significant drops in value as potential resets

### 2.5.0 (2026-06-09)
* (bolliy) statistics: added live power chart (statistics.jsonLive)
* (bolliy) statistics: consumption breakdown — breakdown values are now subtracted from the total `consumption` entry so the lower chart panel shows the remainder separately from the breakdown series
* (bolliy) statistics: `xAxisFormatter` for the live chart only labels full-hour ticks to avoid clutter
* (bolliy) statistics: tooltip formatter refactored — `formatTooltipValue(unit, negative, decimals)` helper used consistently across all series
* (bolliy) statistics: if no battery is present, the charts are generated without battery information (SOC, charge, discharge).
* (bolliy) fix emma: update register addresses of meter.activePowerL1-L3 ([#282](https://github.com/bolliy/ioBroker.sun2000/issues/282))
* (bolliy) requires node.js >= 22

### 2.4.5 (2026-05-14)
* statistics fix: return weekly range up to current Monday
* statistics: added support for generating statistics templates directly from built-in charts
* statistics: improved tooltip formatter - tooltip units are now provided explicitly via tooltip.valueFormatter

### 2.4.4 (2026-05-04)
* statistics fix: add error handling for waitForValue function

[Older changelogs can be found there](CHANGELOG_OLD.md)

## License
MIT License

Copyright (c) 2025-2026 bolliy <stephan@mante.info>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[def]: https://github.com/bolliy/ioBroker.sun2000/wiki