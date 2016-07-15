Package.describe({
  name: 'verody:jrpcsec-client',
  version: '0.0.2',
  summary: 'JRPCSec packaged for Meteor client.',
  git: 'git@github.com:ekobi/jrpcsec.git',
  documentation: null
});

Package.onUse(function(api) {
    api.versionsFrom('1.3.4');
    api.addFiles ([
        'forge.verody-bundle.js',
        'binary.min.js',
        'jrpc.min.js',
        'jrpcsec-client.js'], ['client', 'server']);
    api.export (['JRPCSec', 'Forge'], ['client']);
});

Package.onTest(function(api) {
    api.use(['underscore']);
    api.use([ 'tinytest', 'random' ]);
    api.use('verody:jrpcsec-client');
    api.mainModule('jrpcsec-client-tests.js');
});
