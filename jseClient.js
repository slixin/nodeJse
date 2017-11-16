var util = require('util');
var net = require('net');
var events = require('events');
var jseutils = require('./jseutils.js');
var JseClientSession = require('./jseClientSession.js');
var JseDataProcessor = require('./jseDataProcessor.js');
var Coder = require('./coder/index.js');
var dict = require('dict');
var _ = require('underscore');

module.exports = JseClient;

/*==================================================*/
/*====================FIXClient====================*/
/*==================================================*/
function JseClient(host, port, dictionary, username, password, newpassword, options) {

    var self = this;

    self.host = host;
    self.port = port;
    self.options = options;
    self.dictionary = dictionary;
    self.socket = null;

    var session = new JseClientSession(username, password, newpassword, options);
    var jseCoder = new Coder(dictionary);

    this.destroyConnection = function(){
        if (self.socket != undefined){
            self.socket.exit();
        }
    }

    this.modifyBehavior = function(data) {
        session.modifyBehavior(data);
    }

    // Send Logon message
    this.sendLogon = function(additional_tags) {
        session.sendLogon(additional_tags);
    }

    // Send Logoff message
    this.sendLogoff = function(additional_tags) {
        session.sendLogoff(additional_tags);
    };

    // Send message
    this.sendMsg = function(msg, callback) {
        var jsemsg = null;
        if (typeof msg == "string") {
            jsemsg = jseCoder.decode(msg);
        } else {
            jsemsg = JSON.parse(JSON.stringify(msg));
        }

        var normalized_jsemsg = jseutils.normalize(jsemsg, null);
        session.sendMsg(normalized_jsemsg, function(outmsg) {
            callback(outmsg);
        });
    }

    this.createConnection = function(callback) {
        var socket = net.createConnection(port, host);
        socket.setNoDelay(true);
        self.socket = socket;

        var jseDataProcessor = new JseDataProcessor();

        // Handle Incoming Jse message Event
        jseDataProcessor.on('msg', function(jsemsg) {
            // Decode Jse plain text message to Jse Object
            var jse = jseCoder.decode(jsemsg);
            // Process incoming Jse message in Session
            session.processIncomingMsg(jse);
        });

        // Data process error Event
        jseDataProcessor.on('error', function(error) {
            self.emit('error', error);
        });

        socket.on('connect', function() {
            self.emit('connect');
        });

        socket.on('data', function(data) {
            jseDataProcessor.processData(data);
        });

        socket.on('end', function() {
            if (session != undefined) {
                session.modifyBehavior({ shouldSendHeartbeats: false, shouldExpectHeartbeats: false });
                session.stopHeartBeat();
                session.isLoggedIn = false;
            }

            self.emit('disconnect');
        });

        socket.on("error", function(err) {
            self.emit('error', err);
        });

        // Handle outbound message
        session.on('outmsg', function(msg) {
            var outmsg = jseCoder.encode(msg.message);
            if (self.socket != undefined) {
                self.socket.write(outmsg);
                self.emit('outmsg', msg);
            } else {
                self.emit('error', {error: 'Socket is null.'});
            }
        });

        // Inbound message Event
        session.on('msg', function(msg) {
            self.emit('msg', msg);
        });

        // Session end Event
        session.on('endsession', function() {
            session.stopHeartBeat();
            session.isLoggedIn = false;
            session.modifyBehavior({ shouldSendHeartbeats: false, shouldExpectHeartbeats: false });
            self.emit('endsession');
        });

        // Logon event
        session.on('logon', function(msg) {
            self.emit('logon', msg);
        });

        // Session State event
        session.on('state', function(msg) {
            self.emit('state', msg);
        });

        callback(null, self);

        process.on('uncaughtException', function(err) {
            console.log('Caught exception: ' + err);
            console.log(err.stack);
        });
    }
}

util.inherits(JseClient, events.EventEmitter);
