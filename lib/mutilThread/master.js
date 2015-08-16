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

        for (var i = 0; i < num; i++) {
            this.children.push(fork('./graper_child'));
        }

        return this;
    }
    , sendMessage: function () {
        var args = arguments;
        this.children.forEach(function (child) {
            child.email.apply(child, args);
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