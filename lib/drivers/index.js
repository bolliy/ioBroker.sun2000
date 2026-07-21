const { driverClasses } = require(`${__dirname}/../types.js`);

function getDriverHandler(driverClass) {
	switch (driverClass) {
		case driverClasses.inverter:
			return require(`${__dirname}/driver_inverter.js`).InverterInfo;
		case driverClasses.sdongle:
			return require(`${__dirname}/driver_sdongle.js`);
		case driverClasses.logger:
			return require(`${__dirname}/driver_slogger.js`).SmartLogger;
		case driverClasses.loggerMeter:
			return require(`${__dirname}/driver_slogger.js`).SmartLoggerMeter;
		case driverClasses.emma:
			return require(`${__dirname}/driver_emma.js`).Emma;
		case driverClasses.emmaCharger:
			return require(`${__dirname}/driver_emma.js`).EmmaCharger;
		default:
			return null;
	}
}

module.exports = getDriverHandler;
