var util = require('util');
var net = require('net');
var events = require('events');
var jseutils = require('./jseutils.js');

module.exports = JseServerSocket;

function JseServerSocket() {
    var self = this;
    self.socket = null;
    self.server = null;

    this.create = function(port, dataprocessor) {
        // Create socket connection
        self.server = net.createServer(function(socket) {
            self.socket = socket;
            self.emit('create');

            // Receive Data event
            self.socket.on('data', function(data) {
                // Ask jseDataProcessor to process it
                dataprocessor.processData(data);
            });

            // Connection End Event
            self.socket.on('close', function() {
                self.emit('close');
            });

            // Connection Error Event
            self.socket.on("error", function(err) {
                self.emit('error', err);
            });
        }).listen(port);
    }

    // Positive sending message via Socket
    this.send = function(msg) {
        if (self.socket != undefined) {
            self.socket.write(msg);
        }
    }
}
util.inherits(JseServerSocket, events.EventEmitter);
