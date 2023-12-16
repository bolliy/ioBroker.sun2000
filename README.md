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

Supported hardware

* HUAWEI Inverter (SUN2000 Serie) M1, Software SDongle min. version 133
* HUAWEI Luna2000 Battery
* HUAWEI Smart Power Sensor DTSU666-H or DDSU666-H


## Settings

* `address`: Inverter IP address
* `port`: Inverter modbus port (default: 502)
* `modbusId`: Primary Modbus inverter id (default: 1)
* `modbusId2`: Secondary Modbus inverter id (default: 0)
* `updateInterval`: Fast update interval (default: 30 sec)

## Changelog

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