'use strict';

const TasmotaMqttClient = require('./tasmota_mqtt_client.js')

const TASMOTA_DEFAULTS = {
    // basic
    broker: '',  // mandatory
    device: '',  // mandatory
    name: '',
    // advanced
    fullTopic: '%prefix%/%topic%/',
    cmndPrefix: 'cmnd',
    statPrefix: 'stat',
    telePrefix: 'tele',
};


const LWT_ONLINE = 'Online';
const LWT_OFFLINE = 'Offline';


class BaseTasmotaNode {
    constructor(config, RED, more_defaults = {}) {
        // Create the Red node
        RED.nodes.createNode(this, config);

        // Internals
        this.mqttClient = null;
        this.closing = false;

        // LastWillTopic status of the device
        this.statusLWT = LWT_OFFLINE;

        // Merge base and child defaults
        var defaults = Object.assign({}, TASMOTA_DEFAULTS, more_defaults);

        // Merge user and default config
        this.config = {};
        for (const key in defaults) {
            this.config[key] = config[key] || defaults[key];
        }

        // Establish MQTT broker connection
        var broker_node = RED.nodes.getNode(this.config.broker);
        this.mqttClient = new TasmotaMqttClient(this, broker_node)

        // Subscribe to device availability changes  tele/<device>/LWT
        this.MQTTSubscribe('tele', 'LWT', (topic, payload) => {
            this.statusLWT = payload.toString();
            if (this.statusLWT === LWT_ONLINE) {
                this.setNodeStatus('green', this.statusLWT, 'ring')
                this.onDeviceOnline()
            } else {
                this.setNodeStatus('red', this.statusLWT, 'ring')
                this.onDeviceOffline()
            }
        });

        this.on('input', msg => {
            this.onNodeInput(msg)
        })

        // Remove all connections when node is deleted or restarted
        this.on('close', done => {
            this.closing = true;
            this.mqttClient.disconnect(done);
        });

    }

    onBrokerOnline() {
        // probably this is never shown, as the LWT sould be Offline
        // at this point. But we need to update the status.
        this.setNodeStatus('yellow', 'Broker connected', 'ring');
    }

    onBrokerOffline() {
        if (!this.closing) {
            // force the status, regardless the LWT
            this.status({fill: 'red', shape: 'ring',
                         text: 'Broker disconnected'});
            this.onDeviceOffline();
        }
    }

    onDeviceOnline() {
        // Subclasses can override to know when the LWT is Online
    }

    onDeviceOffline() {
        // Subclasses can override to know when the LWT is Online
    }

    onNodeInput(msg) {
        // Subclasses can override to receive input messagges from NodeRed
    }

    setNodeStatus(fill, text, shape) {
        if (this.statusLWT === LWT_ONLINE) {
            this.status({fill: fill, text: text,
                         shape: shape || 'dot'})
        } else {
            this.status({fill: 'red', shape: 'ring',
                         text: this.statusLWT || LWT_OFFLINE});
        }
    }

    buildFullTopic(prefix, command) {
        var full = this.config.fullTopic;

        full = full.replace('%topic%', this.config.device);

        if (prefix == 'tele')
            full = full.replace('%prefix%', this.config.telePrefix);
        else if (prefix == 'cmnd')
            full = full.replace('%prefix%', this.config.cmndPrefix);
        else if (prefix == 'stat')
            full = full.replace('%prefix%', this.config.statPrefix);

        if (full.endsWith('/'))
            return full + command
        else
            return full + '/' + command
    }

    MQTTPublish(prefix, command, payload) {
        var fullTopic = this.buildFullTopic(prefix, command);
        this.mqttClient.publish(fullTopic, payload);
        // TODO  qos and retain options
    }

    MQTTSubscribe(prefix, command, callback) {
        var fullTopic = this.buildFullTopic(prefix, command);
        this.mqttClient.subscribe(fullTopic, 2, callback);
    }
}

module.exports = BaseTasmotaNode;
