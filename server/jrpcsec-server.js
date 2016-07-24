"use strict;"
var BinaryServer = require ('binaryjs').BinaryServer;
var _ = require ('underscore');
var JRPC = require ('jrpc');
var forge = require ('node-forge'),
    pki = forge.pki;
var async = require ('asyncawait/async');

const defaults = {
    server: { port:9000 },
    rpcMethods: {
        ping: function (params, next) {
            console.log ('[JRPCSec/ping] context:', this.context);
            console.log ('[JRPCSec/ping] params:', params);
            return next(false, { pong:'Still here.' });
        },
    },
    tls: {
        caPEMList: [],
        domainValidationCertPEM: undefined,
        domainValidationKeyPEM: undefined,
        verifyPeer: undefined,
    },
};

function JRPCSecServer (config){

    if (!(this instanceof JRPCSecServer)) {
        return new JRPCSecServer (config);
    }
    var _self = this;
    //console.log ('[JRPCSecServer] config.server:', config.server);
    
    _self.rpcMethods = _.defaults (config.rpcMethods||{}, defaults.rpcMethods);
    console.log ('[JRPCSecServer] rpc methods:', _.keys(_self.rpcMethods));

    _self.tlsConfig = _.defaults(config.tls||{}, defaults.tls);
    _self.tlsConfig.caStore = (_self.tlsConfig.caPEMList.length>0)?
            forge.pki.createCaStore (_self.tlsConfig.caPEMList):undefined;
    //console.log ('[JRPCSecServer] tls config:', _self.tlsConfig);

    _self.serverConfig = config.server||defaults.server;
    //console.log ('[JRPCSecServer] _self.serverConfig:', _self.serverConfig);

    _self.binaryServer = BinaryServer (_self.serverConfig);
    if (_self.serverConfig.port) {
        console.log ('[JRPCSecServer] Listen port:', _self.serverConfig.port);
    }
    console.log ('[JRPCSecServer] Path:', _self.serverConfig.path);

    _self.binaryServer.on ('connection', function (binaryClient) {
        //console.log ('[JRPCSec onConnection] client id:', binaryClient.id, Object.keys(this.clients));

        binaryClient.on ('error', function (err) {
            console.log ('[binaryClient]', err);
        });
        binaryClient.on ('stream', function (binaryStream, meta) {
            if ( meta && meta.type && meta.type=='JRPCSec-TLS-Stream' ) {
                console.log ('[binaryClient onStream', binaryStream.id, ']', meta);
            } else {
                //throw new RangeError ("Invalid stream metadata. Expecting meta.type:'JRPCSec-TLS-Stream'");
                console.log ("[binaryClient] Invalid stream metadata. Expecting meta.type:'JRPCSec-TLS-Stream'");
                binaryStream.end()
            }

            //
            // new jrpcEP peer for every connection. We bind a stream context to
            // the methods before exposing them. And we arrange to make them await-able.
            var tlsPeerCert=undefined;
            var jrpcEP = new JRPC ();
            _.each (_self.rpcMethods, function (method, name) {
                item={};
                item[name]=async(method.bind({ context: {
                    name:name,
                    getPeerCert:function(){ return tlsPeerCert; }
                }}));
                jrpcEP.expose (item);
            });

            //
            // fire up a TLS server endpoint.
            
            var tlsServer = forge.tls.createConnection({
                server: true,
                caStore: _self.tlsConfig.caStore,
                sessionCache: {},
                // supported cipher suites in order of preference 
                cipherSuites: [
                    forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
                    forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
                // require a client-side certificate if you want 
                verifyClient: true,
                verify: function(connection, verified, depth, certs) {
                    if(depth === 0) {
                        //
                        // forgeTLS expects return value to:
                        //     - be identically equal to true if all is well with the world;
                        //     - be an object with 'alert' and 'message' members;
                        //     - or to be a tls.Alert.Description.* class error code.
                        //
                        // Note that we still get a shot at verifying even if the CA chain
                        // walk has failed.
                        //
                        // And we stash a copy of the peer cert in the JRPC object for good measure.
                        tlsPeerCert = certs[0];
                        if (_.isFunction (_self.tlsConfig.verifyPeer)) {
                            //
                            // XXX: need to figure out how to communicate useful failure
                            //      info to app. See tls.js private helper _alertDescToCertError
                            var verifyStatus = verified===true?
                                {valid:true} : { valid:false, info:verified};
                            
                            //
                            // call back function return value must either:
                            //   - be identically true; or
                            //   - be an object with alert and message members.
                            // Otherwise, we fail out.
                            var cbStatus = _self.tlsConfig.verifyPeer (certs[0],verifyStatus);
                            if (cbStatus === true) {
                                return true;
                            } else if (cbStatus && cbStatus.alert && cbStatus.message) {
                                return {
                                    alert: cbStatus.alert,
                                    message: cbStatus.message
                                };
                            } else {
                                return {
                                    alert: forge.tls.Alert.Description.bad_certificate,
                                    message: "unknown application error validating certificate"
                                }
                            }
                        }
                    }
                    return verified;
                },
                connected: function(connection) {
                    //console.log('[tlsServer] connected');
                    jrpcEP.setTransmitter (function (msg, next) {
                        try {
                            connection.prepare (forge.util.encodeUtf8 (msg));
                            return next (false);
                        } catch (e) {
                            return next (true);
                        }
                    });
                },
                getCertificate: function(connection, hint) {
                    return _self.tlsConfig.domainValidationCertPEM;
                },
                getPrivateKey: function(connection, cert) {
                    return _self.tlsConfig.domainValidationKeyPEM;
                },
                tlsDataReady: function(connection) {
                    // TLS data (encrypted) is ready to be sent to the client
                    binaryStream.write(connection.tlsData.getBytes());
                },
                dataReady: function(connection) {
                    // clear data from the client is ready
                    var data = forge.util.decodeUtf8(connection.data.getBytes());
                    // console.log('[tlsServer] the client sent: ' + data);
                    jrpcEP.receive(data);
                },
                closed: function(connection) {
                    //console.log('[tlsServer closed]');
                    binaryStream.end();
                },
                error: function(connection, error) {
                    console.log('[tlsServer error]', error.alert, error.message);
                }
            });
            
            binaryStream.on ('data', function (data) {
                //console.log ('[binaryStream onData] data length:', data.length);
                tlsServer.process(data);
            });

            binaryStream.on ('end', function () {
                //console.log ('[binaryStream onEnd]');
                tlsServer.reset (true);
                jrpcEP.shutdown();
                binaryStream.destroy();
            });

            binaryStream.on ('close', function () {
                //console.log ('[binaryStream onClose]');
                //binaryStream.shutdown();
            });

            binaryStream.on ('error', function (error) {
                console.log ('[binaryStream onerror]', error);
                tlsServer.reset (true);
            });

        });
    });
};
JRPCSecServer.prototype.constructor = JRPCSecServer,
JRPCSecServer.prototype.close = function () {
    this.binaryServer.close (0, "Because it's time.");
}
module.exports = JRPCSecServer;

