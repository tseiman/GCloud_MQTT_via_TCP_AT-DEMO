'use strict';

class telcoTelemetry {

    constructor(serialIO) {

	this.serialIO = serialIO;
	this.telemetry = {  
	    "OperatorName"	: "na",
	    "MNC"		: 0,
	    "MCC"		: 0,
	    "RAT"		: 0,
	    "TAC"		: 0,
	    "CellID"		: 0,
	    "RSSI"		: 99,
	    "RSRP"		: 99,
	    "RSRQ"		: 99,
	    "SNR"		: 0,
	    "edgedate"		: 0
	};

    }


/*    async wait(delay) {
	return new Promise(function(resolve, reject) {
    	    setTimeout(resolve, delay);
	});
    }
*/

    async getTelcoTelemetry() {
        if(typeof this.serialIO === "undefined" || this.serialIO === null) {
	    	throw "need SerialIO object";
		}

    	this.telemetry.edgedate = Date.now(); // getting the timestamp on this machine

		var res =  await this.serialIO.sendAndExpect( 'AT+COPS=3,0\r','.*OK.*',2000); // set COPS? to alphanumeric long
		res =  await this.serialIO.sendAndExpect( 'AT+COPS?\r','.*COPS.*',2000); // check operator and RAT
		this.telemetry.OperatorName = res.data.match(/.*COPS: *[0-9],[0-9],.(.*).,.*/)[1];
		this.telemetry.RAT = parseInt(res.data.match(/.*COPS: *[0-9],[0-9],.*,([0-9])/)[1]);

		res =  await this.serialIO.sendAndExpect( 'AT+COPS=3,2\r','.*OK.*',2000); // set COPS? to numeric
		res =  await this.serialIO.sendAndExpect( 'AT+COPS?\r','.*COPS.*',2000); // check operator and RAT but this time numeric
		this.telemetry.MCC = parseInt(res.data.match(/.*COPS: *[0-9],[0-9],.([0-9]+).,.*/)[1].substr(0,3));
		this.telemetry.MNC = parseInt(res.data.match(/.*COPS: *[0-9],[0-9],.([0-9]+).,.*/)[1].substr(3));
		res =  await this.serialIO.sendAndExpect( 'AT+COPS=3,0\r','.*OK.*',2000); // set COPS? to alphanumeric long
		res =  await this.serialIO.sendAndExpect( 'AT+CESQ\r','^.CESQ: *.+',2000); // get Signal Quality
		if(this.telemetry.RAT === 0) { // if 2G we can only do RSSI
	    	this.telemetry.RSSI = 110 - parseInt(res.data.match(/.*CESQ: *([0-9]+),[0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+/)[1]);
	   		res =  await this.serialIO.sendAndExpect( 'AT+KCELL=0\r','^.KCELL: *[-.0-9]+,[-.0-9]+.*',2000); // get Cell info
	    	this.telemetry.CellID = parseInt("0x"+ res.data.match(/.*KCELL: *[0-9]+,[0-9]+,[0-9]+,[0-9]+,[a-zA-Z0-9]+,[a-zA-Z0-9]+,([a-zA-Z0-9]+),.*/)[1],16);
	    	this.telemetry.TAC = parseInt("0x" + res.data.match(/.*KCELL: *[0-9]+,[0-9]+,[0-9]+,[0-9]+,[a-zA-Z0-9]+,([a-zA-Z0-9]+),[a-zA-Z0-9]+,.*/)[1],16);
		} else {
	    	this.telemetry.RSRP = 140 - parseInt(res.data.match(/.*CESQ: *[0-9]+,[0-9]+,[0-9]+,[0-9]+,[0-9]+,([0-9]+)/)[1]);
	    	this.telemetry.RSRQ = 19.5 - (parseInt(res.data.match(/.*CESQ: *[0-9]+,[0-9]+,[0-9]+,[0-9]+,([0-9]+),[0-9]+/)[1]) * 0.5);
	    	res =  await this.serialIO.sendAndExpect( 'AT+KCELLMEAS=0\r','^.KCELLMEAS:.*',2000); // get Signal to Interference plus Noise Ratio
	   		this.telemetry.SNR = parseFloat(res.data.match(/.*KCELLMEAS: *[-.0-9]+,[-.0-9]+,[-.0-9]+,[-.0-9]+,([-.0-9]+)/)[1]);
	    	res =  await this.serialIO.sendAndExpect( 'AT+KCELL=0\r','^.KCELL: *[-.0-9]+,[-.0-9]+.*',2000); // get Cell info
	    	this.telemetry.CellID = parseInt("0x" + res.data.match(/.*KCELL: *[-.0-9]+,[-.0-9]+,[a-zA-Z0-9]+,([a-zA-Z0-9]+),.*/)[1],16);
	    	this.telemetry.TAC = parseInt( res.data.match(/.*KCELL: *[-.0-9]+,[-.0-9]+,[a-zA-Z0-9]+,[a-zA-Z0-9]+,[a-zA-Z0-9]+,([a-zA-Z0-9]+),.*/)[1]);
		}

		return this.telemetry;
    }

}
module.exports = telcoTelemetry;
