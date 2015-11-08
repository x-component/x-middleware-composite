'use strict';
/**
 * Concate middleware to function and handle errors
 *
 * Composition
 * -----------
 * call composite(...) with a list of middlewares(req,res,next){..} or an array to compose them into a single composite middleware.
 *
 * you cann add labels into the list by using a object with a single property:
 *
 *     '''
 *     var pipeline=composite([,,,{ name: middleware },,,]);
 *     '''
 *
 * The order is significant.
 *
 * Nesting
 * -------
 * Multiple composite pipelines can be nested: p.e.  composite([,,,{ name : composite([...]) },,]), as each composite is just
 * a normal middleware. It is also allowed to use an array directly: composite([,,,{ name : [...] },,,,]),
 *
 *
 * Injection
 * ---------
 * One can inject middlewares in an existing pipeline at the position 'name', *before* or *after* the current middleware at that position:
 *
 *     '''
 *     pipeline.after(name:extra_middleware);
 *     '''
 *
 * The modified pipeline then has a { name: [middleware,extra_middleware] } element.
 *
 * To allow a more felixble namin / injection on can also access nested composites using before by passing
 * as name in before /after a JSON selector:
 *
 * Example:
 *     '''
 *     var pipeline=composite([,,,{ transform: [,,,{ dom: middlewares },,,] },,,,]);
 *
 *     pipeline.after('.transform .dom':extra_middleware); // inserts it at the nested position
 *     '''
 *
 * Design Rationale:
 * -------
 * Often pipelines and request handlers can be reused. One can define generic functions seting up a url request handler with a default pipeline.
 * or just returning a default pipeline. The caller then modifiy the returned pipeline by injection.
 * For example to add some extra handling for a specific application/url
 * without creating a complete copy of the generic pipeline.
 *
 * Alternatives would have been:
 *  - offer functions which return just building blocks of pipelines and and some function delivering some predefined ones
 *    positive: no declerative magic involded. Using code explicitly requests building blocks and composes them.
 *    negative: lots of array composition logic, lots of functions for each eventual possibility.
 *    This approach is still usable and usefull.
 *
 *  - event hooks
 *    one could mix middlewares with events, and prove hooks forcertain phases within the pipeline.
 *    For events how ever the order is conceptionally not defined and it results in a mixing of event concepts and middleware concepts.
 *
 */

var
	global_log = require('x-log').logger(__filename),
	extend     = require('x-common').extend,
	select     = require('x-select'),
	inspect    = require('function-inspector').inspect;


var f2str = function(f){
	f = f || this;
	var
		result = inspect(f),
		file = (result.File || '').replace(/^.*mobile\-portal\//,'').replace(/\.js$/,''),
		row_column = result.LineNumber ? '(' + result.LineNumber + ( result.ColumnNumber ? ','+ result.ColumnNumber : '' ) + ')' : '',
		name = f.name || result.Name;
	
	if( !name || name.length < 4 ) name = result.InferredName;
    if( !name || name.length < 4 ) {
		name = (''+(f||'')).replace(/\s+/mg,'')
			.replace('var','').replace('tmp','')
			.replace(/function([^\(]*)\([^\)]*\)[^\{]*/,'$1')
			.replace('log=req&&req.log?req.log(__filename):{}','')
			.replace('log=req.log?req.log(__filename):{}','')
			.replace(/config=require\([^\)]*\)\(__dirname\+'\/config\)/,'')
			.replace('next&&next();','next();')
			.substring(0,100);
	}
	if(name) name = name.replace(/module\.exports/,'').replace(/\.M(\.)?/,'');
	return ( file ? file + ':' : '') + name + row_column;
};

var COMPOSITE;
module.exports = extend( COMPOSITE = function COMPOSITE() {
	
	var middleware = function composite(req, res, end){
		var log = req.log ? req.log(__filename) : global_log;
		
//		log.debug && log.debug("composite begin");
//
		var i = 0;
		(function next(err) {
			var
				f = composite.stack[i++],
				
				try_this = function(){
					try { this(); } catch(e){
						var
							err      = e instanceof Error ? e : new Error('composite catched exepection:' + e ),
							log_info = { error: extend(err.status ? {status: err.status}:{} , {message: err.message, stack: (''+err.stack).split('\n') }) };
						
						extend(log_info,{request:{url:req.url,headers:req.headers}});
						log.error && log.error('composite exception', log_info ); next(err);
					}
				},
				
				next_tick = (function(){
					var called = false;
					return function(err){
						if(!called) {
							called=true;
							process.nextTick( try_this.bind( next.bind(null,err) ) );
						} else {
							var e = new Error('calling middleware called next more then once');
							log.error && log.error('programming error',e);
							if(log.debug) process.exit(1); // in debug mode, (during development) kill the process so this is never passed unnoticed!
							next(e); // try to report this on the ui
						}
					};
				})();
			
			if(!f) { // break on end/null/false/undefined
				err && log.error && log.error('composite end error', err instanceof Error ? err : {err:err});
				end && end(err);
				return;
			}
			
			// if an element in the stack is an object like { 'name' : function(){..} }
			// use the first property value as function
			var name=null;
			if( typeof(f)==='object' && !Array.isArray(f)){
				var keys = Object.keys(f);
				name = keys.length ? keys[0]:null;
				
				f = f[name];
				
				if( keys.length > 1 ){
					log.error && log.error('only one property can be used as middleware',{name:name,keys:keys});
				}
			}
			
			if(Array.isArray(f) ){
				if( 'composite' in f ){
					f=f.composite;
				} else {
					if(f[0] && f[0].condition){
						var c = f[0].condition;
						if(c && c.test){
							f=(f.composite=require('./condition')(c.test,c['true'],c['false']));
						} else {
							log.error && log.error('a condtion without the proper structure: {test:, true:,false:}',{element:f});
						}
					} else {
						f=(f.composite=COMPOSITE(f));
					}
				}
			}
			
			if(typeof(f)!=='function'){
				log.error && log.error('composite error, could not execute middleware', {middleware:''+f,type:typeof(f)} );
				end && end(err);
				return;
			}
			//log.debug && log.debug('function calling*************',{middleware:name || f2str(f), url:req.url }); // usefull while debugging to see call order of anonymous functions by printing the source
			
			name = name || f.name || ''+f;
			if(name.length < 3 ) name = '' + f;
			
			if(COMPOSITE.stats && COMPOSITE.stats.active && 3 === f.length) f=COMPOSITE.stats.from(name,f);
			
			 ( !err && 3 === f.length ? f(     req, res, next_tick ) // no error middleware call
			:(  err && 4 === f.length ? f(err, req, res, next_tick ) //    error middleware call
			 : next_tick(err)
			 )
			);
		})();
	};
	
	[].slice.call(arguments).forEach(function (a){ // add arguments (arrays and elements) on stack
		// sub composites are created if needed.
		// by referencing their stacks and not the function themselves
		// we can deeply navigate the final stack using 'select' via these stack 'arrays' because select/traverse ignores functions
		middleware.stack=(middleware.stack || [] ).concat(COMPOSITE.decompose(a));
	});
	
	middleware.stack.composite=middleware;
	
	extend(middleware,{
		before   : COMPOSITE.before,
		after    : COMPOSITE.after,
		replace  : COMPOSITE.replace,
		remove   : COMPOSITE.remove,
		merge    : COMPOSITE.merge,
		dump     : COMPOSITE.dump,
		decompose: COMPOSITE.decompose
	});
	
	return middleware;
},{
	decompose : function F(o){
		if( o ){
			     if ( typeof(o)==='function' && ('stack' in o) ) return F(o.stack);
			else if ( typeof(o)==='object' ){
				if(Array.isArray(o)){
					var new_array = [];
					for(var i=0,l=o.length;i<l;i++) new_array[i]=F(o[i]); // recursive call!
					return new_array;
				} else {
					var new_object={};
					for(var p in o ) {
						new_object[p]=F(o[p]); // recursive call!
					}
					return new_object;
				}
			}
		}
		return o;
	},
	
	update: function(compose){
		return function(){
			var
				stack      = this.stack,
				add        = [];
			
			[].slice.call(arguments).forEach(function(a){
				add = add.concat(a);
			});
			
			add.forEach(function(add_object){
				
				//add_object=COMPOSITE.decompose(add_object);
				
				if( typeof(add_object)==='function' ){
					stack.unshift(add_object);
					return;
				}
				
				if( typeof(add_object)!=='object' ){
					global_log.error && global_log.error('composite before/after/replace/romove argument must be {\'name_or_selector\': function, ... }');
					return;
				}
				
				for( var add_name in add_object ){
					var add_f = add_object[add_name];
					
					if(!add_f) continue;
					
					if(!~add_name.indexOf('.')) add_name = '.' + add_name.trim();
					select(stack,add_name).forEach((function(add_f,add_name){ return function(stack_f){
						//if(~add_name.indexOf('main')) debugger;
						this.update(COMPOSITE.decompose(compose(add_f,stack_f)),true);
					};})(add_f,add_name)); // jshint ignore:line
				}
			});
			return this;
		};
	},
	noop : function(req,res,next){next && next();}
});



extend(COMPOSITE, {
	before  : COMPOSITE.update(function(add_f,stack_f){ if(!Array.isArray(add_f))   add_f=[add_f];     return add_f.concat(stack_f); }),
	after   : COMPOSITE.update(function(add_f,stack_f){ if(!Array.isArray(stack_f)) stack_f=[stack_f]; return stack_f.concat(add_f); }),
	replace : COMPOSITE.update(function(add_f,stack_f){ return add_f; }),
	remove  : COMPOSITE.update(function(add_f,stack_f){ return COMPOSITE.noop; }), // do not really remove, otherwise the label is gone
	
	// this remove the matched elements and then adds the leaves
	// pipeline.merge({'.parentselector .name' : function(){} }) ===
	
	// pipeline.remove({'.parentselector .name': true });
	// pipeline.after({'.parentselector': { name : function... } }
	
	// you can use name:before ir name:after to perfrom a pipeline.before / pipeline.after (after is default);
	
	merge   : function(){
		var
			self = this,
			src  = [];
		
		[].slice.call(arguments).forEach(function(a){
			src = src.concat(a);
		});
		src.forEach(function(src_object){
			if( typeof(src_object)!=='object' ){
				global_log.error && global_log.error('composite merge source must be {\'selector\': ... }',{source:''+src_object});
				return;
			}
			for( var selector in src_object ){
				var
					add_object = src_object[selector],
					method     = /:before$/.test(selector) ? 'before' : 'after';
				selector = selector.replace(/:(before|after)$/,'');
				
				var remove_object={};
				remove_object[selector]=true;
				self.remove(remove_object);
								
				var s = selector.split(/\s+/);
				var name = s.pop();
				
				name=name.replace(/^\./,'');
				var named_add_object = {}; named_add_object[name]=add_object;
				if(s.length && s[s.length]==='>') s.pop();
				var o={};o[s.join(' ')]=named_add_object;
				self[method](o);
			}
		});
		return this;
	},
	
	dump:function(){
		return JSON.stringify(this.stack,function(k,v) {
			return (typeof v === 'function') ? f2str(v) : v;
		},'\t');
	}
});

//###########################################



extend(COMPOSITE,{
	stats : {
		data : {}, // contains some data for each function name
		
		active     : process.env.NODE_ENV && ~process.env.NODE_ENV.indexOf('STATS'),
		
		file       : { counter : 0},
		// some helpers
		init       : function(v){ return [v,v]; },
		console    : function(t,msg){ console.log( ''+(msg||'')+'['+t[0]+','+t[1]+']'); return t; },
		format_ms  : function(t){ var d =''+t[0]; return '0000'.substring(0,4-d.length)+d; },
		format_ns  : function(t){ var d =''+t[1]; return '000000000000000'.substring(0,15-d.length)+d; },
		format     : function(t){ return this.format_ms(t)+'-'+this.format_ns(t); },
		inc        : function(t1,t2){ t1[0]+=t2[0]; t1[1]+=t2[1]; },
		div        : function(t1,t2){ return [t1[0]/t2[0],t1[1]/t2[1]]; },
		mult       : function(t1,t2){ return [t1[0]*t2[0],t1[1]*t2[1]]; },
		round      : function(t){ return [Math.round(t[0]),Math.round(t[1])]; },
		str        : function(t){ return [''+t[0],''+t[1]]; },
		concat     : function(t1,t2){ var t=this.init(''); this.inc(t,this.str(t1)); this.inc(t,this.str(t2)); return t; },
		zero       : function(){ return this.format(this.init(0)); },
		max        : function (x1,x2){ if(!x1)x1=x2; else if(!x2)x2=x1; return x1 && x2 && x1 > x2 ? x1 : x2 ; },
		min        : function (x1,x2){ if(!x1)x1=x2; else if(!x2)x2=x1; return x1 && x2 && x1 < x2 ? x1 : x2 ; },
		percent    : function (t1,t2){ return this.concat(this.round(this.div(this.mult(t2,this.init(100)),t1)),this.init('%')); },
		
		// adds as f.stats a wrapper of f, wich adds measured duration in milli- and nano-seconds to the stats.data
		from : function(name,f){
			var inc=this.inc.bind(this), self =this;
			if(!f.stats){
				f.stats = (function(name,f){
					var stats = self.data[name] = { name:name, count:0, total:self.init(0) };
					return function (req,res,original_next){
						var t = process.hrtime();
						var result = f(req,res,function(err){
							var duration = process.hrtime(t);
							stats.count++;
							inc( stats.total, duration );
							original_next && original_next(err);
						});
						return result;
					};
				})(name,f);
			}
			return f.stats;
		},
		
		dump : function(){
			this.file.counter++;
			var
				format      = this.format.bind(this),
				inc         = this.inc.bind(this),
				init        = this.init.bind(this),
				now         = new Date(),
				timestamp   = +now,
				date_str    = '' + now.getFullYear() + '_' + (1 + now.getMonth()) + '_' + now.getDate(),
				cluster     = require('cluster'),
				worker_id   = cluster && cluster.worker ? cluster.worker.id : 'x',
				file        = 'stats_' + date_str + '_' + timestamp + '_' + process.pid + '_' + worker_id + '_' + this.file.counter + '.csv',
				fs          = require('fs'),
				stats_file  = fs.createWriteStream(file, {flags:'w+'}),
				stats       = this.data,
				by_duration = {},
				total       = this.init(0);
			
			for( var fn in stats ){
				var entry = stats[fn];
				var d = this.format(entry.total);
				inc(total, entry.total);
				if(by_duration[d]) by_duration[d].push(entry); else by_duration[d]=[entry];
				
				// format
				entry.total = format(entry.total).replace('-','","');
				entry.name  = f2str(fn);
				entry.reset = true;
			}
			total = format(total).replace('-','","');
			
			var durations=Object.keys(by_duration).sort().reverse().forEach(function(t){
				by_duration[t].forEach(function(entry){
					var s=
						'"' + entry.name      + '",' +
						'"' + entry.count     + '",' +
						'"' + entry.total     + '",' +
						'"' + total           + '",' +
						'"' + timestamp       + '"\n';
					stats_file.write(s);
					// reset
					entry.count=0;
					entry.total=init(0);
				});
			});
			stats_file.end('');
			
			global_log.debug && global_log.debug("###-DUMPED-STATS-###",{file:file});
			return file;
		}
	}
});
