var Encoder = require('./encoder.js');
var Decoder = require('./decoder.js');

module.exports = Coder;

function Coder(dictionary) {
    var self = this;

    self.spec = dictionary;

    this.encode = function(msg) {
        if (self.spec != undefined)
            return Encoder.convertToJSE(msg, self.spec);
        else
            return null;
    }

    this.decode = function(msg) {
        if (self.spec != undefined)
            return Decoder.convertFromJSE(msg, self.spec);
        else
            return null;
    }

    this.decodetext = function(msg, delimiter) {
        if (self.spec != undefined)
            return Decoder.convertFromText(msg, delimiter, self.spec);
        else
            return null;
    }
}
