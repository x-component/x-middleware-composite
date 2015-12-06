# x-middleware-composite

[Build Status](https://travis-ci.org/x-component/x-middleware-composite.png?v1.0.0)](https://travis-ci.org/x-component/x-middleware-composite)

- [./composite.js](#compositejs) 

# ./composite.js

  - [global_log](#global_log)

## global_log

  Concate middleware to function and handle errors
  
  Composition
  -----------
  call composite(...) with a list of middlewares(req,res,next){..} or an array to compose them into a single composite middleware.
  
  you cann add labels into the list by using a object with a single property:
  
```js
  '''
  var pipeline=composite([,,,{ name: middleware },,,]);
  '''
```

  
  The order is significant.
  
  Nesting
  -------
  Multiple composite pipelines can be nested: p.e.  composite([,,,{ name : composite([...]) },,]), as each composite is just
  a normal middleware. It is also allowed to use an array directly: composite([,,,{ name : [...] },,,,]),
  
  
  Injection
  ---------
  One can inject middlewares in an existing pipeline at the position 'name', *before* or *after* the current middleware at that position:
  
```js
  '''
  pipeline.after(name:extra_middleware);
  '''
```

  
  The modified pipeline then has a { name: [middleware,extra_middleware] } element.
  
  To allow a more felixble namin / injection on can also access nested composites using before by passing
  as name in before /after a JSON selector:
  
  Example:
```js
  '''
  var pipeline=composite([,,,{ transform: [,,,{ dom: middlewares },,,] },,,,]);
```

  
```js
  pipeline.after('.transform .dom':extra_middleware); // inserts it at the nested position
  '''
```

  
  Design Rationale:
  -------
  Often pipelines and request handlers can be reused. One can define generic functions seting up a url request handler with a default pipeline.
  or just returning a default pipeline. The caller then modifiy the returned pipeline by injection.
  For example to add some extra handling for a specific application/url
  without creating a complete copy of the generic pipeline.
  
  Alternatives would have been:
   - offer functions which return just building blocks of pipelines and and some function delivering some predefined ones
```js
 positive: no declerative magic involded. Using code explicitly requests building blocks and composes them.
 negative: lots of array composition logic, lots of functions for each eventual possibility.
 This approach is still usable and usefull.
```

  
   - event hooks
```js
 one could mix middlewares with events, and prove hooks forcertain phases within the pipeline.
 For events how ever the order is conceptionally not defined and it results in a mixing of event concepts and middleware concepts.
```

