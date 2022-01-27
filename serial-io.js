

const Logger           = require('node-color-log');

const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline')
const SimpleMQTT       	= require('./superSimpleMqttClient.js');



class SerialIO {



	constructor(config) {
		this.config  =  config;
		this.callback = null;

    this.mqttClient = new SimpleMQTT({
	"clientID": 0, 
	"username": "ignored",  
	"password": "",
	"projectId" : 0,
	"privateKeyFile" : "./google-keys/rsa_private.pem"
    });

		
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


    buf2hex(buffer) {
	return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join(' ');
    }


	setCallback(callback) {
	    this.callback = callback;
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
		    Logger.debug("<<< " + data.toString());
		    if(typeof self.callback !== "undefined" || self.callback !== null) {
			self.callback(data);

		    } else {
			Logger.warn("NO Callback defined");

		    }

		});	

	}

	writeln(data) {
		Logger.debug(">>> " + data);
		this.port.write(data + this.config.delimiter);
	}


	write(data) {
	Logger.debug("Serial Send >>>>>>>:" + this.mqttClient.buf2hex(data));

		Logger.debug(">>> " + data);
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
}


module.exports = SerialIO;