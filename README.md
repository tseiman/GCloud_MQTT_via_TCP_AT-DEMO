# GCloud MQTT via TCP AT DEMO

## Overview
**Please Note: this is more hacked than good code and is just here to demonstrate requried AT commands and MQTT procedures and is highly experimental**

This setup demonstrates GCloud MQTT IoT Core via an Sierra Wireless HL780x (https://www.sierrawireless.com/iot-solutions/products/hl7800/) TCP Stack AT command - implemented in a node JS script.

## Description
Often IoT Cellular (but as well LORA or WiFi) modems offer an embedded TCP stack. This limits the networking effort on an eventual small MCU - driving the modem. Some modems offer as well an embedded MQTT stack however Google cloud IoT Central MQTT server has special requirements in sense of timing and authentication which are not so easy to meet. In general this demo can show that GCloud MQTT server might be not a very good solution for cellular IoT communcation as it is way too senetive in sense of timing. Additionally it requires compareable long strings for MQTT authentication and e.g. MQTT PUBLISH (e.g. including project name etc.) which is pretty unnessesary payload for a mobile network - especially when it comes to LPWA technologies like CatM1 or even NBIoT.

## Installation:
- In the folder of the project
```
npm install
```
- copy the *config.json.SAMPLE* to *config.json*
```
cp config.json.SAMPLE config.json
```
- Download the Google minimal IoT certificate from here https://pki.goog/gtsltsr/gtsltsr.crt into the *certifcates* folder.
- convert this certifcate into an ASCII armored version e.g. by using OpenSSL: 
```
cd certificates
wget https://pki.goog/gtsltsr/gtsltsr.crt
openssl x509 -inform DER -in gtsltsr.crt -out gtsltsr.pem -outform PEM
cd ..
```
Now the MQTT client needs an authentication key pair for the google cloud - which needs to generated in the folder *google-keys* e.g. like:

```
cd google-keys
openssl genpkey -algorithm RSA -out rsa_private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in rsa_private.pem -pubout -out rsa_public.pem
cd ..
```
Place the public key from the *google-keys* folder in the device configuration of Google IoT central device managment (**GCloud --> IoT Core --> Devices --> Create Device --> Coomunication, Cloud Logging, Authentication --> Authentication (optional) --> e.g. Manual key upload**)
- configure the *config.json* according to your needs. Especially adopt the Google project-, device- and IoT Core registryId


## How to run:
```
node main.js
```

You should see now the communication via AT commands e.g.:
- setting up the Mobile stack (APN)
- configure TLS Certifcate for secure TCP TLS communciation with Google MQTT service
- configuring the TCP stack via AT commands
- sending MQTT CONNECT, PUBLISH, PING, DISCONNECT messages via the Modem embedded TCP stack
- tearing down the TCP conenction

