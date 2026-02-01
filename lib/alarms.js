const alarmLevel = {
	Major: 'major',
	Minor: 'minor',
	Warning: 'warning',
};

const inverterAlarms1 = new Map()
	.set('0', { id: 2001, name: 'High String Input Voltage', level: alarmLevel.Major })
	.set('1', { id: 2002, name: 'DC Arc Fault', level: alarmLevel.Major })
	.set('2', { id: 2011, name: 'String Reverse Connection', level: alarmLevel.Major })
	.set('3', { id: 2012, name: 'String Current Backfeed', level: alarmLevel.Warning })
	.set('4', { id: 2913, name: 'Abnormal String Power', level: alarmLevel.Warning })
	.set('5', { id: 2021, name: 'AFCI Self-Check Fail', level: alarmLevel.Major })
	.set('6', { id: 2031, name: 'Phase Wire Short-Circuited to PE', level: alarmLevel.Major })
	.set('7', { id: 2032, name: 'Grid Loss', level: alarmLevel.Major })
	.set('8', { id: 2033, name: 'Grid Undervoltage', level: alarmLevel.Major })
	.set('9', { id: 2034, name: 'Grid Overvoltage', level: alarmLevel.Major })
	.set('10', { id: 2035, name: 'Grid Volt. Imbalance', level: alarmLevel.Major })
	.set('11', { id: 2036, name: 'Grid Overfrequency', level: alarmLevel.Major })
	.set('12', { id: 2037, name: 'Grid Underfrequency', level: alarmLevel.Major })
	.set('13', { id: 2038, name: 'Unstable Grid Frequency', level: alarmLevel.Major })
	.set('14', { id: 2039, name: 'Output Overcurrent', level: alarmLevel.Major })
	.set('15', { id: 2040, name: 'Output DC Component Overhigh', level: alarmLevel.Major });

const inverterAlarms2 = new Map()
	.set('0', { id: 2051, name: 'Abnormal Residual Current', level: alarmLevel.Major })
	.set('1', { id: 2061, name: 'Abnormal Grounding', level: alarmLevel.Major })
	.set('2', { id: 2062, name: 'Low Insulation Resistance', level: alarmLevel.Major })
	.set('3', { id: 2063, name: 'Overtemperature', level: alarmLevel.Minor })
	.set('4', { id: 2064, name: 'Device Fault', level: alarmLevel.Major })
	.set('5', { id: 2065, name: 'Upgrade Failed or Version Mismatch', level: alarmLevel.Minor })
	.set('6', { id: 2066, name: 'License Expired', level: alarmLevel.Warning })
	.set('7', { id: 61440, name: 'Faulty Monitoring Unit', level: alarmLevel.Minor })
	.set('8', { id: 2067, name: 'Faulty Power Collector', level: alarmLevel.Major })
	.set('9', { id: 2068, name: 'Battery abnormal', level: alarmLevel.Minor })
	.set('10', { id: 2070, name: 'Active Islanding', level: alarmLevel.Major })
	.set('11', { id: 2071, name: 'Passive Islanding', level: alarmLevel.Major })
	.set('12', { id: 2072, name: 'Transient AC Overvoltage', level: alarmLevel.Major })
	.set('13', { id: 2075, name: 'Peripheral port short circuit', level: alarmLevel.Warning })
	.set('14', { id: 2077, name: 'Churn output overload', level: alarmLevel.Major })
	.set('15', { id: 2080, name: 'Abnormal PV module configuration', level: alarmLevel.Major });

const inverterAlarms3 = new Map()
	.set('0', { id: 2081, name: 'Optimizer fault', level: alarmLevel.Warning })
	.set('1', { id: 2085, name: 'Built-in PID operation abnormal', level: alarmLevel.Minor })
	.set('2', { id: 2014, name: 'High input string voltage to ground', level: alarmLevel.Major })
	.set('3', { id: 2086, name: 'External Fan Abnormal', level: alarmLevel.Major })
	.set('4', { id: 2069, name: 'Battery Reverse Connection', level: alarmLevel.Major })
	.set('5', { id: 2082, name: 'On-grid /Off-grid controller abnormal', level: alarmLevel.Major })
	.set('6', { id: 2015, name: 'PV String Loss', level: alarmLevel.Warning })
	.set('7', { id: 2087, name: 'Internal Fan Abnormal', level: alarmLevel.Major })
	.set('8', { id: 2088, name: 'DC Protection Unit Abnormal', level: alarmLevel.Major })
	.set('9', { id: 2089, name: 'EL Unit Abnormal', level: alarmLevel.Minor })
	.set('10', { id: 2090, name: 'Active Adjustment Instruction Abnormal', level: alarmLevel.Major })
	.set('11', { id: 2091, name: 'Reactive Adjustment Instruction Abnormal', level: alarmLevel.Major })
	.set('12', { id: 2092, name: 'CT Wiring Abnormal', level: alarmLevel.Major })
	.set('13', { id: 2003, name: 'DC Arc Fault(ADMC Alarm to be clear manually)', level: alarmLevel.Major })
	.set('14', { id: 2093, name: 'DC Switch Abnormal', level: alarmLevel.Minor })
	.set('15', { id: 2094, name: 'Allowable discharge capacity of the battery is low', level: alarmLevel.Warning });

function fromBitfield(alarmString, lot) {
	const result = [];
	for (let i = 0; i < alarmString.length; i++) {
		if (alarmString[alarmString.length - 1 - i] === '1') {
			const alarmText = lot.get(String(i));
			if (alarmText) {
				result.push(alarmText);
			}
		}
	}
	return result;
}

function getAlarmInfo(alarmCode, alarmNo) {
	if (alarmCode !== null) {
		const alarmString = (alarmCode >>> 0).toString(2).padStart(16, '0');
		switch (alarmNo) {
			case 1:
				return fromBitfield(alarmString, inverterAlarms1);
			case 2:
				return fromBitfield(alarmString, inverterAlarms2);
			case 3:
				return fromBitfield(alarmString, inverterAlarms3);
		}
	}
	return [];
}

module.exports = {
	getAlarmInfo,
};
