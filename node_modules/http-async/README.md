# Asyncronous Request

Allows you to make http or https requests using async/await (or promise) for better flow in your code

```javascript
let request = require('http-async')
async function go() {
	let response = await request('get', 'https://www.google.com', null, {'accept':'*/*'}))
	console.log(response) // {code:200, message:'OK', content:'... html ...', headers:{...}, url:'https://www.google.com'}
}
go().catch((e) => { console.log('error making request', e); }
```

## Calling Syntax 

With async/await

```javascript
let result = await request(method, uri, payload, headers)
```

With promises

```javascript
request(method, uri, payload, headers)
	.then((result) => {

	})
```

## Returns

```json
{
	"code":200,
	"message":"status message",
	"content":"Body of content, varies, if application/json content-type, object is returned, if binary, buffer, if text or html string",
	"headers":{
		"key":"value"
	},
	"url":"https://resulting.com/url"
}
```

## Supports

1. Decompressing compressed streams. Respects content-encoding and accept-encoding (deflate and gzip)
2. Redirects will be followed for all methods (302/301 etc), in addition to relative redirects (Location: /)
3. Mime-type based content bodies, application/json types returns an object; text types return strings, all others return a buffer object.
4. http and https protocols

## Notes

* Error status codes such as 400 through 500 codes do not throw an error, they return as a normal response, only network errors trigger a try/catch 