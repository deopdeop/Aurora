// TODO: Remove space indent

const config = {httpprefix: '{{.HTTPPrefix}}', wsprefix: '{{.WSPrefix}}', url: new URL('{{.URL}}'), proxyurl: new URL('{{.ProxyURL}}')};

const b64URL = {
	encode: url => btoa(url).replace(/\+/g, '-').replace(/\//g, '_'),
	decode: url => atob(url.replace(/\-/g, '+').replace(/\_/g, '/'))
};

const rewrites = {
	isUrl: url => {
		switch (true) {
		case url.startsWith(config.httpprefix):
			break;
		case url.startsWith(config.wsprefix):
			break;
		default:
			try {
				return Boolean(new URL(url));
			} catch (err) {
				return false;
			}
		}
	},
	url: url => {
		switch (true) {
		case rewrites.isUrl(url) == true:
			url = config.httpprefix + b64URL.encode(url);

			break;
		case rewrites.isUrl(url) == false:
			var split;
		
			// TODO: Handle ./
			switch (true) {
			case url.split(':').length>=2:
				break;
			case url.split('../').length=2:
				var split = url.split('../');
				url = config.httpprefix + b64URL.encode(config.proxyurl.href.split('/').splice(0, len(split)).join('/')+split.pop());

				break;
			case url.startsWith('//'):
				url = config.httpprefix + b64URL.encode(config.proxyurl.protocol + url.split('/').pop());

				break;
			case url.startsWith('/'):
				url = config.httpprefix + b64URL.encode(config.proxyurl.origin + url);
				
				break;
			default:
				var split = config.proxyurl.href.split('.');
				url = config.httpprefix + b64URL.encode(split.slice(0, -len(split)+1).join('') + '/' + url);
			}
		}

		return url;
	},
	cookie: cookie => {
		cookie = cookie.split("; ").forEach(exp => {
			map = exp.split("=")

			if (map.length === 2) {
				switch (map[0]) {
				case "domain":
					map[1] = config.proxyurl.origin

					break;
				case "path":
					map[1] = config.proxyurl.path

					break;
				}

				map.join("=")
			}
		}).join("; ")
	},
	html: html => {
		var dom = new DOMParser().parseFromString(html, 'text/html'), sel = dom.querySelector('*');

		sel.querySelectorAll('*').forEach(node => {
			switch(node.tagName) {
			case 'STYLE':
				node.textContent = rewrites.css(node.textContent);

				break;
			case 'SCRIPT':
				node.textContent =  rewrites.js(node.textContent);

				break;
			}

			node.getAttributeNames().forEach(attr => {
				switch (true) {
				case attr == "href" || attr == "src" || attr == "poster" || attr == "data":
					node.setAttribute(rewrites.url(node.getAttribute(attr)));

					break;
				// case attr == 'srcset':
				case attr == 'srcdoc':
					node.setAttribute(rewrites.html(node.getAttribute(attr)));

					break;
				case attr == 'style':
					node.setAttribute(rewrites.css(node.getAttribute(attr)));

					break;
				case attr.startsWith('on'):
					node.setAttribute(rewrites.js(node.getAttribute(js)));

					break;
				}
			});
		});

		return sel.innerHTML
	},
	css: css => css.replace(/(?<=url\((?<a>["']?)).*?(?=\k<a>\))/gi, rewrites.url),
	js: js => "{let document=audocument;" + js + "}"
};

audocument = new Proxy(document, {
	get: (target, prop) => {
		switch (prop) {
		case 'location':
			return config.proxyurl;
		case 'referer' || 'URL':
			return rewrites.url(target[prop])
		default:
			Reflect.get(target, prop);
		}

		return typeof(prop=Reflect.get(target,prop))=='function'?prop.bind(target):prop;
	}
});

document.write = new Proxy(document.write, {
	apply: (target, thisArg, args) => {
        html = rewrites.html(args[0]);

		return Reflect.apply(target, thisArg, args);
    }
});

const historyHandler = {
	apply: (target, thisArg, args) => {
		args[2] = rewrites.url(args[2]);

		return Reflect.apply(target, thisArg, args);
	}
};

window.History.prototype.pushState = new Proxy(window.History.prototype.pushState, historyHandler);
window.History.prototype.replaceState = new Proxy(window.History.prototype.replaceState, historyHandler);

window.open = new Proxy(window.open, {
    apply: (target, thisArg, args) => {
		args[0] = rewrites.url(args[0]);

		return Reflect.apply(target, thisArg, args);
    }
});

window.fetch = new Proxy(window.fetch, {
	apply: (target, thisArg, args) => {
		args[0] = rewrites.url(args[0]);

		return Reflect.apply(target, thisArg, args);
    }
});

window.XMLHttpRequest.prototype.open = new Proxy(window.XMLHttpRequest.prototype.open, {
	apply: (target, thisArg, args) => {
		args[1] = rewrites.url(args[1]);

		return Reflect.apply(target, thisArg, args);
    }
});

window.Navigator.prototype.sendBeacon = new Proxy(window.Navigator.prototype.sendBeacon, {
    apply: (target, thisArg, args) => {
		args[0] = rewrites.url(args[0]);
		
		return Reflect.apply(target, thisArg, args);
    }
});

/*
window.Websocket = new Proxy(window.Websocket, {
    construct: (target, args) => {
		// TODO: rewrite
		Reflect.construct(target, args)
    }
});
*/

// Delete non-proxified objects so requests don't escape the proxy

// WebSocket
delete window.WebSocket;

// WebRTC
delete window.MediaStreamTrack; 
delete window.RTCPeerConnection;
delete window.RTCSessionDescription;
delete window.mozMediaStreamTrack;
delete window.mozRTCPeerConnection;
delete window.mozRTCSessionDescription;
delete window.navigator.getUserMedia;
delete window.navigator.mozGetUserMedia;
delete window.navigator.webkitGetUserMedia;
delete window.webkitMediaStreamTrack;
delete window.webkitRTCPeerConnection;
delete window.webkitRTCSessionDescription;