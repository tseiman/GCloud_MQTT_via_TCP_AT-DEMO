# GCloud MQTT via TCP AT DEMO

## Overview
**Please Note: this is more hacked than good code and is just here to demonstrate requried AT commands and MQTT procedures and is highly experimental**

This setup demonstrates GCloud MQTT IoT Core via an Sierra Wireless HL780x (https://www.sierrawireless.com/iot-solutions/products/hl7800/) TCP Stack AT command - implemented in a node JS script.

## Description
Often IoT Cellular (but as well LORA or WiFi) modems offer an embedded TCP stack. This limits the networking effort on an eventual small MCU - driving the modem. Some modems offer as well an embedded MQTT stack however Google cloud IoT Central MQTT server has special requirements in sense of timing and authentication which are not so easy to meet. In general this demo can show that GCloud MQTT server might be not a very good solution for cellular IoT communcation as it is way too senetive in sense of timing. Additionally it requires compareable long strings for MQTT authentication and e.g. MQTT PUBLISH (e.g. including project name etc.) which is pretty unnessesary payload for a mobile network - especially when it comes to LPWA technologies like CatM1 or even NBIoT.

## Installation:
- Download the Google minimal IoT certificate from here https://pki.goog/gtsltsr/gtsltsr.crt into the certifcates folder.
- convert this certifcate into an ASCII armored version e.g. by using OpenSSL: 
```
openssl x509 -inform DER -in gtsltsr.crt -out gtsltsr.pem -outform PEM
```
Now the MQTT client needs an authentication key pair for the google cloud - which needs to generated in the folder *google-keys* e.g. like:

```
openssl genpkey -algorithm RSA -out rsa_private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in rsa_private.pem -pubout -out rsa_public.pem
```
Place the public key in the device configuration of Google IoT central device managment (GCloud --> IoT Core --> Devices --> Create Device --> Coomunication, Cloud Logging, Authentication --> Authentication (optional) --> e.g. Manual key upload)


In the folder of the project
```
npm install
```
## How to run:
```
node main.js

