```
cd google-keys
openssl genpkey -algorithm RSA -out rsa_private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in rsa_private.pem -pubout -out rsa_public.pem
cd ..
```
Place the public key from the *google-keys* folder in the device configuration of Google IoT central device managment (**GCloud --> IoT Core --> Devices --> Create Device --> Coomunication, Cloud Logging, Authentication --> Authentication (optional) --> e.g. Manual key upload**)
