#!/bin/bash
(cat ../jrpcsec-client.js
cat <<EOF
BinaryClient = require ('binaryjs').BinaryClient;
JRPC = require ('jrpc');
Forge = require ('node-forge');
JRPCSec = require ('./jrpcsec-client.js');
module.exports = JRPCSec;
EOF
) > jrpcsec-client-node.js
