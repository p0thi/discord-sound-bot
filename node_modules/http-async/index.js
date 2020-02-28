
const https = require('https')
const http = require('http')
const url = require('url')
const zlib = require('zlib')

function is_binary(mime) {
	return !mime || !(
		mime.indexOf('json') !== -1 ||
		mime.indexOf('html') !== -1 ||
		mime.indexOf('text') !== -1 ||
		mime.indexOf('xml') !== -1)
}

function is_json(mime) {
	return mime.indexOf('json') !== -1
}

function is_gzip(encoding) {
	return encoding && encoding.indexOf('gzip') !== -1
}

function is_deflate(encoding) {
	return encoding && encoding.indexOf('deflate') !== -1
}

async function request(method, uri, payload, headers) {
	headers = headers || {'accept':'*/*'}
	if(!headers['accept-encoding']) {
		headers['accept-encoding'] = 'gzip, deflate'
	}
	return new Promise((resolve, reject) => {
		let protocol = uri.startsWith('https') ? https : http
		let req = protocol.request(Object.assign({method,headers},url.parse(uri)), async function(response) {
			// Handle redirects
			if((response.statusCode === 302 || response.statusCode === 301) && response.headers['location']) {
				let new_uri = response.headers['location'].startsWith('http') ? response.headers['location'] : url.resolve(uri,response.headers['location']);
				request(method, new_uri, payload, headers).catch(reject).then(resolve)
			} else {
				let content = new Buffer(0)
				response.on('data', (chunk) => { content = Buffer.concat([content, chunk]) })
				response.on('error', reject)
				response.on('end', () => {
					if(is_gzip(response.headers['content-encoding'])) {
						content = zlib.gunzipSync(content)
					}
					if(is_deflate(response.headers['content-encoding'])) {
						content = zlib.inflateSync(content)
					}
					if(!is_binary(response.headers['content-type'])) {
						content = content.toString('utf8')
						if(is_json(response.headers['content-type'])) {
							content = JSON.parse(content)
						}
					}
					resolve({url:uri, code:response.statusCode, message:response.statusMessage, headers:response.headers, content}); 
				})
			}
		})
		req.on('error', reject)
		if(payload) {
			req.write(payload)
		}
		req.end()
	})
}

module.exports = request