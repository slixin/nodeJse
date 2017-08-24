var util = require('util');
var events = require('events');
var jseutils = require('./jseutils.js');
var _ = require('underscore');

module.exports = JseDataProcessor;

// This module is used to extract the socket data to Normal jse text message
function JseDataProcessor() {
    var ENDOFMSGHEADER = 4;
    this.buffer = Buffer.alloc(0);
    var self = this;

    this.processData = function(data) {
        self.buffer = Buffer.concat([self.buffer, data], self.buffer.length+data.length);
        var i = 0;
        while (self.buffer.length > 0) {
            if (i > 5) return;
            //==================================== Extract complete MIT message====================================

            //If we don't have enough data to start extracting body length, wait for more data
            if (self.buffer.length < ENDOFMSGHEADER) {
                return;
            }

            var bodyLength = parseInt(self.buffer.readUInt16LE(1).toString(10));

            var msgLength = bodyLength + 3;
            //If we don't have enough data for the whole message, wait for more data
            if (self.buffer.length < msgLength) {
                return;
            }

            //Message received!
            var msg = Buffer.alloc(msgLength);
            self.buffer.copy(msg, 0, 0, msgLength);
            if (msgLength == self.buffer.length) {
                self.buffer = Buffer.alloc(0);
            } else {
                self.buffer = self.buffer.slice(msgLength, self.buffer.length);
            }
            self.emit('msg', msg);
            i++;
        }
    }
}
util.inherits(JseDataProcessor, events.EventEmitter);
