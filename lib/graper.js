var avQ = require('avril.queue');
var extend = require('extend');
var request = require('request');
var jsdom = require('jsdom');
var path = require('path');
var fs = require('fs-extra');
var EventEmitter = require('events').EventEmitter;
var eventKeys = {
    start: ''
    , pause: ''
    , resume: ''
    , cancel: ''
    , finish: ''

    , requestPage: ''
    , requestFailed: ''

    , getDetail: ''
    , getList: ''
};

Object.keys(eventKeys).forEach(function (key) {
    eventKeys[key] = key;
});

function Graper(config) {
    if (!(this instanceof Graper)) {
        return new Graper(config);
    }
    extend(this, {
        parseCache: {}
        , requetCache: {}
        , timeoutCache: {}
        , lastEntry: null
        , options: {
            "dbType": "file",
            "dbName": "graper_data",
            "tbName": "default",
            lastEntryFileName: 'graper.lastEntry.cache',

            "entry": "http://some-site.com/index.html",
            "fromLastEntry": true,
            "hasList": true,
            "hasDetailOnList": false,

            "isDetailPage": "#detail-page-selector",
            "isListPage": "#list-page-selecotr",
            "listContainer": "#list-element-selector",
            "listItem": "#list-element-selector",

            "urlField": "url",
            "detailItem": {
                "title": "#title-selector",
                "description": "#description-selector"
            },

            "links": {
                "detailLink": ".some-detail-link-selector",
                "nextList": "div.inc_page ul li:nth-child(-2)",
                "nextDetail": "#next-list-link-selector"
            },

            needJQ: true,
            retryTimeout: 20 * 1000

        }
    });
    extend(true, config.isJSON ? this.options : this, config);

    extend(this, {
        id: ['GRAPER', Date.now(), 'R', Math.round(Math.random() * 10000)].join('-')
        , runnerQueue: avQ()
    });

    var lastEntry = path.resolve(process.cwd(), this.options.lastEntryFileName);

    fs.ensureDir(path.dirname(lastEntry), function () {
    });

    if (fs.existsSync(lastEntry)) {
        try {
            this.lastEntry = fs.readJSONSync(lastEntry, 'utf8');
        } catch (E) {
            this.lastEntry = [];
        }
    }

    var db = this.getDB();
    db && db.init && db.init(this);

    this.emitter = new EventEmitter();

    this.eventKeys = extend(true, {}, eventKeys);

}

extend(Graper.prototype, {
    writeLastEntry: function (url) {
        var self = this;

        this.lastEntry = [url];

        var lastEntry = path.resolve(process.cwd(), this.lastEntryFileName);

        fs.writeJSONFile(lastEntry, this.lastEntry, 'utf8');
    }
    , removeLastEntry: function () {
        var lastEntry = path.resolve(process.cwd(), this.lastEntryFileName);
        if (fs.existsSync(lastEntry)) {
            fs.remove(lastEntry);
        }
    }
    , run: function () {
        var q = this.runnerQueue;
        var self = this;
        if (this.options.fromLastEntry && this.lastEntry && this.lastEntry.length) {
            for (var i = 0; i < this.lastEntry.length; i++) {
                (function (i) {
                    q.func(function (next) {
                        self.parsePage(self.lastEntry[i]).func(next);
                    });
                })(i);
            }
        } else {
            q.func(function (next) {
                self.parsePage(self.options.entry).func(next);
            });
        }
        self.emitter.emit(eventKeys.start);
        q.func(function () {
            self.emitter.emit(eventKeys.finish);
        });
        return this;
    }
    , jquerySource: fs.readFileSync(path.resolve(__dirname, './jquery.js'), 'utf8')
    , parsePage: function (url, currentDone) {
        currentDone = currentDone || function () {
            };

        var q = avQ();

        if (this.parseCache[url]) {
            currentDone();
            return q;
        }

        this.parseCache[url] = 1;

        if (url.indexOf('http') !== 0) {
            url = this.options.root + url;
        }


        var self = this;
        var options = this.options;

        q.func(function (next) {
            self.requestPage(url, function (pageBody) {

                currentDone();

                if (!pageBody) {
                    return next();
                }

                self.useJsdom(pageBody, function ($) {
                    var subQ = avQ();
                    $.pageUrl = url;
                    var $body = $('body');
                    // has list on page
                    if (options.hasList) {
                        if (self.isListPage($)) {
                            self.log('Get list:', url);
                            self.emitter.emit(eventKeys.getList, url);

                            var dataList = self.getDataList($);

                            if (options.hasDetailOnList) {
                                dataList.each(function () {
                                    self.getDetailAndSave($, $(this));
                                });
                            } else {
                                dataList.each(function () {
                                    var detailUrl = self.getDetailLink($, $(this));
                                    //get detail pageData
                                    detailUrl && subQ.paralFunc(function (next) {
                                        self.parsePage(detailUrl).func(function () {
                                            next();
                                        });
                                    });
                                });
                            }

                            var nextListLinks = self.getNextListLink($);

                            if (nextListLinks && nextListLinks.length) {
                                nextListLinks.each(function () {
                                    var nextLink = $(this).attr('href');
                                    nextLink && subQ.paralFunc(function (next) {
                                        self.parsePage(nextLink).func(function () {
                                            next();
                                        });
                                    });
                                })
                            } else {
                                self.removeLastEntry();
                            }

                            self.writeLastEntry(url);

                        } else if (self.isDetailPage($)) {
                            self.log('Get detail:', url);
                            self.emitter.emit(eventKeys.getDetail, url);
                            self.getDetailAndSave($, $body);
                        }
                    } else {
                        self.getDetailAndSave($, $body);
                    }

                    subQ.func(function () {
                        next()
                    });
                });

            });
        });

        return q;
    }
    , useJsdom: function (pageBody, callback) {
        var self = this;
        jsdom.env({
            html: pageBody,
            src: self.options.needJQ ? [self.jquerySource] : [],
            loaded: function (err, window) {
                !err && callback(window.jQuery);
                window.close();
            }
        })
    }
    , isDetailPage: function ($) {
        return $(this.options.isDetailPage).length > 0;
    }
    , isListPage: function ($) {
        return $(this.options.isListPage).length > 0;
    }
    , getDataList: function ($) {
        return $(this.options.listContainer).find(this.options.listItem);
    }
    , getDetailAndSave: function ($, $parent) {
        var dataItem = this.getDetail($, $parent);
        this.save(dataItem);
    }
    , getDetail: function ($, $parent) {
        var self = this;
        var res = {};
        if (this.options.urlField) {
            res[this.options.urlField] = $.pageUrl;
        }
        var dataItemConfig = this.options.detailItem;

        Object.keys(dataItemConfig).forEach(function (key) {

            var selector = dataItemConfig[key];
            var selectorType = typeof  selector;

            switch (selectorType) {
                case 'string':
                {
                    res[key] = self.resolveSelectorData($parent, selector);
                    break;
                }
                case "object":
                {
                    if (selector instanceof Array) {
                        selector.forEach(function (selectorStr) {
                            res[key] = [];
                            $parent.find(selectorStr.replace(self.advancedSelectorReg, ''))
                                .each(function () {
                                    res[key].push(self.resolveSelectorData($(this), selectorStr, true) || '  ');
                                });
                        });

                    }
                    break;
                }
                case 'function':
                {
                    res[key] = selector($parent, $);
                    break;
                }
            }
        });

        return res;
    }

    , _isPaused: false
    , isPaused: function () {
        return this._isPaused;
    }
    , pause: function () {
        this._isPaused = true;
    }
    , _resumeQueue: []
    , resume: function () {
        this._isPaused = false;
        this._resumeQueue.forEach(function (fn) {
            fn();
        });
    }
    , cancel: function () {
    }
    , wrapPauseFunc: function (func) {
        if (func.isWraped) {
            return func;
        }
        var self = this;
        var wrapFunc = function () {
            var args = arguments;
            var ctx = this;
            var runCallBack = function () {
                return func.apply(ctx, args);
            };
            if (!self.isPaused()) {
                return runCallBack();
            } else {
                self._resumeQueue.push(runCallBack);
            }
        };

        wrapFunc.isWraped = true;

        return wrapFunc;
    }

    , advancedSelectorReg: /^\/(.*)\/\s*/

    , resolveSelectorData: function ($el, selector, readFromSelf) {

        var advancedSelectorReg = this.advancedSelectorReg;
        var regExec = advancedSelectorReg.exec(selector);

        selector = selector.replace(advancedSelectorReg, '');

        var getEl = function () {
            return readFromSelf ? $el : $el.find(selector);
        };

        if (regExec) {
            var attrName = regExec[1];
            if (attrName) {
                return getEl().attr(attrName);
            } else {
                return getEl().html();
            }
        } else {
            return getEl().text();
        }
    }

    , getDetailLink: function ($, $parent) {
        return $parent.find(this.options.links.detailLink).attr('href');
    }
    , getNextListLink: function ($) {
        return $(this.options.links.nextList);
    }

    , _urlQueue: {}
    , getUrlQueue: function (url) {
        if (this._urlQueue[url]) {
            return this._urlQueue[url];
        }
        return this._urlQueue[url] = avQ();
    }
    , clearUrlQueue: function (url) {
        delete this._urlQueue[url];
    }
    , _requestPage: function (url, callback) {
        var self = this;
        if (self.requetCache[url]) {
            return callback(null); // do nothing
        }
        self.emitter.emit(eventKeys.requestPage, url);
        request({
            url: url
            , timeout: this.options.retryTimeout
        }, function (err, res, pageBody) {
            if (err || !pageBody || !res || res.statusCode !== 200) {
                self.emitter.emit(eventKeys.requestFailed, {error: err, statusCode: res && res.statusCode || -1});
                self.log('Error', err, 'statusCode', res && res.statusCode, 'hasPageBody', !!pageBody, 'RETRY', url);
                return self._requestPage(url, callback);
            }
            self.requetCache[url] = 1;
            callback(pageBody);
        });
        return this;
    }
    , requestPage: function (url, callback) {
        var self = this;
        var q = self.getUrlQueue(url);
        if (q.length() == 0) {
            q.func(function (next) {
                self._requestPage(url, function (pageBody) {
                    q.data('pageBody', pageBody);
                    next();
                });
            });
        }

        q.func(function () {
            callback(q.data('pageBody'));
            if (q.length() == 1) {
                self.clearUrlQueue(url);
            }
        });
    }

    , save: function (data) {
        this.getDB()(this, data);
    }
    , getDB: function () {
        return Graper.db(this.options.dbType);
    }
    , log: function () {
        if (this.options.showLog) {
            console.log.apply(console, arguments);
        }
    }
});

Graper.prototype.constructor = Graper;

Graper.dbs = {};

Graper.db = function (dbName) {
    if (dbName) {
        return Graper.dbs[dbName];
    } else {
        return Graper.dbs[Graper._db] || Graper.dbs.files;
    }
}

Graper.addDb = function (dbName, implement, isDefault) {
    Graper.dbs[dbName] = implement;
    if (isDefault) {
        Graper._db = dbName;
    }
}

Graper.addDb('file', require('../dbs/file'), true);
Graper.addDb('view', require('../dbs/view'));

Graper.run = function (config) {
    var graper = new Graper(config);
    return graper.run();
};

module.exports = Graper;
