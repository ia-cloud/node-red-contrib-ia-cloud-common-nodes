
module.exports = function (RED) {
    RED.nodes.registerType('ia-cloud-ccs-connection-config', function (config) {
        RED.nodes.createNode(this, config);
        this.url = config.url;
        this.name = config.name;
        this.proxy = config.proxy;
        this.version = config.version;
    }, {
        credentials: {
            userId: { type: 'text' },
            password: { type: 'password' },
        },
    });
};
