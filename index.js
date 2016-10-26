var fs = require('fs')
var dgram = require('dgram')
var net = require('net')
var debug = require('debug')('syslogd');
var ArgsParser = require('node-argument-parser')


var extend = Object.assign.bind(Object)

function noop() {
}

function Syslogd(options) {
    if (!(this instanceof Syslogd)) {
        return new Syslogd(options)
    }

    this.options = extend({
        host: 'localhost',
        port: 514,
        onStart: noop,
        onMessage: noop,
        onError: noop
    }, options)

    this.close = function () {
        if (this.udp) {
            this.udp.close()
            this.udp = null
        }

        if (this.tcp){
            this.tcp.close()
            this.tcp = null
        }
    }

    // create UDP listener
    this.udp = dgram.createSocket('udp4')
    debug('[UDP] try bind to %s', this.options.port)

    this.udp.on('error', function (err) {
        debug('[UDP] binding error: %o', err)
        this.options.onError.call(this, err)
    }.bind(this))

    this.udp.on('listening', function () {
        debug('[UDP] binding ok')
        this.options.onStart.call(this, null)
    }.bind(this))

    this.udp.on('message', function (msg, rinfo) {
        debug('[UDP] got message: %o %o', msg, rinfo)
        this.options.onMessage.call(this, msg, rinfo)
    }.bind(this))

    this.udp.on('close', function () {
        debug('[UDP] socket closed')
        this.options.onStart.call(this, null)
    }.bind(this))

    this.udp.bind(this.options.port, this.options.host)

    // create TCP server
    this.tcp = net.createServer(function(client){
        client.on('end', function(){
            debug('[TCP] client disconnected')
        })

        client.on('data', function(data){
            debug('[TCP] got data')
            this.options.onMessage.call(this, data)
        }.bind(this))

        client.on('error', function(err){
            debug('[TCP] client error: %o', err)
            this.options.onError.call(this, err)
        }.bind(this))

        client.setEncoding('utf8')
    }.bind(this))

    this.tcp.on('error', function (err){
        debug('[TCP] binding error: %o', err)
        this.options.onError.call(this, err)
    }.bind(this))

    this.tcp.listen(this.options.port, this.options.host, function(){
        debug('[TCP] listening on ' + this.options.host + ":" + this.options.port)
    }.bind(this))

    return this
}

function runFromCli() {
    var args = ArgsParser.parse('./arguments.json', process);

    var options = {
        host: args.host || 'localhost',
        port: args.port || 514,
        output: args.output || null, // default to stdout
        onMessage: function (msg) {
            outputFile.write(msg + "\n");
        },
        onError: function (err) {
            console.log("Error: ", err)
        },
        onStart: function () {
            console.log("syslogd started listening on " + options.host + ":" + options.port)
        }
    };

    var outputFile = options.output ? fs.createWriteStream(options.output, {flags: 'a+', defaultEncoding: 'utf8'}) : process.stdout;

    process.on('exit', function () {
        if (outputFile && outputFile !== process.stdout) {
            outputFile.end();
        }

        if (server) {
            server.close();
        }
    });

    var server = Syslogd(options);

    return server;
}

var server = runFromCli(); // keep a reference to avoid GC


