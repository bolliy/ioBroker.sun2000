const { driverClasses } = require(`${__dirname}/../types.js`);
const { InverterInfo } = require(`${__dirname}/driver_inverter.js`);
const { SmartLogger, SmartLoggerMeter } = require(`${__dirname}/driver_slogger.js`);
const { Emma, EmmaCharger } = require(`${__dirname}/driver_emma.js`);
const Sdongle = require(`${__dirname}/driver_sdongle.js`);
//const Scharger = require(__dirname + '/driver_scharger.js');

function getDriverHandler(driverClass) {
	if (driverClass == driverClasses.inverter) {
		return InverterInfo;
	}
	//if (driverClass == driverClasses.charger) return Scharger;
	if (driverClass == driverClasses.sdongle) {
		return Sdongle;
	}
	if (driverClass == driverClasses.logger) {
		return SmartLogger;
	}
	if (driverClass == driverClasses.loggerMeter) {
		return SmartLoggerMeter;
	}
	if (driverClass == driverClasses.emma) {
		return Emma;
	}
	if (driverClass == driverClasses.emmaCharger) {
		return EmmaCharger;
	}
	return null;
}

module.exports = getDriverHandler;
