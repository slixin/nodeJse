var util = require('util');
var net = require('net');
var events = require('events');
var jseutils = require('./jseutils.js');
var JseSession = require('./jseSession.js');
var JseServerSocket = require('./jseServerSocket.js');
var JseDataProcessor = require('./jseDataProcessor.js');
var Coder = require('./coder/index.js');
var queue = require('queue');
var dict = require('dict');
var _ = require('underscore');

module.exports = JseServer;

/*==================================================*/
/*====================JseServer====================*/
/*==================================================*/
function JseServer(port, dictionary, options, accounts) {
    var self = this;

    self.port = port;
    self.options = options;
    self.dictionary = dictionary;
    self.accounts = accounts;
    self.clients = dict();

    var jseSocket = new JseServerSocket();
    var outMsgQueue = queue();
    outMsgQueue.autostart = true;
    var jseCoder = new Coder(dictionary);

    this.destroyConnection = function(){
        if (self.server != undefined){
            self.clients.forEach(function(client, key) {
                console.log('Client:'+key+' is ended');
                client.socket.end();
            });
            self.clients.clear();
            self.server.close();
        }
    }

    // Send message
    this.sendMsg = function(msg, account, object, callback) {
        if (self.clients.has(account)) {
            var session = self.clients.get(account).session;
            var jsemsg = null;
            if (typeof msg == "string") {
                jsemsg = jseCoder.decodetext(msg, ",");
            } else {
                jsemsg = JSON.parse(JSON.stringify(msg));
            }

            var normalized_jsemsg = jseutils.normalize(jsemsg, object);
            session.sendMsg(normalized_jsemsg, function(outmsg) {
                callback(outmsg);
            });
        }
    }

    this.modifyBehavior = function(account, data) {
        if (self.clients.has(account)) {
            var session = self.clients.get(account).session;
            session.modifyBehavior(data);
        }
    }

    this.getOptions = function(account) {
        var options = null;

        if (self.clients.has(account)) {
            var session = self.clients.get(account).session;
            options = session.options;
        }
        return options;
    }

    this.createServer = function(callback) {
        self.server = net.createServer();

        self.server.on('connection', function(socket) {
            var session = new JseSession(_.clone(self.options), self.accounts);
            var jseDataProcessor = new JseDataProcessor();

            // Handle Incoming jse message Event
            jseDataProcessor.on('msg', function(jsemsg) {
                // Decode jse binary message to jse Object
                var jse = jseCoder.decode(jsemsg);
                // Process incoming jse message in Session
                session.processIncomingMsg(jse);
            });

            // Data process error Event
            jseDataProcessor.on('error', function(error) {
                self.emit('error', error);
            });

            socket.on('data', function(data) {
                jseDataProcessor.processData(data);
            });

            socket.on("error", function(err) {
                self.emit('error', err);
            });

            socket.on('close', function() {
                session.modifyBehavior({ shouldSendHeartbeats: false, shouldExpectHeartbeats: false });
                session.stopHeartBeat();
                session.isLoggedIn = false;
                self.emit('close', { account: session.account });
                if (session.account != undefined) {
                    var client_name = session.account;
                    if (self.clients.has(client_name)) {
                        self.clients.delete(client_name);
                    }
                }
            });

            // Logon event
            session.on('logon', function(msg) {
                if (msg.account != undefined) {
                    session.account = msg.account;
                    var client_name = session.account;
                    if (!self.clients.has(client_name)) {
                        self.clients.set(client_name, { session: session, socket: socket} );
                    }
                }
                self.emit('logon', msg);
            });

            // Handle outbound message
            session.on('outmsg', function(msg) {
                var outmsg = jseCoder.encode(msg.message);
                outMsgQueue.push(function(cb) {
                    socket.write(outmsg);
                    self.emit('outmsg', msg);
                })
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
                if (session.account != undefined) {
                    var client_name = session.account;
                    if (self.clients.has(client_name)) {
                        self.clients.delete(client_name);
                    }
                }
                self.emit('endsession', { account: session.account });
            });

            // Session State event
            session.on('state', function(msg) {
                self.emit('state', msg);
            });
        });

        self.server.listen(self.port, function() {
            callback(self);
        });

        process.on('uncaughtException', function(err) {
            console.log('Caught exception: ' + err);
            console.log(err.stack);
        });
    };
}



util.inherits(JseServer, events.EventEmitter);
