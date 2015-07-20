var fs = require('fs-extra');
var avQ = require('avril.queue');
var path = require('path');


var executeTime = 0;
module.exports = function (graper, dataItem) {
    var cfg = graper.options;
    var dbName = cfg.dbName || 'graper_data';
    var tableName = cfg.tbName || 'default';

    var url = dataItem.url;

    var urlArr = url.split('/');

    var fileName = urlArr[urlArr.length - 1];

    var jsonFilePath = path.resolve(process.cwd(), dbName, tableName, fileName + '.json');

    var folderPath = path.dirname(jsonFilePath);

    if (executeTime++ == 0) {
        fs.ensureDirSync(folderPath);
    }

    var q = avQ();

    var $filseExisted = q.$await(fs.exists, jsonFilePath);

    q.$if($filseExisted, function () {

    }).$else(function () {
        fs.writeJsonFile(jsonFilePath, dataItem);
    });

};
module.exports.init = function (graper) {
    var cfg = graper.options;
    var dbName = cfg.dbName || 'graper_data';
    var tableName = cfg.tbName || 'default';

    fs.ensureDir(path.resolve(process.cwd(), dbName, tableName), function () {
    });
};
