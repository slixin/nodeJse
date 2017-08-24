var _ = require('underscore');
var moment = require('moment');
var net = require('net');
var request = require('request');

var safelyParseJSON = exports.safelyParseJSON = function(message, cb) {
    var json_msg = null;
    try {
        if (typeof message != "string") {
            msg = JSON.stringify(message);
        } else {
            msg = message;
        }
        json_msg = JSON.parse(msg);
        cb(null, json_msg);
    } catch(ex) {
        cb(ex.message, null);
    }
}

var uuid = exports.uuid = function() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

var randomString = exports.randomString = function(seed, length){
    var text = "";
    var possible = seed == undefined ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" : seed;

    for( var i=0; i < length; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

var getCurrentUTCTimeStamp = exports.getCurrentUTCTimeStamp = function(format) {
    return getUTCTimeStamp(moment().utc(), format == undefined ?  'YYYYMMDD-HH:mm:ss.SSS' : format);
}

var getUTCTimeStamp = exports.getUTCTimeStamp = function(utcTime, format) {
    return utcTime.format(format);
}

var finalizeMessage = exports.finalizeMessage = function(version, msg, seq) {
    var headermsg = msg.header;
    var bodymsg = msg.body;

    headermsg +="34="+seq.toString()+SOHCHAR;

    var outmsg = "8="+version+SOHCHAR;
    outmsg += "9="+(headermsg.length + bodymsg.length).toString()+SOHCHAR;
    outmsg += headermsg;
    outmsg += bodymsg;

    outmsg += '10=' + checksum(outmsg) + SOHCHAR;

    return outmsg;
}

var normalize = exports.normalize = function(jsonmessage, object) {
    for(key in jsonmessage) {
        if (jsonmessage.hasOwnProperty(key)) {
            var tag_value = jsonmessage[key];
            // if the tag value is an object, that means it is a repeating group.
            if (typeof(tag_value) == "object") {
                tag_value = normalize(tag_value, object);
            } else {
                jsonmessage[key] = normalizeValue(tag_value, object);
            }
        }
    }

    return jsonmessage;
}

var normalizeValue = exports.normalizeValue = function(value, object) {
    var re = /%%([^%%]+)%%/g;
    var replace_value = value;
    var match = re.exec(replace_value);
    if (match != undefined) {
        var wildcard = match[1];

        // GUID generator
        if (wildcard == 'guid') {
            replace_value = replace_value.replace(re, uuid());
        }

        // Generate UTC now
        if (wildcard.startsWith('now')) {
            var t = moment.utc();

            if (wildcard.length > 3) { // Not only 'now', but with time difference
                var opt = wildcard[3];
                var diff = parseInt(wildcard.substr(4, wildcard.length-4));

                var unit = wildcard.substr(wildcard.length-1, 1);
                if (opt == '+')
                    t = t.add(diff, unit);
                else
                    t = t.subtract(diff, unit);
            }
            replace_value = replace_value.replace(re, t.format('YYYYMMDD-HH:mm:ss.SSS'));
        }

        if (wildcard.startsWith('timestamp')) {
            replace_value = (((new Date).getTime()) / 1000).toFixed(3).toString();
        }

        if (wildcard.startsWith('randomdouble')) {
            var min = wildcard.split(':')[1];
            var max = wildcard.split(':')[2];
            var random_double = randomDouble(min, max);
            replace_value = replace_value.replace(re, random_double);
        }

        if (wildcard.startsWith('randomnumber')) {
            var length = wildcard.split(':')[1];
            var random_num = randomString('0123456789', length);
            replace_value = replace_value.replace(re, random_num);
        }

        if (wildcard.startsWith('randomstring')) {
            var length = wildcard.split(':')[1];
            var random_str = randomString(null, length);
            replace_value = replace_value.replace(re, random_str);
        }

        if (wildcard.startsWith('@')) {
            var field = wildcard.replace('@', '');
            if (object.hasOwnProperty(field)) {
                replace_value = replace_value.replace(re, object[field]);
            } else {
                replace_value = replace_value.replace(re, null);
            }
        }

        if (wildcard.startsWith('exp')) {
            var exp = wildcard.substr(4, wildcard.length -5);
            for(var key in object) {
                if (object.hasOwnProperty(key)) {
                    exp = exp.replace(new RegExp('@'+key, 'g'), object[key]);
                }
            }

            if (exp.indexOf('@') >= 0)
                replace_value = replace_value.replace(re, null);
            else
                replace_value = replace_value.replace(re,  eval(exp));
        }
    }

    return replace_value;
}

var getMessageDefinition = function(dictionary, msgtype) {
    var msg_defs = dictionary.jse.messages.message.filter(function(o) { return o._msgtype == msgtype});
    if (msg_defs.length > 0) {
        return msg_defs[0];
    }

    return null;
}

var getRequiredFields = function(fields) {
    return fields.filter(function(o) { return o._required == 'Y'} );
}

var getRequiredComponents = function(components) {
    return components.filter(function(o) { return o._required == 'Y'} );
}
