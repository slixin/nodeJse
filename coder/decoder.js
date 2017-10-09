var _ = require('underscore');
var moment = require('moment');
var Uint64LE = require("int64-buffer").Uint64LE;

var convertFromJSE = exports.convertFromJSE = function(buf, spec) {
    var message = {};
    var msgType = String.fromCharCode(buf.readUInt8(3));

    // Get message definition by type
    var msgDef = _getMessageSpec(spec, msgType);

    message['MsgType'] = msgType;

    if (msgDef != undefined) {
        if ('_fields' in msgDef){
            _.extend(message, _decodeMsgBody(msgDef._fields, buf));
        }
    }
    return message;
}

var convertFromText = exports.convertFromText = function(msg, delimiter, spec) {
    var msg_tags = msg.split(delimiter);
    var map = {};
    var fields = [];
    var values = [];

    msg_tags.forEach(function(msg_tag) {
        var tag = msg_tag.trim();
        if (tag.trim().length > 0) {
            var firstequalpos = tag.indexOf('=');
            var tag_name = tag.substr(0, firstequalpos);
            var tag_value = tag.substr(firstequalpos+1, tag.length - firstequalpos);

            fields.push(tag_name);
            values.push(tag_value);
        }
    });

    var msgtype_index = fields.findIndex(x => x == 'MsgType');

    var msgtype = values[msgtype_index];
    if (msgtype != undefined) {
        map['MsgType'] = msgtype;
        _.extend(map, _decodeMsgBodyFromText(spec, msgtype, fields, values));
    }

    return map;
}

var _decodeMsgBodyFromText = function(spec, msgtype, fields, values) {
    var map = {};

    // Get message definition by type
    var msg_def = _getMessageSpec(spec, msgtype);
    if ('_fields' in msg_def) {
        msg_def._fields.forEach(function(field) {
            var field_name = field._name;
            var field_index = fields.findIndex(x => x == field_name);
            if ( field_index >=0 ){
                map[field_name] = values[field_index];
            }
        });
    }

    return map;
}

var _getMessageSpec = function(spec, msgtype) {
    var msg_defs = spec.messages.filter(function(o) { return o._type == msgtype});
    if (msg_defs.length > 0) {
        return msg_defs[0];
    }

    return null;
}

var _decodeMsgBody = function(fieldsDef, buf) {
    var msg = {};
    var offset = 4; //0 - startpos, 1,2 - length, 3 - msgtype
    fieldsDef.forEach(function(field) {
        var value = null;
        switch(field._type.toUpperCase()) {
            case "ALPHA":
                var alpha = buf.toString('ascii', offset, offset+parseInt(field._length));
                var value_arr = [];
                for (var i = 0, len = alpha.length; i < len; i++) {
                    if (alpha[i] == '\u0000'){
                        break;
                    } else {
                        value_arr.push(alpha[i]);
                    }
                }
                value = value_arr.join('');
                break;
            case "UINT8":
                value = buf.readUInt8(offset);
                break;
            case "INT32":
                value = buf.readInt32LE(offset);
                break;
            case "UINT64": // it is time tick
                var int_part = buf.readUInt32LE(offset);
                var dec_part = buf.readUInt32LE(offset+parseInt(field._length)/2);
                var intnum = parseInt(int_part);
                var decnum = parseInt(dec_part);
                value = intnum * 1000 + decnum;
                break;
            case "PRICE":
                var price_buf = Buffer.alloc(parseInt(field._length));
                buf.copy(price_buf, 0, offset, offset+parseInt(field._length));
                var price_hex = new Uint64LE(price_buf);
                var price = parseInt(price_hex.toString(16), 16);
                value = price/100000000;
                break;
        }
        msg[field._name] =  value;
        offset = offset + parseInt(field._length);
    });

    return msg;
}

