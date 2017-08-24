var _ = require('underscore');
var moment = require('moment');
var Uint64LE = require("int64-buffer").Uint64LE;

var convertToJSE = exports.convertToJSE = function(msgraw, spec) {
    var msg_type = msgraw.MsgType;
    var outmsg = null;
    // Get message definition by type
    var msg_def = _getMessageSpec(spec, msg_type);
    if (msg_def != undefined) {
        var bodyLength = _getMsgBodyLength(msg_def);
        outmsg = Buffer.alloc(bodyLength+3);
        outmsg.write(String.fromCharCode(2));
        outmsg.writeUInt16LE(bodyLength, 1);
        outmsg.write(msg_type,3);

        if ('_fields' in msg_def) {
            _encodeMsgBody(outmsg, msg_def._fields, msgraw);
        }
    }

    return outmsg;
}

var _getMessageSpec = function(spec, msgtype) {
    var msg_defs = spec.messages.filter(function(o) { return o._type == msgtype});
    if (msg_defs.length > 0) {
        return msg_defs[0];
    }

    return null;
}

var _getMsgBodyLength = function(def) {
    var length = 1;

    if ('_fields' in def) {
        def._fields.forEach(function(field) {
            length = length + parseInt(field._length);
        });
    }

    return length;
}

var _encodeMsgBody = function(buf, fieldsDef, msgObj) {
    var offset = 4; //0 - startpos, 1,2 - length, 3 - msgtype
    fieldsDef.forEach(function(field) {
        var field_value = field._name in msgObj ?  msgObj[field._name] : null;
        if (field_value != undefined) {
            switch(field._type.toUpperCase()) {
                case "ALPHA":
                    buf.write(field_value, offset);
                    break;
                case "UINT8":
                    buf.writeUInt8(parseInt(field_value), offset);
                    break;
                case "INT32":
                    buf.writeInt32LE(parseInt(field_value), offset);
                    break;
                case "UINT64": // it is time tick
                    var value_int = parseInt(field_value.split('.')[0]);
                    var value_dec = parseInt(field_value.split('.')[1]);
                    buf.writeUInt32LE(value_int, offset);
                    var dec_offset = offset+field._length/2;
                    buf.writeUInt32LE(value_dec, dec_offset);
                    break;
                case "PRICE":
                    var price  = parseFloat(field_value) * 100000000;
                    var price_buf = new Uint64LE(price);
                    price_buf.toBuffer().copy(buf, offset, 0, price_buf.length);
                    break;
            }
        } else {
            var fillChar = String.fromCharCode(field._padding);
            buf.fill(fillChar, offset, offset + parseInt(field._length));
        }
        offset = offset + parseInt(field._length);
    });
}

