# Adapter configuration

## Main settings
### Integration
Which Huawei device should be used to establish the Modbus tcp connection
* `Huawei Device Integration`: Select SDongle / Smart Logger / EMMA (default: SDongle)
### Device Settings
* `address`: Device IP address
* `port`: Device modbus port (default: 502)
* `modbusIds`: Inverter IDs, the master must be entered first, separated by "," (default: 1, max. 5 inverters)
* `updateInterval`: Fast update interval (default: 20 sec, smallest 5 seconds per inverter)

## Integration Settings
### SDongle Settings
* `SDongle active`: Provides the collected data from the SDongle in the path "sdongle"
* `SDongleA modbus ID`: The SDongle modbus ID (usually: 100)
### SmartLogger Settings
The SmartLogger monitors and manages PV systems and energy storage systems. It converges all ports, converts protocols, collects and stores data, and centrally monitors and maintains the devices in the systems.
* `The Meter modbus ID` : modbus ID of Smart Power Sensor 
### EMMA Settings 
EMMA is a smart device that optimizes energy planning, management and distribution. Its AI-powered energy management system can also intelligently control radiators and heat pumps.

## Modbus-proxy
### Modbus tcp proxy for multiple client connections
Third party device such as wallbox, energy manager etc. can receive and send data, even if the modbus interface of inverter is already in use. 
* `active`: activate the mobus-proxy service (default: false)
* `listening address`: Modbus-proxy listening on (usually: 0.0.0.0)
* `TCP port`: Modbus-proxy TCP port (usually: 502)
* `advanced log`: Communication of register as JSON string via info log

## Energy Control
### Battery charge control 
The “default TOU settings” is interesting for the “force battery charging from the grid” function, which is required for variable energy prices.
This control is set in the opject path `sun2000.0.inverter.x.control.battery`. Some application examples are described in the [wiki](https://github.com/bolliy/ioBroker.sun2000/wiki/Battery-control)
* `create default TOU setting` : checkbox to activate 
### Force charge discharge battery
This control is set in the opject path `sun2000.0.inverter.x.control.battery`. Some application examples are described in the [wiki](https://github.com/bolliy/ioBroker.sun2000/wiki/Erzwungenes-Laden-und-Entladen-der-Batterie-(Force-charge-discharge-battery))
### Export control
This control is set in the opject path `sun2000.0.inverter.x.control.grid`. Some application examples are described in the [wiki](https://github.com/bolliy/ioBroker.sun2000/wiki/Begrenzung-Netzeinspeisung-(Export-Control))

## Further Register
### Further battery register data
* `battery units`: activate to read the register data of battery units
* `battery packs`: activate to read the register data of battery packs

## Modbus Timing 
### Modbus timing Settings
* `timeout`: modbus connection timeout (default: 10000 ms)
* `delay`: delay between modbus requests (default: 0 ms)
* `connect delay`: delay after modbus connected (default: 5000 ms)
* `auto-adjust`: automatic adjustment of the modbus settings

