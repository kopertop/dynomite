/*
 * Author: Chris Moyer <cmoyer@newstex.com>
 * Grunt Commands
 */
/* global module, require */

module.exports = function(grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			all: ['Gruntfile.js', 'lib/**/*.js', 'tests/*.js'],
			options: {
				ignores: [
					'lib/strftime.js',
					'lib/socket.io-store-memcached/**',
					'lib/**/*.min.js',
				],
				"-W099": false, // Allow mixing spaces and tabs (this can happen in comments)
				"-W084": false, // Allow making assignments from within a While loop
				"-W083": false, // Allow making functions in a loop
			},
		},
		// Configure the Mocha Test and Istanbul Coverage report
		mocha_istanbul: {
			coverage: {
				src: 'tests',
				options: {
					reporter: 'spec'
				},
			},
		},
	});

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-mocha-istanbul');

	grunt.registerTask('coverage', ['mocha_istanbul:coverage']);

	// Default Task
	grunt.registerTask('default', ['jshint', 'coverage']);
};
