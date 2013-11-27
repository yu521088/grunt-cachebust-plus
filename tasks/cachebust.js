'use strict';

module.exports = function(grunt) {

    var fs      = require('fs');
    var path    = require('path');
    var crypto  = require('crypto');
    var cheerio = require('cheerio');

    var remoteRegex = /http:|https:|\/\/|data:image/;

    var regexEscape = function(str) {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    };

    var cheerioOptions = {
        ignoreWhitespace: true,
        lowerCaseTags: true
    };

    var options = {
        algorithm: 'md5',
        baseDir: './',
        deleteOriginals: false,
        encoding: 'utf8',
        length: 16,
        replaceTerms:[],
        rename: false
    };

    var checkIfRemoteFile = function() {
        return !remoteRegex.test(this.attr('src')) && !remoteRegex.test(this.attr('href'));
    };

    var findStaticAssets = function(data) {
        var $ = cheerio.load(data, cheerioOptions);

        // Add any conditional statements or assets in comments to the DOM
        var assets = '';

        $('head, body').contents().filter(function(){
            return this[0].type === 'comment';
        }).each(function(i, e) {
            assets += e.data.replace(/\[.*\]>|<!\[endif\]/g, '').trim();
        });

        $('body').append(assets);

        var scripts     = $('script').filter(checkIfRemoteFile).map(function() { return this.attr('src'); });
        var stylesheets = $('link[rel="stylesheet"]').filter(checkIfRemoteFile).map(function() { return this.attr('href'); });
        var images      = $('img').filter(checkIfRemoteFile).map(function() { return this.attr('src'); });
        var favicons    = $('link[rel="icon"], link[rel="shortcut icon"]').filter(checkIfRemoteFile).map(function() { return this.attr('href'); });

        return [].concat(scripts, stylesheets, images, favicons);
    };

    grunt.file.defaultEncoding = options.encoding;

    grunt.registerMultiTask('cacheBust', 'Bust static assets from the cache using content hashing', function() {

        var opts = grunt.util._.defaults(this.options(), options);

        this.files.forEach(function(f) {
            var src = f.src.filter(function(filepath) {
                // Warn on and remove invalid source files (if nonull was set).
                if (!grunt.file.exists(filepath)) {
                    grunt.log.warn('Source file "' + filepath + '" not found.');
                    return false;
                } else {
                    return true;
                }
            }).map(function(filepath) {
                var markup = grunt.file.read(filepath);

                findStaticAssets(markup).forEach(function(reference) {
                    var filePath  = opts.baseDir + '/';
                    var filename  = path.normalize((filePath + reference).split('?')[0]);
                    var extension = path.extname(filename);

                    var newFilename;

                    // Replacing specific terms in the import path so renaming files
                    if(opts.replaceTerms && opts.replaceTerms.length > 0) {
                        opts.replaceTerms.forEach(function(obj) {
                            grunt.util._.each(obj, function(replacement, term) {
                                filename  = filename.replace(term, replacement);
                                reference = reference.replace(term, replacement);
                            });
                        });
                    }

                    if(opts.rename && !grunt.file.exists(filename)) {
                        grunt.log.warn('Static asset "' + filename + '" skipped because it wasn\'t found.');
                        return false;
                    }

                    // Get the files data
                    var fileData = grunt.file.read(filename);

                    // Generate content hash
                    var hash = opts.hash || crypto.createHash(opts.algorithm).update(fileData, opts.encoding).digest('hex').substring(0, opts.length);

                    if(opts.rename) {
                        // Create our new filename
                        newFilename = filePath + reference.replace(extension, '') +'_'+ hash + extension;

                        // Update the reference in the markup
                        markup = markup.replace(new RegExp(regexEscape(reference), 'g'), reference.replace(extension, '') +'_'+ hash + extension);

                        // Create our new file
                        grunt.file.copy(filename, newFilename);

                        // Delete the original file if the setting is true
                        if(opts.deleteOriginals) {
                            grunt.file.delete(filename);
                        }
                    } else {
                        newFilename = reference.split('?')[0] + '?' + hash;
                        markup = markup.replace(new RegExp(regexEscape(reference), 'g'), newFilename);
                    }
                });

                grunt.file.write(filepath, markup);

                grunt.log.writeln(filepath + ' was busted!');
            });
        });
    });

};