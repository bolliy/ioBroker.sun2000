## Adapter configuration

# Main settings
* `address`: Inverter IP address
* `port`: Inverter modbus port (default: 502)
* `modbusIds`: inverter IDs, separated with "," (default: 1, max. 5 inverters)
* `updateInterval`: Fast update interval (default: 20 sec, smallest 5 seconds per inverter)
# Modbus timing 
* `timeout`: modbus connection timeout (default: 10000 ms)
* `delay`: delay between modbus requests (default: 0 ms)
* `connect delay`: delay after modbus connected (default: 5000 ms)
* `auto-adjust`: automatic adjustment of the modbus settings
# Modbus-proxy
* `active`: activate the mobus-proxy service (default: false)
* `ip address`: Modbus-proxy IP address (usually: 0.0.0.0)
* `TCP port`: Modbus-proxy TCP port (usually: 502)
* `SDongle modbus ID`: The SDongle modbus ID (usually: 100), is required for the virtual meter
* `advanced log`: Communication of register as JSON string