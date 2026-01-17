const alarmLevel = {
	Major: 'major',
	Minor: 'minor',
	Warning: 'warning',
};

const inverterAlarms1 = new Map()
	.set('0', { name: 'High String Input Voltage', id: 2001, level: alarmLevel.Major })
	.set('1', { name: 'DC Arc Fault', id: 2002, level: alarmLevel.Major })
	.set('2', { name: 'String Reverse Connection', id: 2011, level: alarmLevel.Major })
	.set('3', { name: 'String Current Backfeed', id: 2012, level: alarmLevel.Warning })
	.set('4', { name: 'Abnormal String Power', id: 2913, level: alarmLevel.Warning })
	.set('5', { name: 'AFCI Self-Check Fail', id: 2021, level: alarmLevel.Major })
	.set('6', { name: 'Phase Wire Short-Circuited to PE', id: 2031, level: alarmLevel.Major })
	.set('7', { name: 'Grid Loss', id: 2032, level: alarmLevel.Major })
	.set('8', { name: 'Grid Undervoltage', id: 2033, level: alarmLevel.Major })
	.set('9', { name: 'Grid Overvoltage', id: 2034, level: alarmLevel.Major })
	.set('10', { name: 'Grid Volt. Imbalance', id: 2035, level: alarmLevel.Major })
	.set('11', { name: 'Grid Overfrequency', id: 2036, level: alarmLevel.Major })
	.set('12', { name: 'Grid Underfrequency', id: 2037, level: alarmLevel.Major })
	.set('13', { name: 'Unstable Grid Frequency', id: 2038, level: alarmLevel.Major })
	.set('14', { name: 'Output Overcurrent', id: 2039, level: alarmLevel.Major })
	.set('15', { name: 'Output DC Component Overhigh', id: 2040, level: alarmLevel.Major });

const inverterAlarms2 = new Map()
	.set('0', { name: 'Abnormal Residual Current', id: 2051, level: alarmLevel.Major })
	.set('1', { name: 'Abnormal Grounding', id: 2061, level: alarmLevel.Major })
	.set('2', { name: 'Low Insulation Resistance', id: 2062, level: alarmLevel.Major })
	.set('3', { name: 'Overtemperature', id: 2063, level: alarmLevel.Minor })
	.set('4', { name: 'Device Fault', id: 2064, level: alarmLevel.Major })
	.set('5', { name: 'Upgrade Failed or Version Mismatch', id: 2065, level: alarmLevel.Minor })
	.set('6', { name: 'License Expired', id: 2066, level: alarmLevel.Warning })
	.set('7', { name: 'Faulty Monitoring Unit', id: 61440, level: alarmLevel.Minor })
	.set('8', { name: 'Faulty Power Collector', id: 2067, level: alarmLevel.Major })
	.set('9', { name: 'Battery abnormal', id: 2068, level: alarmLevel.Minor })
	.set('10', { name: 'Active Islanding', id: 2070, level: alarmLevel.Major })
	.set('11', { name: 'Passive Islanding', id: 2071, level: alarmLevel.Major })
	.set('12', { name: 'Transient AC Overvoltage', id: 2072, level: alarmLevel.Major })
	.set('13', { name: 'Peripheral port short circuit', id: 2075, level: alarmLevel.Warning })
	.set('14', { name: 'Churn output overload', id: 2077, level: alarmLevel.Major })
	.set('15', { name: 'Abnormal PV module configuration', id: 2080, level: alarmLevel.Major });

const inverterAlarms3 = new Map()
	.set('0', { name: '', id: 20, level: alarmLevel.Major })
	.set('1', { name: '', id: 20, level: alarmLevel.Major })
	.set('2', { name: '', id: 20, level: alarmLevel.Major })
	.set('3', { name: '', id: 20, level: alarmLevel.Major })
	.set('4', { name: '', id: 20, level: alarmLevel.Major })
	.set('5', { name: '', id: 20, level: alarmLevel.Major })
	.set('6', { name: '', id: 20, level: alarmLevel.Major })
	.set('7', { name: '', id: 20, level: alarmLevel.Major })
	.set('8', { name: '', id: 20, level: alarmLevel.Major })
	.set('9', { name: '', id: 20, level: alarmLevel.Major })
	.set('10', { name: '', id: 20, level: alarmLevel.Major })
	.set('11', { name: '', id: 20, level: alarmLevel.Major })
	.set('12', { name: '', id: 20, level: alarmLevel.Major })
	.set('13', { name: '', id: 20, level: alarmLevel.Major })
	.set('14', { name: '', id: 20, level: alarmLevel.Major })
	.set('15', { name: '', id: 20, level: alarmLevel.Major });

module.exports = {
	alarmLevel,
	inverterAlarms1,
	inverterAlarms2,
	inverterAlarms3,
};
