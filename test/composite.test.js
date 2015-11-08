'use strict';

/**
 * Unit tests for the middleware composite module.
 * The tested module aims for an easy concatenation and usage of
 * Connect-compatible middleware functions.
 */

var
	vows      = require('vows'),
	assert    = require('assert'),
	composite = require('../composite'),
	log       = require('x-log'),
	//this specifies the nesting levels and how many middlewares will be created
	//on each nesting level
	NESTED_N  = [ 2, 3, 4, 5],
	//each middleware will set a timeout before proceeding to the next one
	TIMEOUT = 1,
	verbose = false; //true, //false,

log.console(verbose);

var
	createTestMiddleware = function(n, nestingDepth, path, depth, compositeModule) {
		var
			i       = 0,
			result  = [];
		
		if(nestingDepth<=depth) {
			return function(req, res, next) {
				if(!res.invocationSequence) {
					res.invocationSequence = "";
				}
				res.invocationSequence += path;
				setTimeout(function() { next && next(); }, TIMEOUT);
			};
		}
		while(i<n[depth]) {
			result[i] = createTestMiddleware(n, nestingDepth, path+i, depth+1, compositeModule);
			i++;
		}
		
		return compositeModule(result);
	},
	/**
	 * CreateTestMiddlewareArray provides n middlewares that should serve as input parameter for the composite module.
	 * Each middleware again contains n middlewares which were aggregated by the composite module.
	 * When invoked each middleware will add to a path string which is a property of the response object.
	 * This path string can finally be compared to the expected invocation sequence to ensure the correct invocation
	 * sequence (this sequence gets computed by calculateInvocationSequence).
	 */
	createTestMiddlewareArray = function(n, nestingDepth, compositeModule) {
		return createTestMiddleware(n, nestingDepth, "", 0, compositeModule);
	},
	
	calculateInvocationSequence = function(path, n, nestingDepth) {
		return (function calculateInvocationSequenceRec(path, n, depth) {
			var result = '',i;
			if(depth===1) {
				for(i = 0; i<n[nestingDepth-depth]; i++) {
					result += path + i;
				}
				return result;
			} else {
				for(i = 0; i<n[nestingDepth-depth]; i++) {
					result += calculateInvocationSequenceRec(path+i, n, depth-1);
				}
				return result;
			}
		})(path, n, nestingDepth);
	};


vows.describe('Composite module unit tests')
.addBatch({
	'The composite module': {
		topic: function() {
			return composite;
		},
		'when provided with a Connect-compatible middleware function': {
			topic: function(compositeModule) {
				return compositeModule(
					function(req, res, next) {
						req.test = true;
						next && next();
					}
				);
			},
			'will return a middleware function that when invoked': {
				topic: function(middleware) {
					var req     = {},
						res     = {},
						thisRef = this;
					middleware(req, res, function(err) {
						thisRef.callback(req, res);
					});
				},
				'will call the provided function before the "next" function': function(req, res) {
					assert.ok(req.test);
				}
			}
		},
		'when provided with multiple Connect-compatible middleware functions': {
			topic: function(compositeModule) {
				return createTestMiddlewareArray(NESTED_N, 1, compositeModule);
			},
			'will return a middleware function that when invoked': {
				topic: function(middleware) {
					var req     = {},
						res     = {},
						thisRef = this;
					middleware(req, res, function(err) {
						thisRef.callback(req, res);
					});
				},
				'will call all provided functions SEQUENTIALLY before the final "next" function': function(req, res) {
					assert.equal(res.invocationSequence, calculateInvocationSequence('', NESTED_N, 1));
				}
			}
		},
		'when provided with multiple Connect-compatible middleware functions which again contain nested composited middleware functions': {
			topic: function(compositeModule) {
				return createTestMiddlewareArray(NESTED_N, NESTED_N.length, compositeModule);
			},
			'will return a middleware function that when invoked': {
				topic: function(middleware) {
					var req     = {},
						res     = {},
						thisRef = this;
					middleware(req, res, function(err) {
						thisRef.callback(req, res);
					});
				},
				'will call the provided functions SEQUENTIALLY before the final "next" function': function(req, res) {
					assert.equal(res.invocationSequence, calculateInvocationSequence('', NESTED_N, NESTED_N.length));
				}
			}
		}
	}
})

.addBatch({
	'composite test adding a middleware with before': {
		topic: function(){
			return composite([
				{'here': function(req,res,next){
					res.results.push('HERE');
					next && next();
				}}
			]);
		},
		'add before \'here\'' : {
			topic: function(composite){
				var result = composite.before({ 'here':function(req,res,next){
					res.results.push('BEFORE');
					next && next();
				}});
				return result;
			},
			'call extended composite with added middleware' : {
				topic : function(composite){
					var
						self = this,
						req = {},
						res = { results: [] };
					composite(req,res,function(){
						self.callback(res.results);
					});
				},
				'result two middlewares called' : function(results){ assert.equal(results.length,2); },
				'result first middlewares called is BEFORE' : function(results){ assert.equal(results[0],'BEFORE'); },
				'result second middlewares called is HERE' : function(results){ assert.equal(results[1],'HERE'); }
			}
		}
	}
})

.addBatch({
	'composite test adding middleware with after': {
		topic: function(){
			return composite([
				{'here': function(req,res,next){
					res.results.push('HERE');
					next && next();
				}}
			]);
		},
		'add after \'here\'' : {
			topic: function(composite){
				return composite.after({ 'here':function(req,res,next){
					res.results.push('AFTER');
					next && next();
				}});
			},
			'call extended composite with added middleware' : {
				topic : function(composite){
					var
						self = this,
						req = {},
						res = { results: [] };
					composite(req,res,function(){
						self.callback(res.results);
					});
				},
				'test two middlewares called' : function(results){ assert.equal(results.length,2); },
				'test first middlewares called is HERE' : function(results){ assert.equal(results[0],'HERE'); },
				'test second middlewares called is AFTER' : function(results){ assert.equal(results[1],'AFTER'); }
			}
		}
	}
})

.addBatch({
	'composite test replacing middleware with replace': {
		topic: function(){
			return composite([
				{'here': function(req,res,next){
					res.results.push('HERE');
					next && next();
				}}
			]);
		},
		'replace the middleware \'here\'' : {
			topic: function(composite){
				return composite.replace({ 'here':function(req,res,next){
					res.results.push('REPLACEMENT');
					next && next();
				}});
			},
			'call extended composite with replaced middleware' : {
				topic : function(composite){
					var
						self = this,
						req = {},
						res = { results: [] };
					composite(req,res,function(){
						self.callback(res.results);
					});
				},
				'test one middleware called'                   : function(results){ assert.equal(results.length,1); },
				'test first middlewares called is REPLACEMENT' : function(results){ assert.equal(results[0],'REPLACEMENT'); },
			}
		}
	}
})

.addBatch({
	'composite test removing middleware with remove': {
		topic: function(){
			return composite([
				{'here': function(req,res,next){
					res.results.push('HERE');
					next && next();
				}}
			]);
		},
		'remove the middleware \'here\'' : {
			topic: function(composite){
				return composite.remove({ 'here': true });
			},
			'call extended composite with removed middleware' : {
				topic : function(composite){
					var
						self = this,
						req = {},
						res = { results: [] };
					composite(req,res,function(){
						self.callback(res.results);
					});
				},
				'test no middleware called' : function(results){ assert.equal(results.length,0); }
			}
		}
	}
})


.exportTo(module,{error:false});
