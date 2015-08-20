/**
 * Created by trump on 8/16/15.
 */

var os = require('os');
var fork = require('child_process').fork;
var master = {
    children: []
    , run: function (num) {
        num = num || os.cpus().length;

        if (this.children.length > 0) {
            return this;
        }


        for (var i = 0, process; i < num; i++) {
            this.children.push(process = fork('./graper_child'));
            this.subscribeProcessMessage(process);
        }

        return this;
    }
    , subscribeProcessMessage: function (process) {
        var self = this;
        process.on('message', function (message) {
            message = JSON.stringify(message);
            self.sendMessage(process, message.type, message.data);
        });
    }
    , sendMessage: function (except) {
        var args = arguments;
        this.children.filter(function (o) {
            return o !== except;
        }).forEach(function (child) {
            child.emit.apply(child, args);
        })
    }
    , pause: function () {
        this.sendMessage('pause', true);
    }
    , resume: function () {
        this.sendMessage('pause', false);
    }
    , cancel: function () {
        var child;
        while (child = this.children.pop()) {
            child.kill('SIGHUP')
        }
    }
};

module.exports = master;