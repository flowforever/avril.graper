/**
 * Created by trump on 15/1/20.
 */
var program = require('commander')
, q = require('avril.queue')()
, package = require('./package.json')
, graper = require('./lib/graper')
, fs = require('fs-extra')
, path = require('path');

program.allowUnknownOption();

program.version(package.version)
.option('-s, --script <path>', 'task path')
.option('--showLog', 'show executing log')
.option('--dbType <string>','Database type [mongo,file]')
.option('--dbName <string>', 'Database name')
.option('--tbName <string>', 'The table name')
.parse(process.argv);

graper.ARGV = program;
graper.q = q;

var script = program.script || '';

var runConfig = function(){
	var graperFilePath = path.resolve( process.cwd(), script );
	var isJSON = /\.json$/i.test(graperFilePath);
	var config = require(graperFilePath);

	Object.keys(program).forEach(function(key){
		var cliArg = program[key];
		var cliType = typeof cliArg;
		if( 'undefined,object,function'.indexOf(cliType) < 0 ){
			config[key] = cliArg;
		}
	});

	config.isJSON = isJSON;
	
	console.log("Start with config:", '\n' ,graperFilePath);

	console.log(JSON.stringify(config, null, 4));

	graper.run(config);
	
}

q.$if(q.$await(fs.exists, script), function() {
	runConfig();
}).$elseIf(q.$await(fs.exists, 'graperfile.js'), function(){
	script = 'graperfile.js';
	runConfig();
})
.$elseIf(q.$await(fs.exists, 'graperfile.json'), function(){
	script = 'graperfile.json';
	runConfig();
})
.$else(function() {
	console.log('graper file is not exited.');
});