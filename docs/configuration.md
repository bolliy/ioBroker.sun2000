# Adapter configuration

## Main settings
### sun2000 settings
* `address`: Inverter IP address
* `port`: Inverter modbus port (default: 502)
* `modbusIds`: inverter IDs, separated with "," (default: 1, max. 5 inverters)
* `updateInterval`: Fast update interval (default: 20 sec, smallest 5 seconds per inverter)
### SDongle settings
* `SDongle active`: Provides the collected data from the SDongle in the path "sdongle"
* `SDongleA modbus ID`: The SDongle modbus ID (usually: 100)

## Modbus timing 
### Modbus timing settings
* `timeout`: modbus connection timeout (default: 10000 ms)
* `delay`: delay between modbus requests (default: 0 ms)
* `connect delay`: delay after modbus connected (default: 5000 ms)
* `auto-adjust`: automatic adjustment of the modbus settings

## Battery control
### Battery charge control 
The “default TOU settings” is interesting for the “force battery charging from the grid” function, which is required for variable energy prices.
The controls are set in the opject path `sun2000.0.inverter.x.control.battery`. Some application examples are described in the [wiki](https://github.com/bolliy/ioBroker.sun2000/wiki/Battery-control)
* `create default TOU setting` : checkbox to activate 

## Smart logger
### SmartLogger settings
The SmartLogger monitors and manages PV systems and energy storage systems. It converges all ports, converts protocols, collects and stores data, and centrally monitors and maintains the devices in the systems.
* `SmartLogger active` : checkbox to activate
* `The Meter modbus ID` : modbus ID of Smart Power Sensor 

## Modbus-proxy
### Modbus tcp proxy for multiple client connections
Third party device such as wallbox, energy manager etc. can receive data even if the modbus interface of inverter is already in use. 
* `active`: activate the mobus-proxy service (default: false)
* `ip address`: Modbus-proxy IP address (usually: 0.0.0.0)
* `TCP port`: Modbus-proxy TCP port (usually: 502)
* `advanced log`: Communication of register as JSON string