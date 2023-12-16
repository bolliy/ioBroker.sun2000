![Logo](admin/sun2000.png)
# ioBroker.sun2000

[![NPM version](https://img.shields.io/npm/v/iobroker.sun2000.svg)](https://www.npmjs.com/package/iobroker.sun2000)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sun2000.svg)](https://www.npmjs.com/package/iobroker.sun2000)
![Number of Installations](https://iobroker.live/badges/sun2000-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/sun2000-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.sun2000.png?downloads=true)](https://nodei.co/npm/iobroker.sun2000/)

**Tests:** ![Test and Release](https://github.com/bolliy/ioBroker.sun2000/workflows/Test%20and%20Release/badge.svg)

## sun2000 adapter for ioBroker

Read register data from Huawei SUN2000 inverter and LUNA2000 battery using Modbus TCP. 

## Supported hardware

* HUAWEI Inverter (SUN2000 Serie) M1 with 
* HUAWEI Smart Dongle-WLAN-FE / Min. Softwareversion: xxxSPC133 (SDongleA-05)
* HUAWEI Luna2000 Battery
* HUAWEI Smart Power Sensor DTSU666-H or DDSU666-H

## Configure inverters

In order to use the Modbus connection, all Huawei devices must have the latest firmware
feature. You can perform latest firmware directly in the FusionSolar portal under “Upgrades”.
In the FusionSolar setup you still have to activate the Modbus on the WLAN dongle and set the access authorization. Download the FusionSolar-App onto your cell phone and use it to connect via the inverter's WLAN hotspot directly.  
After that click on Me/Ich “Commissionin Device” ("Inbetriebnahme des Geräts“) > log in to the inverter (am Wechselrichter anmelden)> Settings (Einstellungen) > Communication configuration (Kommunikationskonfiguration) > Dongle parameter settings (Dongle‐Parametereinstellungen) > Modbus TCP > Activate the connection without restriction (Verbindung uneingeschränkt aktivieren). You can also enter the Modbus comm address at the same time read out. 
If you use two inverters, then connect to the second inverter and read the communication address there too. A maximum of 2 inverters can be connected via Modbus. 


## Settings

* `address`: Inverter IP address
* `port`: Inverter modbus port (default: 502)
* `modbusId`: Primary Modbus inverter id (default: 1)
* `modbusId2`: Secondary Modbus inverter id (default: 0)
* `updateInterval`: Fast update interval (default: 30 sec)

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
* (bolliy) Increase stability

### 0.0.2 (2023-12-19)
Dependency and configuration updates

### 0.0.1 
initial release

## License
MIT License

Copyright (c) 2023 bolliy <stephan@mante.info>

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