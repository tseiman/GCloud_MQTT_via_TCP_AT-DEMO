
'use strict';

const Logger           	= require('node-color-log');
const Enc 		= require('@root/encoding/bytes');
const fs		= require('fs');
const nconf 		= require('nconf');
const moment 		= require('moment');
const SerialIO         	= require('./serial-io.js');
const SimpleMQTT       	= require('./superSimpleMqttClient.js');
const TelcoTelemetry  	= require('./telco-telemetry.js');


nconf.argv().env().file({ 'file': 'config.json'});


var sessionID = 1;

if(nconf.get('nocolorlog')) {
     Logger.setLevelNoColor();
}



var serialIO = new SerialIO({port: nconf.get('uart'), baud: 115200, delimiter: "\n"});

var telcoTelemetry = new TelcoTelemetry(serialIO);


async function cleanAT() {
    await serialIO.sendAndExpect('AT+KTCPCLOSE=' + sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
    await serialIO.sendAndExpect('AT+KTCPDEL=' + sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
    await serialIO.sendAndExpect( 'ATE1\r','.*',2000).catch((err) => { Logger.error(err);});
}

async function cleanExit(err) {
    await cleanAT();
    Logger.error("========== ERROR: ", err);
    serialIO.close(() => process.exit);
    
}

process.on('SIGINT', function() {
    cleanExit("Caught interrupt signal");
    process.exit();
});


async function f1() {

    const mqttClientId = `projects/${nconf.get('googleProjectId')}/locations/${nconf.get('region')}/registries/${nconf.get('registryId')}/devices/${nconf.get('deviceId')}`;

    var mqttClient = new SimpleMQTT({
	"clientID": mqttClientId, 
	"username": "ignored",  
	"password": "",
	"projectId" : nconf.get('googleProjectId'),
	"privateKeyFile" : nconf.get('devicePrivateKeyFile')
    });


    try {

	var res =  await serialIO.sendAndExpect('AT\r','.*',2000); // Just clear any crap from UART
	res =  await serialIO.sendAndExpect('ATE0\r','.*OK.*',2000); // disable echo
	res = await serialIO.sendAndExpect( 'ATI\r','.*HL7802.*',2000); // see we're working wiht the right module
	res = await serialIO.sendAndExpect( 'AT+CMEE=1\r','.*OK.*',2000); // error reporting on
	res = await serialIO.sendAndExpect( 'AT+CREG?\r','^.CREG: (0|1),(5|1).*',2000); // are we registered ?
	res = await serialIO.sendAndExpect( 'AT+CGREG?\r','^.CGREG: (0|1),(5|1).*',2000);
	res = await serialIO.sendAndExpect( 'AT+KPATTERN="--EOF--Pattern--"\r','.*OK.*',2000); // set EOF pattern for internal stack
	res = await serialIO.sendAndExpect( 'AT+CGDCONT=1,"IP","' + nconf.get('APN') + '"\r','.*OK.*',2000); // set APN (may needs username and PW)

/*
* ask Telemetry data
*/

	var telemetry = await telcoTelemetry.getTelcoTelemetry();


/*
* Setting up the public certificate from Google
*/

	if(nconf.get('setCert')) {
	    res = await serialIO.sendAndExpect( 'AT+KSSLCFG=0,3\r','.*OK.*',2000);
	    res = await serialIO.sendAndExpect( 'AT+KSSLCFG=1,"edge"\r','.*OK.*',2000);
	    res = await serialIO.sendAndExpect( 'AT+KSSLCFG=2,0\r','.*OK.*',2000);
	    // 1,9,3,25456,12,4,1,0
	    res = await serialIO.sendAndExpect( 'AT+KSSLCRYPTO=1,8,3,25392,12,4,1,0\r','.*OK.*',2000);
	    try {
		var certDataPEM  = fs.readFileSync(nconf.get('tlsCert'), 'ascii');
		res = await serialIO.sendAndExpect( 'AT+KCERTSTORE=0,' + certDataPEM.length + ',0' + '\r','.*CONNECT.*',5000);
		res = await serialIO.sendAndExpect( certDataPEM,'.*OK.*',2000,true);
	    } catch(e) {}
	
	    res = await serialIO.sendAndExpect( 'AT+CTZU=0\r','.*OK.*',2000);
	    res = await serialIO.sendAndExpect( 'AT+CTZR=0\r','.*OK.*',2000);
	}

	var date = new Date();

	var jetzt = moment(date).format('YY/MM/DD,HH:mm:ss+08');

	res = await serialIO.sendAndExpect( 'AT+CCLK="' + jetzt + '"\r','.*OK.*',2000);
	res = await serialIO.sendAndExpect( 'AT+KCNXCFG=1,"GPRS","' + nconf.get('APN') + '"\r','.*OK.*',2000);
	
	if(nconf.get('setCert')) {
	    res = await serialIO.sendAndExpect( 'AT+KTCPCFG=1,3,"' + nconf.get('HOST') + '",' + nconf.get('PORT') + ',,,,,1\r','.*KTCPCFG: *[0-9]+.*',12000);
	} else {
	    res = await serialIO.sendAndExpect( 'AT+KTCPCFG=1,0,"' + nconf.get('HOST') + '",' + nconf.get('PORT') + ',,,,,1\r','.*KTCPCFG: *[0-9]+.*',12000);
	}
	sessionID = parseInt(res.data.match(/.*KTCPCFG: *([0-9]+).*/)[1]);
	Logger.info("extracted session ID: ", sessionID);
	res = await serialIO.sendAndExpect( 'AT+KTCPCNX=' + sessionID + '\r','.*KTCP_IND: *' + sessionID + ',1.*',30000);



	var mqttMsg = mqttClient.getConnectMsg();
	var buffer =  Buffer.from(mqttMsg.msg);
	var buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
	var finalBuffer = Buffer.concat(buffSeq);

	Logger.info("Sending CONNECT: " + SimpleMQTT.buf2hex(finalBuffer));

	res = await serialIO.sendAndExpect( 'AT+KTCPSND=' + sessionID + ',' + mqttMsg.len + '\r','.*CONNECT.*',5000);


/*
	res = await serialIO.sendAndExpect( mqttCon.msg + '--EOF--Pattern--','.*OK.*',2000);
 		console.log("wait for downstream");
	res = await waitURC('.*KTCP_DATA: *' + sessionID +',[0-9]+.*',120000);

* ^^^^^ I can't do that - becasue this implementation is too SLOW !
* the answer comes too fast and needs to be fetched fast enough
* I can't wait for "OK" I need to wait direclty for KTCP_DATA and ignore "OK"
*/
	res = await serialIO.sendAndExpect( finalBuffer,'.*KTCP_DATA: *' + sessionID +',[0-9]+.*',2000, true);

	var recLen = parseInt(res.data.match(/.*KTCP_DATA: *[0-9]+,([0-9]+).*/)[1]);
	Logger.info("got : " +  recLen + " bytes in downstream");
	res = await serialIO.sendAndExpect( 'AT+KTCPRCV=' + sessionID + ',' + recLen +'\r','.*--EOF--Pattern--.*',5000);

	var mqttInMsg = mqttClient.parseMessage(res.data.replace(/--EOF--Pattern--[\n\r]/gm,''));

	if(mqttInMsg.ret !== 0 ) {
	    throw {mqttInMsg};
	}
	Logger.info(mqttInMsg);

	mqttMsg = mqttClient.getPublishMsg("/devices/" + nconf.get('deviceId') + "/events", JSON.stringify(telemetry));
	Logger.info("Sending PUBLISH: " + SimpleMQTT.buf2hex(mqttMsg.msg));

	
	res = await serialIO.sendAndExpect( 'AT+KTCPSND=' + sessionID + ',' + mqttMsg.len + '\r','.*CONNECT.*',5000);
	res = await serialIO.sendAndExpect( Buffer.concat([mqttMsg.msg, Buffer.from('--EOF--Pattern--','utf8')]),'.*OK.*',2000, true);
 	
/*
 * here the PINg message comes
*/ 
	var mqttPingMsg = mqttClient.getPingReqMsg();

	buffer =  Buffer.from(mqttPingMsg.msg);
	buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
	finalBuffer = Buffer.concat(buffSeq);
	

	res = await serialIO.sendAndExpect( 'AT+KTCPSND=' + sessionID + ',' + (mqttPingMsg.len - 1) + '\r','.*CONNECT.*',5000);
	res = await serialIO.sendAndExpect(  finalBuffer,'.*KTCP_DATA: *' + sessionID +',[0-9]+.*',12000, true);

	recLen = parseInt(res.data.match(/.*KTCP_DATA: *[0-9]+,([0-9]+).*/)[1]); 
	Logger.info("got : " +  recLen + " bytes in downstream");
	res = await serialIO.sendAndExpect( 'AT+KTCPRCV=' + sessionID + ',' + recLen +'\r','.*--EOF--Pattern--.*',5000);

	mqttInMsg = mqttClient.parseMessage(res.data.replace(/--EOF--Pattern--[\n\r]/gm,''));

/*	if(mqttInMsg.ret !== 0 ) {
	    throw {mqttInMsg};
	} */
	Logger.info("Ping resonse:",  mqttInMsg);

	

/*
 * here the PINg message comes
*/ 

	var mqttDisconnectMsg = mqttClient.getDisconnectMsg();

	buffer =  Buffer.from(mqttDisconnectMsg.msg);
	buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
	finalBuffer = Buffer.concat(buffSeq);
	
	Logger.info("Sending DISCONNECT: " + SimpleMQTT.buf2hex(finalBuffer));

	res = await serialIO.sendAndExpect( 'AT+KTCPSND=' + sessionID + ',' + (mqttDisconnectMsg.len - 1) + '\r','.*CONNECT.*',5000);
	res = await serialIO.sendAndExpect(  finalBuffer,'.*KTCP_NOTIF: *' + sessionID + ',4.*',5000, true);



	
	await cleanAT();

	serialIO.close(() => process.exit);
    } catch(err) {
//	Logger.warn(err);
//	cleanExit(err);
    }
}

serialIO.open();


f1();
