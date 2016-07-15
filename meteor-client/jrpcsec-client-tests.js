if (Meteor.isClient) {
    Tinytest.add('jrpcsec - sanity check: forge', function (test) {
        test.isNotUndefined (Forge, 'forge looks reasonable');
    });
    Tinytest.addAsync ('jrpcsec - echo test', function (test, onComplete){

        Meteor.call ('loadCerts', function (err, options) {
            if (err) {
                console.log ('[loadCerts cb] error:', err);
            } else {
                options.idString = 'jrpcsec-client-echo-test-' + Random.id();
                test.isFalse (err,err);
                var rpcClient = new JRPCSec (options);
                onComplete();

                // rpcClient.call ('echo', token, function (err, result) {
                //     test.isFalse (err,err);
                //     onComplete();
                // });

            }
        });

    });
}

if (Meteor.isServer) {
    Meteor.methods ({
        'loadCerts': function () {
            return {
                clientCertPEM: Assets.getText ('BCert.pem'),
                clientKeyPem : Assets.getText ('BKey.pem'),
                caPEMList : [
                    Assets.getText ('VCert.pem'),
                    Assets.getText ('SCert.pem'),
                    Assets.getText ('TCert.pem'),
                ]
            };
        }
    });

}
