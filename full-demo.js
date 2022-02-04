
'use strict';

const Logger           	= require('node-color-log');
const Enc 		= require('@root/encoding/bytes');
const fs		= require('fs');
const nconf 		= require('nconf');
const moment 		= require('moment');
const SerialIO         	= require('./serial-io.js');
const SimpleMQTT       	= require('./superSimpleMqttClient.js');
const TelcoTelemetry  	= require('./telco-telemetry.js');
const ModemSpecific  	= require('./modem-specific.js');
const ConStack		= require('./modem-connectionstack.js');



async function main() {
    nconf.argv().env().file({ 'file': 'config.json'});

    if(nconf.get('nocolorlog')) {
	   Logger.setLevelNoColor();
    }
    Logger.setLevel(nconf.get("loglevel"));


    var serialIO = new SerialIO({port: nconf.get('uart'), baud: 115200, delimiter: "\n"});

    serialIO.open();

    var conStack = new ConStack(serialIO, nconf);
    conStack.init();

    async function cleanExit(err) {
	   Logger.warn("EXITING: ",err);
	   await conStack.destroy();
    }

    process.on('SIGINT', async function(conStack) {
	   await cleanExit("Caught interrupt signal");
       process.exit();
    });
//     var telcoTelemetry = new TelcoTelemetry(serialIO);

//    await hl78Specific.init();
//    await hl78Specific.destroy();
}
main();
