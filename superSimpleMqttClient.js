const Logger           = require('node-color-log');
const jwt              = require('jsonwebtoken');
const fs               = require('fs');



/* conenct flags - can be combined with Binary OR */
const 	ConnectFlag_CleanSession 	= 2,
	ConnectFlag_Will 		= 4,
	ConnectFlag_QoS1 		= 8,
	ConnectFlag_QoS2 		= 16,
	ConnectFlag_QoS3 		= 24,
	ConnectFlag_WillRetain 		= 32,
	ConnectFlag_Password 		= 64,
	ConnectFlag_User 		= 128;


/*  Return codes with the related meaning mapped */
const MQTT_ReturnCodes = {
    0:	"Connection accepted",
    1:	"Connection refused, unacceptable protocol version",
    2:	"Connection refused, identifier rejected",
    3:	"Connection refused, server unavailable",
    4:	"Connection refused, bad user name or password",
    5:	"Connection refused, not authorized"
};

class SimpleMQTT {

/* *******************************
 * The constructor thaks a config JSON. 
 * At the mometn it has only one member "clientID"
 * which is the MQTT clientID
 */

    constructor(config) {
	this.config  =  config;
	if(typeof this.config.clientID === 'undefined' || this.config.clientID == null) {
	    this.config.clientID = "Unknown/client";
	}
	
	this.config.algorithm = 'RS256';

    	if(typeof this.config.privateKeyFile === 'undefined' || this.config.privateKeyFile == null) {
	    throw "privateKeyFile not set";
	}

    	if(typeof this.config.projectId === 'undefined' || this.config.projectId == null) {
	    throw "google projectId not set";
	}
    


    }

/* *******************************
 * Helper method - is to dump a binary buffer into hex (to display the buffer)
 */
    buf2hex(buffer) {
	return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join(' ');
    }

/* *******************************
 * Helper method - encode the length information into the dynamic len field
 */

    encodeMqttMesageLen(len) {
	var lenFieldArray = [];
	do {
            var encodedByte = len % 128;
            len = Math.floor(len / 128);

	    if ( len > 0 ) {  // if there are more data to encode, set the top bit of this byte
        	encodedByte = encodedByte | 128;
            }
	    lenFieldArray.push(encodedByte);
                    console.log(">>>>" + encodedByte.toString(16));
	}  while ( len > 0 );
	return lenFieldArray;
    }


/* *******************************
 * Helper method - converts int to binary (string)
 */

    dec2bin(dec) {
	return (dec >>> 0).toString(2);
    }


/* *******************************
 * Helper method - converts a 32bit (max) integer into a 4 byte array
 */
    toBytesInt32(num) {
	var arr = new Uint8Array([
    	    (num & 0xff000000) >> 24,
            (num & 0x00ff0000) >> 16,
            (num & 0x0000ff00) >> 8,
            (num & 0x000000ff)
	]);
	return arr;
    }


/* *******************************
 * Helper method - converts a string to a byte array
 */
    stringToByteArray(str) {
	var bytes = [];
	for (var i = 0; i < str.length; ++i) {
	    var code = str.charCodeAt(i);
	    bytes = bytes.concat([code]);
	}
	return bytes;
    }

/* ******************************
 * Runs the signature of the connect token
 */

    createJwt() {
  // Create a JWT to authenticate this device. The device will be disconnected
  // after the token expires, and will have to reconnect with a new token. The
  // audience field should always be set to the GCP project id.
	const token = {
	    iat: parseInt(Date.now() / 1000),
	    exp: parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
	    aud: this.config.projectId,
	};
	const privateKey = fs.readFileSync(this.config.privateKeyFile);
	return jwt.sign(token, privateKey, {algorithm: this.config.algorithm});
    };


/* *******************************
 * returns simply a more or less manually assembled MQTT conenct message
 */
    getConnectMsg() {

	var connectMessageItems = [];
	var flag = ConnectFlag_CleanSession;

	connectMessageItems.push({'len': this.config.clientID.length, 'value': this.config.clientID});
	
	if(typeof this.config.username !== 'undefined' && this.config.username != null) {
	    flag = flag + ConnectFlag_User;
	    connectMessageItems.push({'len': this.config.username.length, 'value': this.config.username});

	}
	if(typeof this.config.password !== 'undefined' && this.config.password != null) {
	    flag = flag + ConnectFlag_Password;
	    var pw =  this.createJwt();
	    connectMessageItems.push({'len': pw.length, 'value': pw});
	}




/* --------------------------------------------------------------------------------------------------------------


                                                         Keep Alive
                                                 Connect Flag     |
                                        Protocol version    |     |
                       protocol name                   |    |     |           
       length of protocol name     |                   |    |     |
                             |     |                   |    |     |
	                     v     v  MQIsdp           |    |     v     
		          -------  -----------------   v    v  -------    */
	var dataBuffer = [0x0,0x4,0x4d,0x51,0x54,0x54,0x4,flag,0x0,0x5];
//	var dataBuffer = [0x0,0x5,0x6d,0x71,0x74,0x74,0x73,0x4,flag,0x0,0x5];
// mqtts
	var that = this;
	connectMessageItems.forEach(function (item, index) {
	    var lenghtHiByte = that.toBytesInt32(item.len)[2];
	    dataBuffer.push(lenghtHiByte);
	    var lenghtLoByte = that.toBytesInt32(item.len)[3];
	    dataBuffer.push(lenghtLoByte);
	    dataBuffer = dataBuffer.concat(that.stringToByteArray(item.value));
	});

	var headerBuffer = [0x10]; // This is a CONNECT message
	var totalLen = dataBuffer.length;

	do {
    	    var encodedByte = totalLen % 128;
            totalLen = Math.floor(totalLen/128);

            if ( totalLen > 0 ) { // if there are more data to encode, set the top bit of this byte
                 encodedByte = encodedByte | 128;
            }

	    headerBuffer.push(this.toBytesInt32(encodedByte)[3]);

        } while ( totalLen > 0 );


	var message = Buffer.concat([Buffer.from(headerBuffer),Buffer.from(dataBuffer)]);



//	var buffer = Buffer.from(headerBuffer);
// 	var buffer = Buffer.concat( [Buffer.from(headerBuffer), Buffer.from(dataBuffer)], headerBuffer.length + dataBuffer.length);

//	buffer[1] = this.toBytesInt32(buffer.length - 2)[3]; // minus message type and total length byte fields
/*	var message = new Buffer(headerBuffer.length + dataBuffer.length);
	for (var i = 0; i < headerBuffer.length; ++i) {
	    message[i] = headerBuffer[i];
	}
	for (var i = 0; i < dataBuffer.length; ++i) {
	    message[i + headerBuffer.length] = dataBuffer[i];
	}
	
*/


	return {"len" :   dataBuffer.length , "msg": message };
    }
    
/* *******************************
*/
    getPublishMsg(topic, msg) {
	var publish = 0x30;
	var topicLenHiByte = this.toBytesInt32(topic.length)[2];
	var topicLenLoByte = this.toBytesInt32(topic.length)[3];

/* --------------------------------------------------------------
                              topic Len
    Total Length - will do later      |
	         PUBLISH       |      v
		       v       v  ----------------------------      */
/*	var buffer = [publish,0x0,topicLenHiByte,topicLenLoByte]; */
/* we merge the langth aferward in as it is generated with dynamic length */
	var buffer = [publish, /* 0x0,*/ topicLenHiByte,topicLenLoByte];

	buffer = buffer.concat(this.stringToByteArray(topic));
	buffer = buffer.concat(this.stringToByteArray(msg));

//	buffer[1] = this.toBytesInt32(buffer.length - 2)[3]; // minus message type and total length byte fields

console.log("----------------------------------" + (buffer.length - 1));
	var lenFieldArray = this.encodeMqttMesageLen(buffer.length - 1);  // minus message type and total length byte fields
	var mergePos = 1;
	lenFieldArray.forEach(lenByte => {
	    buffer.splice(mergePos, 0, this.toBytesInt32(lenByte)[3]);
	    ++mergePos;
	});
	
	var message = Buffer.alloc(buffer.length,"ascii");
	for (var i = 0; i < buffer.length; ++i) {
	    message[i] = buffer[i];
	}
	

	return {"len" : buffer.length, "msg": message };
	
    }


/* *******************************
*/
    getPingReqMsg() {

/* --------------------------------------------------------------
         Total len = 0      |
	            PING    |
		       v    v    */
	var buffer = [0xc0,0x0];
//	var buffer = [0xab,0xcd];

	var message = Buffer.alloc(buffer.length,"ascii");
	for (var i = 0; i < buffer.length; ++i) {
	    message[i] = buffer[i];
	}
	

	return {"len" : buffer.length, "msg": message };
	
    }

/* *******************************
*/
    getDisconnectMsg() {

/* --------------------------------------------------------------
         Total len = 0      |
	            PING    |
		       v    v    */
	var buffer = [0xe0,0x0];
//	var buffer = [0xab,0xcd];

	var message = Buffer.alloc(buffer.length,"ascii");
	for (var i = 0; i < buffer.length; ++i) {
	    message[i] = buffer[i];
	}
	

	return {"len" : buffer.length, "msg": message };
	
    }


/* *******************************
 * This takes an incomming message and checks what kind of message it is.
 * The methos returns a JSOn structure with the return code and the message type
 * An error message  might be additionally additionally with it's String error message
 */
    parseMessage(msg) {
	var res= {};

	this.stringToByteArray(msg);

	var buffer = this.stringToByteArray(msg);
	Logger.info("Incomming message: " + this.buf2hex(buffer) + ", msg code:" + buffer[0]);

	if(buffer[0] == 0x20) {
	    res.type = "ACK"; // yes- this is a very very basic implementation and needs more
	    var mqttRet = parseInt(buffer[3]);
	    res.ret = mqttRet;
	    res.retMsg = MQTT_ReturnCodes[mqttRet];
	} else if(buffer[0] == 0xd0) {
	    res.type = "PONG";
	    res.ret = null;
	    res.retMsg = null;
	}
	return res;
    }

}
module.exports = SimpleMQTT;
