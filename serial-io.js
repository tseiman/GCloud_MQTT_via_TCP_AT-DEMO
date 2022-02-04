'use strict';

const Logger           = require('node-color-log');

const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline')
const SimpleMQTT       	= require('./superSimpleMqttClient.js');



class SerialIO {



	constructor(config) {
		this.config  =  config;
		this.callback = new Map();
		this.timeOHandler = null;

	/*	this.mqttClient = new SimpleMQTT({
		    "clientID": 0, 
		    "username": "ignored",  
		    "password": "",
		    "projectId" : 0,
		    "privateKeyFile" : "./google-keys/rsa_private.pem"
		});
*/
		
		if(config.port === undefined || config.port === null || config.baud === undefined || config.baud === null) throw ('configuration for serial needs port and baud - e.g. new SerialIO({port: "/dev/ttyUSB1", baud: 115200, delimiter: "\r\n" });');
		Logger.info("creating new serial port: " + config.port + ", baud: " + config.baud );

		this.port = new SerialPort(config.port, { 
			autoOpen: false,
			baudRate: config.baud,
			dataBits: 8,
			parity: 'none',
			stopBits: 1,
			lock: false,
			flowControl: false
		});
	}


	registerCallback(name,expect,callback) {
		if(name in this.callback) {
			Logger.error("Callback with thename " + name + " exists already. Callback ignored !!!");
			return;
		}
		Logger.debug("setting callback with name: \"" + name + "\" and expect:\"" + expect +"\n");
	    this.callback.set(name, {'name': name, 're': new RegExp(expect), 'expect': expect, 'callback':  callback});

	}

	triggerCallbacks(data) {
		if(this.callback.size === 0) {
			Logger.debug("No callbacks defined");
			return;
		}
		var self = this;
		this.callback.forEach(function (callback) {
	//		Logger.log(">>>>>" + callback.name + ", call=" + callback.re.test(data) + ", data: "  + ", expect: " + callback.expect );
			if (callback.re.test(data)) { 
				Logger.debug("Matching callback found for RegEx:\"" + callback.expect +"\" - calling:\"" + callback.name + "\"");
				callback.callback(data);
			}
		});
	}

	removeCallback(name) {
		if(this.callback.size === 0) {
			Logger.warn("NO Callback defined can't destroy");
			return;
		}
		if(! this.callback.has(name)) {
			Logger.error("Callback \"" + name + "\" is not defined, nothing removed !");
			return;
		}
		Logger.debug("removing callback \"" + name + "\"");
		this.callback.delete(name);
	}

	open() {
		var self = this;
		Logger.info("open port");
		this.port.open(function (err) {
			if (err) {
				Logger.error('Error opening port [' + self.name + ']: ' + err.message);
				return false;
			}
			return true;
		});
		this.parser =  this.port.pipe(new Readline({ delimiter: this.config.delimiter }));

		this.parser.on('data', function (data) {
		    Logger.debug("<<< \n" + SimpleMQTT.buf2hex(data));
			self.triggerCallbacks(data);
		});	

	}

	writeln(data) {
		Logger.debug(">>> \n" + SimpleMQTT.buf2hex(data + this.config.delimiter));
		this.port.write(data + this.config.delimiter);
	}


	write(data) {
	    Logger.debug(">>>:\n"+  SimpleMQTT.buf2hex(data));
//	    Logger.debug(">>> " + data);
	    this.port.write(data);
	}

	isOpen() {
		if(this.port === undefined || this.port === null) return false;
		return this.port.isOpen;
	}

	close() {
		Logger.info("Closing a serial port");
		if(this.isOpen()) this.port.close();
	}

	waitResponseClearTimeOut() {
		Logger.warn("Cleaning up sendAndExpect response timer ! (this is a potential dangerous operation)");
		clearTimeout(this.timeOHandler);
	}

	sendAndExpect(cmd,expect,timeout,noNewLine) {
	    if(typeof noNewLine !== 'undefined' && noNewLine ) {
			Logger.debug("sending without delimter"+  typeof cmd);
			this.write(cmd);
	    } else { 
			this.writeln(cmd);
	    }
	    return this.waitResponse(expect,timeout);
	}


	waitResponse(expect,timeout) {
	    Logger.debug("wait for: " + expect);
	    var self = this;
	    return new Promise(function(resolve, reject) {
			// var timeOHandler = this.;
			if(timeout !== undefined) { 
    		    self.timeOHandler = setTimeout(function() { 
					Logger.warn("Timeout after " + timeout +"ms waiting for " + expect);
					self.removeCallback("synchron.waitResponse");
					reject({data: "timeout", result: false}); 
		    	}, timeout);
			}
			self.registerCallback ( "synchron.waitResponse",expect, function (data) { 
//		    	var re = new RegExp(expect);    
//		    	if (re.test(data)) {
					Logger.debug("found expected Data");
					clearTimeout(self.timeOHandler);
					self.removeCallback("synchron.waitResponse");
    				resolve({result: true, "data": data});
//		    	}  

			}); 
	    }); 
	}



}
module.exports = SerialIO;

