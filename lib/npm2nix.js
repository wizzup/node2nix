var fs = require('fs');
var path = require('path');
var slasp = require('slasp');
var nijs = require('nijs');
var PackageSet = require('./packageset.js').PackageSet;
var packageGenerator = require('./generator/package.js');
var collectionGenerator = require('./generator/collection.js');
var compositionGenerator = require('./generator/composition.js');

/**
 * @member npm2nix
 *
 * Writes a copy of node-env.nix to a specified path.
 *
 * @param {String} nodeEnvNix Path to which the NPM package build expression is written
 * @param {function(String)} callback Callback function that gets invoked if the operation is done.
 *     If an error has occured, the error parameter is set to the error message.
 */
function copyNodeEnvExpr(nodeEnvNix, callback) {
    /* Compose a read stream that reads the build expression */
    var rs = fs.createReadStream(path.join(path.dirname(module.filename), "..", "nix", "node-env.nix"));
    rs.on("error", function(err) {
        callback(err);
    });
    
    /* Compose a write stream that writes the build expression */
    var ws = fs.createWriteStream(nodeEnvNix);
    ws.on("error", function(err) {
        callback(err);
    });
    ws.on("close", function() {
        callback(null);
    });
    
    /* Pipe the data to actually copy stuff */
    rs.pipe(ws);
}

exports.copyNodeEnvExpr = copyNodeEnvExpr;

/**
 * @member npm2nix
 *
 * Generates a Nix expression from a JSON file representing a Node.js package
 * configuration or an array of NPM dependencies.
 *
 * @param {String} inputJSON Path to a package.json or arbitrary JSON file
 * @param {String} outputNix Path to which the generated registry expression is written
 * @param {String} compositionNix Path to which the generated composition expression is written
 * @param {String} nodeEnvNix Path to which the NPM package build expression is written
 * @param {Boolean} production Indicates whether to deploy the package in production mode
 * @param {Boolean} includePeerDependencies Indicates whether to include peer dependencies with the package
 * @param {Boolean} flatten Indicates whether to create a flat dependency structure in which dependencies are as high as possible in the graph
 * @param {String} registryURL URL of the NPM registry
 * @param {function(String, String)} callback Callback function that gets invoked when the work is done.
 *     If an error occurs, the error parameter is set to contain the error
 *     If the operation succeeds, it returns a string containing the registry expression containing the packages and all its dependencies
 */
function npmToNix(inputJSON, outputNix, compositionNix, nodeEnvNix, production, includePeerDependencies, flatten, registryURL, callback) {
    var obj = JSON.parse(fs.readFileSync(inputJSON));
    
    slasp.sequence([
        /* Generate a Nix expression */
        function(callback) {
            if(typeof obj == "object" && obj !== null) {
                var baseDir = path.dirname(inputJSON);
                var outputDir = path.dirname(outputNix);
                var packageSet = new PackageSet(registryURL, baseDir, outputDir);
                
                if(Array.isArray(obj)) {
                    collectionGenerator.generateCollectionExpr(packageSet, obj, production, includePeerDependencies, flatten, callback);
                } else {
                    packageGenerator.generatePackageExpr(packageSet, obj, new nijs.NixFile({ value: "./." }), production, includePeerDependencies, flatten, callback);
                }
            } else {
                callback("The provided JSON file must be an object or an array");
            }
        },
        
        /* Write the output Nix expression to the specified output file */
        function(callback, expr) {
            fs.writeFile(outputNix, nijs.jsToNix(expr, true), callback);
        },
        
        /* Copy the node-env.nix expression */
        function(callback) {
            copyNodeEnvExpr(nodeEnvNix, callback)
        },
        
        /* Generate and write a Nix composition expression to the specified output file */
        function(callback) {
            if(typeof obj == "object" && obj !== null) {
                var compositionExpr = compositionGenerator.generateCompositionExpr(nodeEnvNix, outputNix);
                fs.writeFile(compositionNix, nijs.jsToNix(compositionExpr, true), callback);
            } else {
                callback("The provided JSON file must consist of an object or an array");
            }
        }
    ], callback);
}

exports.npmToNix = npmToNix;