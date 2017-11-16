var net = require('net');
var util = require('util');
var events = require('events');
var jseutils = require('./jseutils.js');
var _ = require('underscore');

module.exports = JseClientSession;

/*==================================================*/
/*====================FIXSession====================*/
/*==================================================*/
function JseClientSession(username, password, newpassword, opt) {
    var self = this;

    self.username = username;
    self.password = password;
    self.newpassword = newpassword;
    self.options = opt == undefined ? {} : opt;
    self.store = [];

    _.defaults(self.options, {
        shouldValidate: true,
        shouldSendHeartbeats: true,
        shouldExpectHeartbeats: true,
        shouldRespondToLogon: true,
        defaultHeartbeatSeconds: 30,
        incomingSeqNum: 1,
        outgoingSeqNum: 1
    });

    self.heartbeatIntervalID = "";

    self.isLoggedIn = false;
    self.timeOfLastIncoming = new Date().getTime();
    self.timeOfLastOutgoing = new Date().getTime();
    self.isLogoutRequested = false;

    self.standardMessage = {
        "Heartbeat": { 'MsgType': '0' },
        "Logon": { 'MsgType': 'A' },
        "Logout": { 'MsgType': '5', 'Reason': 'User logout received' }
    }

    //[PUBLIC] Sends JSE json to counter party
    this.sendMsg = function(msg, cb) {
        self.options.timeOfLastOutgoing = new Date().getTime();
        var outmsg = msg;
        var msgtype = msg['MsgType'];

        if (!outmsg.hasOwnProperty('SequenceNumber')) {
            // If the outbound message is not Administrative messages
            if (['B', '0','5', '3', 'N', 'P', 'n'].indexOf(msgtype) < 0){
                var seqn = self.options.outgoingSeqNum++;
                var ext = {
                    'SequenceNumber': seqn.toString()
                };
                _.extend(outmsg, ext);
            }
        }

        self.emit('outmsg', { 'account': self.account, 'message': outmsg });
        self._sendState({ timeOfLastOutgoing: self.timeOfLastOutgoing, outgoingSeqNum: self.options.outgoingSeqNum });
        cb(outmsg);
    }

    //[PUBLIC] Sends logon JSE json to counter party
    this.sendLogon = function() {
        var logon_detail = {
            "CompID": self.username,
            "Password": self.password,
            "NewPassword": self.newpassword
        }
        var msgLogon = _.extend({}, self.standardMessage.Logon, logon_detail);

        self.sendMsg(msgLogon, function(msg) {});
    }

    //[PUBLIC] Sends logoff JSE json to counter party
    this.sendLogoff = function(cb) {
        self.isLogoutRequested = true;
        self.sendMsg(self.standardMessage.Logout,  function(msg) {});
    }

    this.modifyBehavior = function(data) {
        for (var idx in data) {
            switch(idx) {
                case "shouldSendHeartbeats":
                    self.options.shouldSendHeartbeats = data[idx];
                    break;
                case "shouldExpectHeartbeats":
                    self.options.shouldExpectHeartbeats = data[idx];
                    break;
                case "shouldRespondToLogon":
                    self.options.shouldRespondToLogon = data[idx];
                    break;
                case "incomingSeqNum":
                    self.options.incomingSeqNum = data[idx];
                    break;
                case "outgoingSeqNum":
                    self.options.outgoingSeqNum = data[idx];
                    break;
                case "shouldValidate":
                    self.options.shouldValidate = data[idx];
                    break;
            }
        }

        if (self.options.shouldSendHeartbeats === false && self.options.shouldExpectHeartbeats === false) {
            clearInterval(self.heartbeatIntervalID);
        }

        self._sendState(data);
    }

    this.stopHeartBeat = function() {
        clearInterval(self.heartbeatIntervalID);
    }

    //[PUBLIC] process incoming messages
    this.processIncomingMsg = function(msg) {
        var heartbeatInMilliSeconds = self.options.defaultHeartbeatSeconds * 1000;
        self.timeOfLastIncoming = new Date().getTime();
        self._sendState({ timeOfLastIncoming: self.timeOfLastIncoming });

        // ########### Private Methods ###########
        var heartbeat = function() {
            var currentTime = new Date().getTime();
            //==send heartbeats
            if (currentTime - self.timeOfLastOutgoing > heartbeatInMilliSeconds  && self.options.shouldSendHeartbeats) {
                self.sendMsg(self.standardMessage.Heartbeat,  function(msg) {});
            }

            //==counter party might be dead, kill connection
            if (currentTime - self.timeOfLastIncoming > heartbeatInMilliSeconds * 2 && self.options.shouldExpectHeartbeats) {
                var errorMsg = 'No heartbeat from counter party in milliseconds ' + heartbeatInMilliSeconds * 2 + ', last incoming message time: '+self.timeOfLastIncoming;
                self._sendError('FATAL', errorMsg);
                return;
            }
        }

        // var logon =  function(msg) {
        //     var okLogon = false;
        //     var username = null;
        //     var password = null;

        //     if (self.accounts.length > 0) {
        //         username = msg['CompID']
        //         password = msg['Password']

        //         self.accounts.forEach(function(acc) {
        //             if (acc.username == username && acc.password == password) {
        //                 okLogon = true;
        //                 return;
        //             }
        //         })
        //     } else {
        //         okLogon = true;
        //     }

        //     if (self.options.shouldRespondToLogon === true) {
        //         self.account = username;
        //         if (okLogon) {
        //             self.sendMsg(self.standardMessage.Logon,  function(msg) { });
        //         } else {
        //             self.sendMsg(self.standardMessage.LogonFail,  function(msg) { });
        //         }
        //     }

        //     return okLogon;
        // }
        // ####################################

        var msgType = msg['MsgType'];
        if (self.isLoggedIn === false) {
            console.log('@#$@$#@$ASDFASFSDFASDFASDF@#$$#@@$@#')
            // The first message must be A
            if (msgType !== 'A') {
                var errorMsg = 'First message must be logon, ' + JSON.stringify(msg);
                self._sendError('FATAL', errorMsg);
                return;
            }

            // self.isLoggedIn = logon(msg);
            // if (!self.isLoggedIn) return;
            // self.emit('logon', { 'account': self.account, 'message': msg });

            self._sendState({ isLoggedIn: self.isLoggedIn });
            self.heartbeatIntervalID = setInterval(heartbeat, heartbeatInMilliSeconds / 2);
        }

        switch(msgType) {
            case '5': // Logout Message
                if (!self.isLogoutRequested) { self.sendMsg(self.standardMessage.Logout, function(msg) {});}

                self._endSession();
                break;
            default:
                self.emit('msg', {'message': msg});
                break;
        }
    }

    //internal methods (non-public)
    this._sendError = function(type, msg) {
        self.emit('error', {'message': msg });
        if (type === 'FATAL') {
            self._endSession();
        }
    }

    //internal methods (non-public)
    this._sendState = function(msg) {
        self.emit('state', msg);
    }

    this._endSession = function() {
        clearInterval(self.heartbeatIntervalID);
        self.emit('endsession');
    }
}
util.inherits(JseClientSession, events.EventEmitter);
