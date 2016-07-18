const _configDefaults = {
    debug: false,
    clientCertPEM: '',
    clientKeyPEM: '',
    caPEMList: [],
    cipherSuites: null,
    remoteURL: 'ws://localhost:9000/jrpcsec',
    methods: [],
    idString: 'jrpcsec-client'
    
};
JRPCSec = function () {

    if (!(this instanceof JRPCSec)) {
        //return new JRPCSec (arguments);
        var ret = Object.create(JRPCSec.prototype);
        JRPCSec.apply(ret, arguments);
        return ret;
    }

    var _self = this;

    if (arguments.length  == 1) {
        _self.config = arguments[0];
        
    } else if ( arguments.length == 2) {
        if (!_.isFunction (arguments[1])) {
            throw TypeError ("JRPCSec -- second argument must be a callback function.");
        }
        _self.config = arguments[0];
        _self.readyCB = argunemts[1];

    } else if (arguments.length == 4) {
        if (!_.isFunction (arguments[3])) {
            throw TypeError ("JRPCSec -- fourth argument must be a callback function.");
        }
        _self.config = arguments[0];
        _self.config.oneShot = true;
        var method = arguments[1],
            params = arguments[2],
            cb = arguments[3];
        
        _self.readyCB = function (rpc) {
            return rpc.call (method, params, cb);
        };

    } else {

            throw TypeError ("JRPCSec -- expecting 1, 2 or 4 arguments.");
    }
    _self.config = _.defaults (_self.config, _configDefaults);

    if (!_.has (_self.config.methods, 'ping')) {
        _self.config.methods['ping'] = function (params, next) {
            return next (false, _self.config.idString);
        };
    }

    if (_.isFunction (_self.config.logger)) {
        _self.logger = _self.config.logger;
    } else {
        _self.logger = function () {};
    }

    //_self.logger ('[JPRCSec] config:', _self.config);
    //
    // TLS client instance communicates with peer over tlsStream, a
    // binaryJS websocket;
    _self.tlsClient = undefined;
    _self.tlsStream = undefined;
    _self.binaryjsClient = undefined;

    //
    // We expose the secured json RPC client in a
    // 'call' method later
    _self.jrpcClient = undefined;


    var tlsOptions = {
        server: false,

        verify: function(connection, verified, depth, certs) {
            //_self.logger('[jrpcsec/tls verify] server certificate verified:', verified);
            return verified;
        },
        
        connected: function(connection) {
            //_self.logger('[jrpcsec/tls connected]');
            _self.jrpcClient = new JRPC ({client:true});
            _self.jrpcClient.setTransmitter (function (msg, next) {
                //_self.logger ('[rpcTransmitter]',msg);
                try {
                    _self.tlsClient.prepare (Forge.util.encodeUtf8(msg));
                    return next (false);
                } catch (e) {
                    _self.logger ('[rpcTransmitter]',e);
                    return next (true);
                }
            });
            //
            // negotiate extended capabilities, because ... why, exactly?
            _self.jrpcClient.upgrade();
            if (_self.readyCB) {
                _self.readyCB(_self);
            }
            
        },
        
        dataReady: function(connection) {
            // clear data from the server is ready 
            var data = Forge.util.decodeUtf8(connection.data.getBytes());
            // _self.logger('[tlsClient dataReady] data received from the server: ' + data);
            _self.jrpcClient.receive(data);
        },
        closed: function() {
            _self.logger('[tlsClient disconnected]');
        },
        error: function(connection, error) {
            _self.logger('[tlsClient error]', error);
            connection.close();
        }
    }
    if (_self.config.clientCertPEM && _self.config.clientKeyPEM) {
        tlsOptions.getCertificate = function (connection, hint) { return _self.config.clientCertPEM };
        tlsOptions.getPrivateKey = function (connection, cert) {  return _self.config.clientKeyPEM };
    }
    if (_self.config.caPEMList.length>0) {
        tlsOptions.caStore = Forge.pki.createCaStore (_self.config.caPEMList);
    }


    _self.binaryjsClient = new BinaryClient (_self.config.remoteURL);
    _self.binaryjsClient.on ('error', function (error){
        _self.logger('JRPCSec net error:', error);
        _self.logger ('remoteURL:', _self.config.remoteURL);
        if ( _self.config.debug === true ) {
            _self.logger ('config:', _self.config);
        }
        _self.close ();
    });

    _self.binaryjsClient.on ('open', function (){
        //_self.logger ('[jrpcsec/binaryjsClient onopen] client.streams:', _self.binaryjsClient.streams);

        _self.tlsStream = _self.binaryjsClient.createStream ({ type:'JRPCSec-TLS-Stream' });
        tlsOptions.tlsDataReady = function(connection) {
            // encrypted data is ready to be sent to the server 
            var data = connection.tlsData.getBytes();
            //_self.logger('[tlsClient tlsDataReady] data length: ', data.length);
            _self.tlsStream.write(data);
        },

        _self.tlsStream.on ('data', function (data) {
            //_self.logger ('[onData] len, typeof data:', data.length, typeof data);
            _self.tlsClient.process(data);
        });
        _self.tlsStream.on ('end', function () {
            _self.tlsClient.reset (true);
        });
        _self.tlsStream.on ('error', function (error) {
            _self.logger ('[jrpcsec/tlsStream onerror]', error);
            _self.tlsClient.reset (true);
        });
        _self.tlsClient =  Forge.tls.createConnection(tlsOptions);
        _self.tlsClient.handshake();
    });
}

JRPCSec.prototype.close = function () {
    var _self = this;
    if (_self.binaryjsClient) {

        if ( _self.jrpcClient !== undefined ) {
            _self.jrpcClient.shutdown().setTransmitter(null);
        }
        if ( _self.tlsClient !== undefined ) {
            _self.tlsClient.reset(true);
        }
        if ( _self.tlsStream !== undefined ) {
            _self.tlsStream.destroy();
        }
        if ( _self.binaryjsClient !== undefined ) {
            _self.binaryjsClient.close();
        }

        _self.tlsClient = undefined;
        _self.tlsStream = undefined;
        _self.binaryjsClient = undefined;
        _self.jrpcClient = undefined;
    }
}

JRPCSec.prototype.call = function (method, args, cb) {
    var _self = this;
    //_self.logger ('[jrpcsec/call]', method, args, _.isFunction(cb)?cb.name:'<no callback>');
    if (!this.jrpcClient) {
        throw new TypeError ('JRPCSec -- Underlying RPC object undefined.');
    }
    this.jrpcClient.call (method, args, function (err, result) {
        if (_.isFunction(cb)) {
            if (_self.config.oneShot) {
                _self.close();
            }
            return cb (err, result);
        }
        _self.logger ('[jrpcsec/call cb] method/args:', method, args);
        if (err) {
            _self.logger ('[jrpcsec/call cb]', err);
        } else {
            _self.logger ('[jrpcsec/call cb]', result);
        }
    });
};
