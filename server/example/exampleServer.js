"use strict;"
var forge = require ('node-forge');
var JRPCSecServer = require ('../jrpcsec-server.js');
var fs = require ('fs');

var SCert = fs.readFileSync ('ssl/SCert.pem', 'utf8');
var SKey = fs.readFileSync ('ssl/SKey.pem', 'utf8');
var VCert = fs.readFileSync ('ssl/VCert.pem', 'utf8');

var verifyPeer = function (forgeCert) {
    //
    // call back function return value must either be:
    //   - identically true; or
    //   - an object with alert and message members.
    var cn = forgeCert.subject.getField('CN').value;
    var org= forgeCert.subject.getField('O').value;
    console.log ('[example verifyPeer]', 'cn:',cn,'org:',org);
    if(org !== 'Verody') {
        return {
            message: "Organization '" + org + "' is not acceptable",
            alert: forge.tls.Alert.Description.certificate_unknown
        }
    };
    return true;
};

var methods = {
    echo: function (params, next) {
        console.log ('[jrpcsec/exampleServer here ...]', params);
        return next(false, params);
    },
}

var config = {
    server: { port:9000, path:'/jrpcsec' },
    rpcMethods:methods,
    tls: {
        caPEMList: [ VCert, SCert ],
        domainValidationCertPEM: SCert,
        domainValidationKeyPEM: SKey,
        verifyPeer: verifyPeer,
    }
};
//
// Uncomment to test using our own server:
// var jrpcSecServer = new JRPCSecServer (config);

//
// or mooch off existing server:
var httpServer = require('http').createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello World\n');
}).listen(9000);
config.server = {server: httpServer, path: '/jrpcsec'};

var jrpcSecServer = new JRPCSecServer (config);
