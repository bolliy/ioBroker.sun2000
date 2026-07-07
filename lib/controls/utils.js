'use strict';

// ---------------------------------------------------------------------------
// Helper: Convert user-friendly TOU JSON → Modbus register array for reg 40004
//
// Input: JSON string or array of up to 14 objects:
//   { "start": "HH:MM", "end": "HH:MM", "mode": "charge"|"discharge", "days": [...] }
//   days: any combination of "Mo","Di","Mi","Do","Fr","Sa","So"  (German)
//         or                 "Mon","Tue","Wed","Thu","Fri","Sat","Sun" (English)
//
// Output: Uint16Array with 43 words (= 1 count word + 14 × 3 words)
//   word[0]              = number of valid segments (0–14)
//   per segment (3 words = 6 bytes, big-endian):
//     word[0] = start minutes (UINT16)
//     word[1] = end   minutes (UINT16)
//     word[2] = (chargeFlag << 8) | dayBitmask   (UINT16)
//       chargeFlag: 0=charge, 1=discharge
//       dayBitmask: bit0=Sun, bit1=Mon, ..., bit6=Sat
// ---------------------------------------------------------------------------

const DAY_MAP = {
	// German
	so: 0,
	mo: 1,
	di: 2,
	mi: 3,
	do: 4,
	fr: 5,
	sa: 6,
	// English
	sun: 0,
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6,
	// Full German
	sonntag: 0,
	montag: 1,
	dienstag: 2,
	mittwoch: 3,
	donnerstag: 4,
	freitag: 5,
	samstag: 6,
	// Full English
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

function _timeToMinutes(timeStr) {
	const parts = String(timeStr).split(':');
	if (parts.length !== 2) throw new Error(`Invalid time format: "${timeStr}" – use HH:MM`);
	const h = parseInt(parts[0], 10);
	const m = parseInt(parts[1], 10);
	if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
		throw new Error(`Invalid time value: "${timeStr}"`);
	}
	return h * 60 + m;
}

function _parseDayBitmask(days) {
	if (!Array.isArray(days) || days.length === 0) {
		throw new Error('days must be a non-empty array');
	}
	let mask = 0;
	for (const d of days) {
		const key = String(d).toLowerCase();
		if (!(key in DAY_MAP)) {
			throw new Error(`Unknown day name: "${d}". Use Mon/Tue/.../Sun`);
		}
		mask |= 1 << DAY_MAP[key];
	}
	return mask;
}

/**
 * Converts a user-friendly TOU JSON array into the 43-word Modbus register array
 * required for register 40004.
 *
 * @param {string|Array} jsonInput  - JSON string or parsed array
 * @returns {Uint16Array}           - 43 words ready for _writeRegisters(40004, ...)
 * @throws {Error}                  - on invalid input
 */
function touJsonToRegisters(jsonInput) {
	let segments;
	if (typeof jsonInput === 'string') {
		try {
			segments = JSON.parse(jsonInput);
		} catch (e) {
			throw new Error(`TOU: JSON parse error – ${e.message}`);
		}
	} else {
		segments = jsonInput;
	}

	if (!Array.isArray(segments)) throw new Error('TOU: root value must be a JSON array');
	if (segments.length > 14) throw new Error(`TOU: max 14 segments allowed, got ${segments.length}`);

	// 43 words: index 0 = count, then 3 words per segment × 14 slots
	const words = new Uint16Array(43);
	words[0] = segments.length;

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const base = 1 + i * 3;

		const startMin = _timeToMinutes(seg.start);
		const endMin = _timeToMinutes(seg.end);

		if (startMin >= endMin) {
			throw new Error(`TOU segment ${i + 1}: start "${seg.start}" must be before end "${seg.end}"`);
		}

		const modeStr = String(seg.mode || '').toLowerCase();
		if (modeStr !== 'charge' && modeStr !== 'discharge' && modeStr !== 'laden' && modeStr !== 'entladen') {
			throw new Error(`TOU segment ${i + 1}: mode must be "charge" or "discharge", got "${seg.mode}"`);
		}
		const chargeFlag = modeStr === 'discharge' || modeStr === 'entladen' ? 1 : 0;

		const dayMask = _parseDayBitmask(seg.days);

		words[base] = startMin;
		words[base + 1] = endMin;
		// Pack chargeFlag (high byte) + dayMask (low byte) into one UINT16
		words[base + 2] = ((chargeFlag & 0xff) << 8) | (dayMask & 0xff);
	}

	return words;
}

/**
 * Converts a 43-word Modbus register array (from reg 40004) back into
 * the user-friendly JSON format so the state can be pre-populated on init.
 *
 * @param {number[]} data  - raw register words (length ≥ 43)
 * @returns {string}       - JSON string
 */
function touRegistersToJson(data) {
	if (!data || data.length < 43) return '[]';
	const count = Math.min(data[0], 14);
	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; //"Mon","Tue","Wed","Thu","Fri","Sat","Sun"
	const segments = [];

	for (let i = 0; i < count; i++) {
		const base = 1 + i * 3;
		const startMin = data[base];
		const endMin = data[base + 1];
		const packed = data[base + 2];
		const chargeFlag = (packed >> 8) & 0xff;
		const dayMask = packed & 0xff;

		const toHHMM = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
		const days = [];
		for (let b = 0; b < 7; b++) {
			if (dayMask & (1 << b)) days.push(DAY_NAMES[b]);
		}

		segments.push({
			start: toHHMM(startMin),
			end: toHHMM(endMin),
			mode: chargeFlag === 1 ? 'discharge' : 'charge',
			days,
		});
	}
	return JSON.stringify(segments, null, 2);
}

module.exports = { touJsonToRegisters, touRegistersToJson };
