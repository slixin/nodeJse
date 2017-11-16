var util = require('util');
var net = require('net');
var events = require('events');
var jseutils = require('./jseutils.js');
var JseSession = require('./jseServerSession.js');
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
    self.client_account_mapping = dict();

    var jseCoder = new Coder(dictionary);

    accounts.forEach(function(account) {
        var session = new JseSession(_.clone(self.options), self.accounts);

        // Logon event
        session.on('logon', function(msg) {
            var account = msg.account;
            self.emit('logon', msg);
        });

        // Handle outbound message
        session.on('outmsg', function(msg) {
            var account = msg.account;
            var outmsg = jseCoder.encode(msg.message);
            if (self.clients.has(account)) {
                var client = self.clients.get(account);
                if (client.socket != undefined) {
                    client.socket.write(outmsg);
                    self.emit('outmsg', msg);
                } else {
                    self.emit('error', {error: 'Socket is null.', account: account });
                }
            }
        });

        // Inbound message Event
        session.on('msg', function(msg) {
            self.emit('msg', msg);
        });

        // Session end Event
        session.on('endsession', function(account) {
            session.stopHeartBeat();
            session.isLoggedIn = false;
            session.modifyBehavior({ shouldSendHeartbeats: false, shouldExpectHeartbeats: false });
            if (self.clients.has(account)) {
                var sock = self.clients.get(account).socket
                sock.end();
                sock = null;
            }
            self.emit('endsession');
        });

        // Session State event
        session.on('state', function(msg) {
            self.emit('state', msg);
        });

        var client = {
            session: session,
            socket: null
        }

        self.clients.set(account.username, client);
    })

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

    this.modifyBehavior = function(client, data) {
        if (self.clients.has(client)) {
            var session = self.clients.get(client).session;
            session.modifyBehavior(data);
        }
    }

    this.getOptions = function(client) {
        var options = null;

        if (self.clients.has(client)) {
            var session = self.clients.get(client).session;
            options = session.options;
        }
        return options;
    }

    // Send message
    this.sendMsg = function(msg, client, object, callback) {
        if (self.clients.has(client)) {
            var session = self.clients.get(client).session;
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

    this.createServer = function(callback) {
        self.server = net.createServer();

        self.server.on('connection', function(socket) {
            socket.id = socket.remoteAddress + ":" + socket.remotePort;
            var jseDataProcessor = new JseDataProcessor();

            // Handle Incoming jse message Event
            jseDataProcessor.on('msg', function(jsemsg) {
                var account = null;

                // Decode jse binary message to jse Object
                var jse = jseCoder.decode(jsemsg);

                if (self.client_account_mapping.has(socket.id)) {
                    account = self.client_account_mapping.get(socket.id);
                }

                if (jse.hasOwnProperty('CompID')) {
                    account = jse['CompID'];
                    self.client_account_mapping.set(socket.id, account);
                }

                if (self.clients.has(account)) {
                    var client = self.clients.get(account);
                    var session = client.session;
                    client.socket = socket;
                    // Process incoming jse message in Session
                    session.processIncomingMsg(jse);
                }
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
                var session = null;
                var account = null;
                self.clients.forEach(function(value, key) {
                    var client = value;
                    if (client.socket != undefined) {
                        if (client.socket.id == socket.id) {
                            session = client.session;
                            account = key;
                            client.socket = null;
                            return;
                        }
                    }
                });

                if (session != undefined) {
                    session.modifyBehavior({ shouldSendHeartbeats: false, shouldExpectHeartbeats: false });
                    session.stopHeartBeat();
                    session.isLoggedIn = false;
                }

                self.emit('close', { account: account });
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
