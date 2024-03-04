const {dataType} = require('./types.js');


class TypeTest {
	constructor () {

	}

	int32 (array) {
		const int = dataType.convert(array, dataType.int32);
		console.log(array);
		console.log('Int32 Wert: '+int);
	}

	int64 (array) {
		const int = dataType.convert(array, dataType.int64);
		console.log(array);
		console.log('Int64 Wert: '+int);
	}


}

const test = new TypeTest();
test.int32([1,500]);
test.int64([1,0,0,500]);

module.exports = TypeTest;
