
const Logger           	= require('node-color-log');
const Enc 		= require('@root/encoding/bytes');
const fs		= require('fs');
const nconf 		= require('nconf');
const moment 		= require('moment');
const SerialIO         	= require('./serial-io.js');
const SimpleMQTT       	= require('./superSimpleMqttClient.js');


nconf.argv().env().file({ 'file': 'config.json'});


var sessionID = 1;

var telemetrie = {  
     "OperatorName"	: "na",
     "MNC"		: 0,
     "MCC"		: 0,
     "RAT"		: 0,
     "TAC"		: 0,
     "CellID"		: 0,
     "RSSI"		: 0,
     "RSRP"		: 0,
     "RSRQ"		: 0,
     "SNR"		: 0,
     "date"		: null
};
if(nconf.get('nocolorlog')) {
     Logger.setLevelNoColor();
}

const dt = nconf.get('dt');


var port = new SerialIO({port: nconf.get('uart'), baud: 115200, delimiter: "\n"});


function wait(delay) {
    return new Promise(function(resolve, reject) {
        setTimeout(resolve, delay);
    });
}

function sendAndExpect(serial,cmd,expect,timeout,noNewLine) {
    if(typeof noNewLine !== 'undefined' && noNewLine ) {
	Logger.warn("sending without delimter");
	serial.write(cmd);
    } else { 
	serial.writeln(cmd);
    }
  return waitURC(serial,expect,timeout);
}


function waitURC(serial,expect,timeout) {
  Logger.info("wait for: " + expect);
  return new Promise(function(resolve, reject) {
    var timeOHandler = null;
    if(timeout !== undefined) { 
        timeOHandler = setTimeout(function() { 
	    Logger.warn("Timeout after " + timeout +"ms waiting for " + expect);
	    reject({data: "timeout", result: false}); 
	}, timeout);         
    }
    serial.setCallback( function (data) { 
	var re = new RegExp(expect);    
	if (re.test(data)) {
	    Logger.info("found expected Data");
	    clearTimeout(timeOHandler);
    	    resolve({"serial": serial, result: true, "data": data});  
	}  

    }); 
  }); 
}




async function cleanAT() {
    await sendAndExpect(port, 'AT+KTCPCLOSE=' + sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
    await wait(dt);
    await sendAndExpect(port, 'AT+KTCPDEL=' + sessionID + '\r','.*',2000).catch((err) => { Logger.error(err);});
    await wait(dt);
    await sendAndExpect(port, 'ATE1\r','.*',2000).catch((err) => { Logger.error(err);});
    await wait(dt);
}

async function cleanExit(err) {
    await cleanAT();
    Logger.error("========== ERROR: ", err);
    port.close(() => process.exit);
    
}

async function f1() {

    const mqttClientId = `projects/${nconf.get('googleProjectId')}/locations/${nconf.get('region')}/registries/${nconf.get('registryId')}/devices/${nconf.get('deviceId')}`;

    var mqttClient = new SimpleMQTT({
	"clientID": mqttClientId, 
	"username": "ignored",  
	"password": "",
	"projectId" : nconf.get('googleProjectId'),
	"privateKeyFile" : nconf.get('devicePrivateKeyFile')
    });

//    var mqttClient = new SimpleMQTT({"clientID": "test-001", "username": "testUser"});

    try {

	var res =  await sendAndExpect(port, 'AT\r','.*',2000); // Just clear any crap from UART
	await wait(dt);
	res =  await sendAndExpect(port, 'ATE0\r','.*OK.*',2000); // disable echo
	await wait(dt);
	res = await sendAndExpect(port, 'ATI\r','.*HL7802.*',2000); // see we're working wiht the right module
	await wait(dt);
	res = await sendAndExpect(port, 'AT+CMEE=1\r','.*OK.*',2000); // error reporting on
	await wait(dt);
	res = await sendAndExpect(port, 'AT+CREG?\r','^.CREG: (0|1),(5|1).*',2000); // are we registered ?
	await wait(dt);
	res = await sendAndExpect(port, 'AT+CGREG?\r','^.CGREG: (0|1),(5|1).*',2000);
	await wait(dt);
	res = await sendAndExpect(port, 'AT+KPATTERN="--EOF--Pattern--"\r','.*OK.*',2000); // set EOF pattern for internal stack
	await wait(dt);
	res = await sendAndExpect(port, 'AT+CGDCONT=1,"IP","' + nconf.get('APN') + '"\r','.*OK.*',2000); // set APN (may needs username and PW)
	await wait(dt);

/*
* ask Telemetry data
*/
//	telemetrie.date
	res =  await sendAndExpect(port, 'AT+COPS?\r','.*COPS.*',2000); // check operator and RAT
	Logger.log(">>>>>>>>>>>>" , res.data);
	await wait(dt);
	telemetrie.OperatorName = res.data.match(/.*COPS: *[0-9],[0-9],.(.*).,.*/)[1]; // "
	telemetrie.RAT = parseInt(res.data.match(/.*COPS: *[0-9],[0-9],.*,([0-9])/)[1]); // "
	Logger.log(">>>>>>>>>>>>" , telemetrie);

 process.exit(0);

/*
* Setting up the public certificate from Google
*/

	if(nconf.get('setCert')) {
	    res = await sendAndExpect(port, 'AT+KSSLCFG=0,3\r','.*OK.*',2000);
	    await wait(dt);
	    res = await sendAndExpect(port, 'AT+KSSLCFG=1,"edge"\r','.*OK.*',2000);
	    await wait(dt);
	    res = await sendAndExpect(port, 'AT+KSSLCFG=2,0\r','.*OK.*',2000);
	    await wait(dt);
// 1,9,3,25456,12,4,1,0
	    res = await sendAndExpect(port, 'AT+KSSLCRYPTO=1,8,3,25392,12,4,1,0\r','.*OK.*',2000);
	    await wait(dt);
	    try {
		var certDataPEM  = fs.readFileSync(nconf.get('tlsCert'), 'ascii');
		res = await sendAndExpect(port, 'AT+KCERTSTORE=0,' + certDataPEM.length + ',0' + '\r','.*CONNECT.*',5000);
		res = await sendAndExpect(port, certDataPEM,'.*OK.*',2000);
	    } catch(e) {}
	
	    res = await sendAndExpect(port, 'AT+CTZU=0\r','.*OK.*',2000);
	    await wait(dt);
	    res = await sendAndExpect(port, 'AT+CTZR=0\r','.*OK.*',2000);
	    await wait(dt);
	}

	var date = new Date();

	var jetzt = moment(date).format('YY/MM/DD,HH:mm:ss+08');

	res = await sendAndExpect(port, 'AT+CCLK="' + jetzt + '"\r','.*OK.*',2000);
	await wait(dt);
	

	res = await sendAndExpect(port, 'AT+KCNXCFG=1,"GPRS","' + nconf.get('APN') + '"\r','.*OK.*',2000);
	await wait(dt);

	if(nconf.get('setCert')) {
	    res = await sendAndExpect(port, 'AT+KTCPCFG=1,3,"' + nconf.get('HOST') + '",' + nconf.get('PORT') + ',,,,,1\r','.*KTCPCFG: *[0-9]+.*',12000);
	} else {
	    res = await sendAndExpect(port, 'AT+KTCPCFG=1,0,"' + nconf.get('HOST') + '",' + nconf.get('PORT') + ',,,,,1\r','.*KTCPCFG: *[0-9]+.*',12000);
	}
	sessionID = parseInt(res.data.match(/.*KTCPCFG: *([0-9]+).*/)[1]);
	Logger.info("extracted session ID: ", sessionID);
	await wait(dt);
	res = await sendAndExpect(port, 'AT+KTCPCNX=' + sessionID + '\r','.*KTCP_IND: *' + sessionID + ',1.*',30000);
	await wait(dt);

	var mqttMsg = mqttClient.getConnectMsg();

	var buffer =  Buffer.from(mqttMsg.msg);
	var buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
	finalBuffer = Buffer.concat(buffSeq);


	Logger.info("Sending CONNECT: " + mqttClient.buf2hex(finalBuffer));

	res = await sendAndExpect(port, 'AT+KTCPSND=' + sessionID + ',' + mqttMsg.len + '\r','.*CONNECT.*',5000);
	await wait(dt);


/*
	res = await sendAndExpect(port, mqttCon.msg + '--EOF--Pattern--','.*OK.*',2000);
 	await wait(dt);
	console.log("wait for downstream");
	res = await waitURC(port,'.*KTCP_DATA: *' + sessionID +',[0-9]+.*',120000);

* ^^^^^ I can't do that - becasue this implementation is too SLOW !
* the answer comes too fast and needs to be fetched fast enough
* I can't wait for "OK" I need to wait direclty for KTCP_DATA and ignore "OK"
*/
	res = await sendAndExpect(port, finalBuffer,'.*KTCP_DATA: *' + sessionID +',[0-9]+.*',2000, true);

	var recLen = parseInt(res.data.match(/.*KTCP_DATA: *[0-9]+,([0-9]+).*/)[1]);
	Logger.info("got : " +  recLen + " bytes in downstream");
	await wait(dt);
	res = await sendAndExpect(port, 'AT+KTCPRCV=' + sessionID + ',' + recLen +'\r','.*--EOF--Pattern--.*',5000);

	var mqttInMsg = mqttClient.parseMessage(res.data.replace(/--EOF--Pattern--[\n\r]/gm,''));

	if(mqttInMsg.ret !== 0 ) {
	    throw {mqttInMsg};
	}
	Logger.info(mqttInMsg);

	mqttMsg = mqttClient.getPublishMsg("/devices/" + nconf.get('deviceId') + "/events", JSON.stringify(telemetrie));
	Logger.info("Sending PUBLISH: " + mqttClient.buf2hex(mqttMsg.msg));

	await wait(dt);

	res = await sendAndExpect(port, 'AT+KTCPSND=' + sessionID + ',' + mqttMsg.len + '\r','.*CONNECT.*',5000);
//	res = await sendAndExpect(port, mqttMsg.msg + '--EOF--Pattern--','.*OK.*',2000, true);
	res = await sendAndExpect(port, Buffer.concat([mqttMsg.msg, Buffer.from('--EOF--Pattern--','utf8')]),'.*OK.*',2000, true);
 	await wait(dt);

/*
 * here the PINg message comes
*/ 
	var mqttPingMsg = mqttClient.getPingReqMsg();

	buffer =  Buffer.from(mqttPingMsg.msg);
	buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
	finalBuffer = Buffer.concat(buffSeq);
	

	res = await sendAndExpect(port, 'AT+KTCPSND=' + sessionID + ',' + (mqttPingMsg.len - 1) + '\r','.*CONNECT.*',5000);
	await wait(dt);
	res = await sendAndExpect(port,  finalBuffer,'.*KTCP_DATA: *' + sessionID +',[0-9]+.*',12000, true);

	recLen = parseInt(res.data.match(/.*KTCP_DATA: *[0-9]+,([0-9]+).*/)[1]); 
	Logger.info("got : " +  recLen + " bytes in downstream");
	await wait(dt);
	res = await sendAndExpect(port, 'AT+KTCPRCV=' + sessionID + ',' + recLen +'\r','.*--EOF--Pattern--.*',5000);

	mqttInMsg = mqttClient.parseMessage(res.data.replace(/--EOF--Pattern--[\n\r]/gm,''));

/*	if(mqttInMsg.ret !== 0 ) {
	    throw {mqttInMsg};
	} */
	Logger.info("Ping resonse:",  mqttInMsg);

	await wait(dt);


/*
 * here the PINg message comes
*/ 

	var mqttDisconnectMsg = mqttClient.getDisconnectMsg();

	buffer =  Buffer.from(mqttDisconnectMsg.msg);
	buffSeq = [buffer, Buffer.from("--EOF--Pattern--")];
	finalBuffer = Buffer.concat(buffSeq);
	
	Logger.info("Sending DISCONNECT: " + mqttClient.buf2hex(finalBuffer));

	res = await sendAndExpect(port, 'AT+KTCPSND=' + sessionID + ',' + (mqttDisconnectMsg.len - 1) + '\r','.*CONNECT.*',5000);
	await wait(dt);
//	res = await sendAndExpect(port,  finalBuffer,'.*OK.*',5000, true);
	res = await sendAndExpect(port,  finalBuffer,'.*KTCP_NOTIF: 1,4.*',5000, true);



	await wait(5000);

	await cleanAT();

	port.close(() => process.exit);
    } catch(err) {
	Logger.warn(err);
	cleanExit(err);
    }
}

port.open();


f1();