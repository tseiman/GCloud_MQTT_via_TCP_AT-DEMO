'use strict';

const Logger           = require('node-color-log');
const Moment 		= require('moment');
const Fs		= require('fs');

const SerialIO         	= require('./serial-io.js');




class ModemSpecific {



	constructor(serialIO,nconf) {
	    this.serialIO = serialIO;
	    this.nconf = nconf;
	}


	async init() {
	    Logger.info("setting up basic modem settings");
	    await this.serialIO.sendAndExpect('AT\r','.*',2000).catch((err) => { Logger.error(err);}); // Just clear any crap from UART
	    await this.serialIO.sendAndExpect('ATE0\r','.*OK.*',2000).catch((err) => { Logger.error(err);}); // disable echo
	    await this.serialIO.sendAndExpect( 'ATI\r','.*HL7802.*',2000).catch((err) => { Logger.error(err);}); // see we're working wiht the right module
	    await this.serialIO.sendAndExpect( 'AT+CMEE=1\r','.*OK.*',2000).catch((err) => { Logger.error(err);}); // error reporting on
	    await this.serialIO.sendAndExpect( 'AT+KPATTERN="--EOF--Pattern--"\r','.*OK.*',2000).catch((err) => { Logger.error(err);}); // set EOF pattern for internal stack
	    await this.serialIO.sendAndExpect( 'AT+CGDCONT=1,"IP","' + this.nconf.get('APN') + '"\r','.*OK.*',2000).catch((err) => { Logger.error(err);}); // set APN (may needs username and PW)

	    Logger.info("set date to modem");
	    var date = new Date();
	    var jetzt = Moment(date).format('YY/MM/DD,HH:mm:ss+08');
	    await this.serialIO.sendAndExpect( 'AT+CCLK="' + jetzt + '"\r','.*OK.*',2000).catch((err) => { Logger.error(err);});

	    Logger.info("configure momde network connection APN");
	    await this.serialIO.sendAndExpect( 'AT+KCNXCFG=1,"GPRS","' + this.nconf.get('APN') + '"\r','.*OK.*',2000).catch((err) => { Logger.error(err);});

	    Logger.info("load certificate");
	    if(this.nconf.get('setCert')) {
			await this.serialIO.sendAndExpect( 'AT+KSSLCFG=0,3\r','.*OK.*',2000).catch((err) => { Logger.error(err);});
			await this.serialIO.sendAndExpect( 'AT+KSSLCFG=1,"edge"\r','.*OK.*',2000).catch((err) => { Logger.error(err);});
			await this.serialIO.sendAndExpect( 'AT+KSSLCFG=2,0\r','.*OK.*',2000).catch((err) => { Logger.error(err);});
			await this.serialIO.sendAndExpect( 'AT+KSSLCRYPTO=1,8,3,25392,12,4,1,0\r','.*OK.*',2000).catch((err) => { Logger.error(err);});
			try {
		    	var certDataPEM  = Fs.readFileSync(this.nconf.get('tlsCert'), 'ascii');
		    	await this.serialIO.sendAndExpect( 'AT+KCERTSTORE=0,' + certDataPEM.length + ',0' + '\r','.*CONNECT.*',5000).catch((err) => { Logger.error(err);});
		    	await this.serialIO.sendAndExpect( certDataPEM,'.*OK.*',2000,true).catch((err) => { Logger.error(err);});
			} catch(e) {}
	
			await this.serialIO.sendAndExpect( 'AT+CTZU=0\r','.*OK.*',2000).catch((err) => { Logger.error(err);});
			await this.serialIO.sendAndExpect( 'AT+CTZR=0\r','.*OK.*',2000).catch((err) => { Logger.error(err);});
	    }

	}



	async destroy() {
/*	    await this.serialIO.sendAndExpect('AT+KTCPCLOSE=' + sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
	    await this.serialIO.sendAndExpect('AT+KTCPDEL=' + sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);}); */
	    await this.serialIO.sendAndExpect( 'ATE1\r','.*',2000).catch((err) => { Logger.error(err);});
	}


}


module.exports = ModemSpecific;
