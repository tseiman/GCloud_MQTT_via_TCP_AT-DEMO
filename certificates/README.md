Put here the _minimal_ Google Public Root CA Certificate used by the MQTT Server.
Please check out google cloud documentation how to obtain it:
https://cloud.google.com/iot/docs/how-tos/mqtt-bridge#downloading_mqtt_server_certificates

Convert the gtsltsr.crt file downloaded from google to a PEM (ascii armoured certifcate) file by using the following commands:

```
openssl x509 -in gtsltsr.crt -inform der -out gtsltsr.pem -outform PEM
```
