#!/bin/bash
(cat ../jrpcsec-client.js
cat <<EOF
BinaryClient = require ('binaryjs').BinaryClient;
JRPC = require ('jrpc');
Forge = require ('node-forge');
exports.JRPCSec = JRPCSec;
EOF
) > jrpcsec-node-client.js
