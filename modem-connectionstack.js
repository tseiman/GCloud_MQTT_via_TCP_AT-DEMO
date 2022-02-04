const Logger           = require('node-color-log');
const ModemSpecific  	= require('./modem-specific.js');
const SerialIO         = require('./serial-io.js');
const SimpleMQTT       	= require('./superSimpleMqttClient.js')



class ConStack {



	constructor(serialIO,nconf) {
		this.connectState = false;
	    this.serialIO = serialIO;
	    this.nconf = nconf;
	    this.hl78Specific = new ModemSpecific(serialIO,nconf);
//     var telcoTelemetry = new TelcoTelemetry(serialIO);
	    
	    this.sessionID = 0;
	    this.lastComTimer = null;

	    var mqttClientId = `projects/${nconf.get('googleProjectId')}/locations/${nconf.get('region')}/registries/${nconf.get('registryId')}/devices/${nconf.get('deviceId')}`;

    	this.mqttClient = new SimpleMQTT({
			"clientID": mqttClientId, 
			"username": "ignored",  
			"password": "",
			"projectId" : nconf.get('googleProjectId'),
			"privateKeyFile" : nconf.get('devicePrivateKeyFile'),
			"keepAlive": nconf.get('mqttKeepAlive')
    	});

	}

	async urcHandler() {
	    Logger.info("Start URC handler");
	    var self = this;
	    this.serialIO.registerCallback("async.TCPDisconnect",'^[+]KTCP_NOTIF: ' + this.sessionID + ',4', async function (data) {
	    	self.setConnectState(false);
			Logger.info("resetup TCP session Nr" + self.sessionID);
		    await self.serialIO.sendAndExpect('AT+KTCPCLOSE=' + self.sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
			setTimeout(self.setupConnection.bind(null,self), 10000);
	    });
	}

	async sendPing(self) {
		Logger.info("sending MQTT Ping");
		var mqttPingMsg = self.mqttClient.getPingReqMsg();

		var buffer =  Buffer.from(mqttPingMsg.msg);
		var buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
		var finalBuffer = Buffer.concat(buffSeq);
		Logger.debug(SimpleMQTT.buf2hex(finalBuffer));

		var res = await self.serialIO.sendAndExpect( 'AT+KTCPSND=' + self.sessionID + ',' + (mqttPingMsg.len - 1) + '\r','.*CONNECT.*',5000).catch((err) => { Logger.error(err);});
		res = await self.serialIO.sendAndExpect(  finalBuffer,'.*KTCP_DATA: *' + self.sessionID +',[0-9]+.*',12000, true).catch((err) => { Logger.error(err);});

		var recLen = parseInt(res.data.match(/.*KTCP_DATA: *[0-9]+,([0-9]+).*/)[1]); 
		Logger.debug("got : " +  recLen + " bytes in downstream");
		res = await self.serialIO.sendAndExpect( 'AT+KTCPRCV=' + self.sessionID + ',' + recLen +'\r','.*--EOF--Pattern--.*',5000).catch((err) => { Logger.error(err);});
		var mqttInMsg = self.mqttClient.parseMessage(res.data.replace(/--EOF--Pattern--[\n\r]/gm,''));
		Logger.debug("Ping resonse:",  mqttInMsg);

	/*	if(mqttInMsg.ret !== 0 ) {
				self.setConnectState(false);
	    		throw {mqttInMsg};
		}*/
		if(mqttInMsg.type === 'PONG') {
			self.setConnectState(true);
		} else {
			self.setConnectState(false);
		}

	}

	setConnectState(state) {
		Logger.info("Setting Connect State from : " + this.connectState + " to : " + state + ", timeout for next interaction is : " + this.nconf.get('mqttKeepAliveTimer'));
		this.connectState = state;
		var self = this;
		if(state) {
			this.lastComTimer = setTimeout(function() { 
				self.sendPing(self);
		    }, this.nconf.get('mqttKeepAliveTimer') * 1000);
		} else {
			clearTimeout(this.lastComTimer);
			self.setupConnection(self);
		}
	}


	async setupConnection(self) {
	 	self.serialIO.registerCallback("async.TCPConnect",'.*KTCP_IND: *' + self.sessionID + ',1.*', async function (data) {
	 		self.serialIO.waitResponseClearTimeOut(); // dangerous - serialIo is not really "thread"--> 2 events safe - we need to clean up the timeout from "sendAndExpect( 'AT+KTCPCNX=' ... " from below this annonymous function

			Logger.info("Got TCP Ready for sessionID: " + self.sessionID);
			var mqttMsg = self.mqttClient.getConnectMsg();
			var buffer =  Buffer.from(mqttMsg.msg);
			var buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
			var finalBuffer = Buffer.concat(buffSeq);

			Logger.info("Sending MQTT CONNECT"); // : \n" + SimpleMQTT.buf2hex(finalBuffer.toString()));

			await self.serialIO.sendAndExpect( 'AT+KTCPSND=' + self.sessionID + ',' + mqttMsg.len + '\r','.*CONNECT.*',5000).catch((err) => { Logger.error(err);});
			var res = await self.serialIO.sendAndExpect( finalBuffer,'.*KTCP_DATA: *' + self.sessionID +',[0-9]+.*',2000, true).catch((err) => { Logger.error(err);});

			var recLen = parseInt(res.data.match(/.*KTCP_DATA: *[0-9]+,([0-9]+).*/)[1]);
			Logger.debug("got : " +  recLen + " bytes in downstream");
			res = await self.serialIO.sendAndExpect( 'AT+KTCPRCV=' + self.sessionID + ',' + recLen +'\r','.*--EOF--Pattern--.*',5000).catch((err) => { Logger.error(err);});

			var mqttInMsg = self.mqttClient.parseMessage(res.data.replace(/--EOF--Pattern--[\n\r]/gm,''));

			if(mqttInMsg.ret !== 0 ) {
				self.setConnectState(false);
	    		throw {mqttInMsg};
			}
			if(mqttInMsg.type === 'ACK') {
				self.setConnectState(true);
			} else {
				self.setConnectState(false);
			}

			Logger.debug(mqttInMsg);

	    });


		await this.serialIO.sendAndExpect( 'AT+KTCPCNX=' + this.sessionID + '\r','.*KTCP_IND: *' + this.sessionID + ',1.*',30000).catch((err) => { Logger.error(err);});
//		serialIO.writeln('AT+KTCPCNX=' + sessionID + '\r');


	}

	async init() {
	    await this.hl78Specific.init();
	    await this.serialIO.sendAndExpect( 'AT+CREG?\r','^.CREG: (0|1),(5|1).*',2000).catch((err) => { Logger.error(err);}); // are we registered ?
	    await this.serialIO.sendAndExpect( 'AT+CGREG?\r','^.CGREG: (0|1),(5|1).*',2000).catch((err) => { Logger.error(err);});
	    var res = null;
		if(this.nconf.get('setCert')) {
	    	res = await this.serialIO.sendAndExpect( 'AT+KTCPCFG=1,3,"' + this.nconf.get('HOST') + '",' + this.nconf.get('PORT') + ',,,,,1\r','.*KTCPCFG: *[0-9]+.*',12000).catch((err) => { Logger.error(err);});
		} else {
	    	res = await this.serialIO.sendAndExpect( 'AT+KTCPCFG=1,0,"' + this.nconf.get('HOST') + '",' + this.nconf.get('PORT') + ',,,,,1\r','.*KTCPCFG: *[0-9]+.*',12000).catch((err) => { Logger.error(err);});
		}
		this.sessionID = parseInt(res.data.match(/.*KTCPCFG: *([0-9]+).*/)[1]);
		Logger.info("extracted TCP session ID: ", this.sessionID);
		await this.setupConnection(this);

	    this.urcHandler();

	}


	async destroy() {
		this.setConnectState(false);
	    
	    if(this.sessionID !== 0) {
	    	Logger.info("Closing MQTT connection");
			var mqttDisconnectMsg = this.mqttClient.getDisconnectMsg();

			var buffer =  Buffer.from(mqttDisconnectMsg.msg);
			var buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
			var finalBuffer = Buffer.concat(buffSeq);
	
			Logger.debug("Sending DISCONNECT: \n" + SimpleMQTT.buf2hex(finalBuffer));

			await this.serialIO.sendAndExpect( 'AT+KTCPSND=' + this.sessionID + ',' + (mqttDisconnectMsg.len - 1) + '\r','.*CONNECT.*',5000).catch((err) => { Logger.error(err);});
			await this.serialIO.sendAndExpect(  finalBuffer,'.*KTCP_NOTIF: *' + this.sessionID + ',4.*',5000, true).catch((err) => { Logger.error(err);});

			Logger.info("Closing TCP connection");
        	await this.serialIO.sendAndExpect('AT+KTCPCLOSE=' + this.sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
    		await this.serialIO.sendAndExpect('AT+KTCPDEL=' + this.sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
    	}
	    await this.hl78Specific.destroy();
	    this.serialIO.close();
	}


}


module.exports = ConStack;
