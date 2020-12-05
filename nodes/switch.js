module.exports = function (RED) {
  'use strict'
  const BaseTasmotaNode = require('./base_tasmota.js')

  const SWITCH_DEFAULTS = {
    // no specific options for this node
  }

  // values for the tasmota POWER command
  const onValue = 'ON'
  const offValue = 'OFF'
  const toggleValue = 'TOGGLE'

  class TasmotaSwitchNode extends BaseTasmotaNode {
    constructor (userConfig) {
      super(userConfig, RED, SWITCH_DEFAULTS)
      this.cache = [] // switch status cache, es: [1=>'On', 2=>'Off']

      // Subscribes to state change of all the switch  stat/<device>/+
      this.MQTTSubscribe('stat', '+', (t, p) => this.onStat(t, p))
    }

    onDeviceOnline () {
      // Publish a start command to get the state of all the switches
      this.MQTTPublish('cmnd', 'POWER0')
    }

    onNodeInput (msg) {
      const payload = msg.payload
      const topic = msg.topic || 'switch1'

      const channel = topic.toLowerCase().startsWith('switch') ? this.extractChannelNum(topic) : 1
      const command = 'POWER' + channel

      let receivedValue, targetValue
      const options = { retain: this.config.retainIncomingCmd }

      if (typeof payload === 'object') {
        receivedValue = payload.state
        if (typeof payload.retain === 'boolean') {
          options.retain = payload.retain
        }
        if (typeof payload.qos === 'number') {
          options.qos = payload.qos
        }
      } else {
        receivedValue = payload
      }

      if (typeof receivedValue === 'string') {
        switch (receivedValue.toLowerCase()) {
          case '1':
          case 'on':
          case 'true': {
            targetValue = onValue
            break
          }
          case '0':
          case 'off':
          case 'false':
            targetValue = offValue
            break
          case 'toggle':
            targetValue = toggleValue
            break
        }
      } else if (receivedValue === true || receivedValue === 1) {
        targetValue = onValue
      } else if (receivedValue === false || receivedValue === 0) {
        targetValue = offValue
      }

      if (targetValue !== undefined) {
        this.MQTTPublish('cmnd', command, targetValue, options)
        return
      }

      this.warn('Invalid payload received on input')
    }

    onStat (mqttTopic, mqttPayloadBuf) {
      // last part of the topic must be POWER or POWERx (ignore any others)
      const lastTopic = mqttTopic.split('/').pop()
      if (!lastTopic.startsWith('POWER')) {
        return
      }

      // check payload is valid
      const mqttPayload = mqttPayloadBuf.toString()
      var status
      if (mqttPayload === onValue) {
        status = 'On'
      } else if (mqttPayload === offValue) {
        status = 'Off'
      } else {
        return
      }

      // extract channel number and save in cache
      const channel = this.extractChannelNum(lastTopic)
      this.cache[channel - 1] = status

      // update status icon and label
      this.setNodeStatus(this.cache[0] === 'On' ? 'green' : 'grey', this.cache.join(' - '))

      // build and send the new boolen message for topic 'switchX'
      var msg = { topic: 'switch' + channel, payload: (status === 'On') }
      if (this.config.outputs === 1 || this.config.outputs === '1') {
        // everything to the same (single) output
        this.send(msg)
      } else {
        // or send to the correct output
        var msgList = Array(this.config.outputs).fill(null)
        msgList[channel - 1] = msg
        this.send(msgList)
      }
    }
  }

  RED.nodes.registerType('Tasmota Switch', TasmotaSwitchNode)
}
