
/*!
 * Connect - logger
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

/**
 * Log buffer.
 */

var buf = [];

/**
 * Default log buffer duration.
 */

var defaultBufferDuration = 1000;

/**
 * Log requests with the given `options` or a `format` string.
 *
 * Options:
 *
 *   - `format`  Format string, see below for tokens
 *   - `stream`  Output stream, defaults to _stdout_
 *   - `buffer`  Buffer duration, defaults to 1000ms when _true_
 *
 * Tokens:
 *
 *   - `:req[header]` ex: `:req[Accept]`
 *   - `:res[header]` ex: `:res[Content-Length]`
 *   - `:http-version`
 *   - `:response-time`
 *   - `:remote-addr`
 *   - `:date`
 *   - `:method`
 *   - `:url`
 *   - `:referrer`
 *   - `:user-agent`
 *   - `:status`
 *
 * @param {String|Function|Object} format or options
 * @return {Function}
 * @api public
 */

module.exports = function logger(options) {
  if ('object' == typeof options) {
    options = options || {};
  } else if (options) {
    options = { format: options };
  } else {
    options = {};
  }

  var fmt = options.format
    , stream = options.stream || process.stdout
    , buffer = options.buffer;

  // buffering support
  if (buffer) {
    var realStream = stream
      , interval = 'number' == typeof buffer
        ? buffer
        : defaultBufferDuration;

    // flush interval
    setInterval(function(){
      if (buf.length) {
        realStream.write(buf.join(''), 'ascii');
        buf.length = 0;
      }
    }, interval); 

    // swap the stream
    stream = {
      write: function(str){
        buf.push(str);
      }
    };
  }

  return function logger(req, res, next) {
    var start = +new Date
      , statusCode
      , writeHead = res.writeHead
      , end = res.end
      , url = req.originalUrl;

    // mount safety
    if (req._logging) return next();

    // flag as logging
    req._logging = true;

    // proxy for statusCode.
    res.writeHead = function(code, headers){
      res.writeHead = writeHead;
      res.writeHead(code, headers);
      res.__statusCode = statusCode = code;
      res.__headers = headers || {};
    };

    // proxy end to output a line to the provided logger.
    if (fmt) {
      res.end = function(chunk, encoding) {
        res.end = end;
        res.end(chunk, encoding);
        res.responseTime = +new Date - start;
        if ('function' == typeof fmt) {
          var line = fmt(req, res, function(str){ return format(str, req, res); });
          if (line) stream.write(line + '\n', 'ascii');
        } else {
          stream.write(format(fmt, req, res) + '\n', 'ascii');
        }
      };
    } else {
      res.end = function(chunk, encoding) {
        var contentLength = (res._headers && res._headers['content-length'])
          || (res.__headers && res.__headers['Content-Length'])
          || '-';

        res.end = end;
        res.end(chunk, encoding);

        stream.write((req.socket && (req.socket.remoteAddress || (req.socket.socket && req.socket.socket.remoteAddress)))
           + ' - - [' + (new Date).toUTCString() + ']'
           + ' "' + req.method + ' ' + url
           + ' HTTP/' + req.httpVersionMajor + '.' + req.httpVersionMinor + '" '
           + (statusCode || res.statusCode) + ' ' + contentLength
           + ' "' + (req.headers['referer'] || req.headers['referrer'] || '')
           + '" "' + (req.headers['user-agent'] || '') + '"\n', 'ascii');
      };
    }

    next();
  };
};

/**
 * Return formatted log line.
 *
 * @param  {String} str
 * @param  {IncomingMessage} req
 * @param  {ServerResponse} res
 * @return {String}
 * @api private
 */
 
function format(str, req, res) {
  var tokens = tokenize(str);
  str = "";
  tokens.forEach(function (token) {
    var c = token.charAt(0);
    if (c && c == ':') {
        str += formatConnectStyle(token, req, res);
    } else if (c && c == '%') {
        str += formatApacheStyle(token, req, res);
    }
  });
  return str;
}

function formatToken(token, req, res) {
    return format
}

function formatConnectStyle(token, req, res) {
  return token
    .replace(':url', req.originalUrl)
    .replace(':method', req.method)
    .replace(':status', formatStatusCode(res))
    .replace(':response-time', res.responseTime)
    .replace(':date', new Date().toUTCString())
    .replace(':referrer', formatReferer(req))
    .replace(':http-version', formatHttpVersion(req))
    .replace(':remote-addr', formatRemoteHost(req))
    .replace(':user-agent', req.headers['user-agent'] || '')
    .replace(/:req\[([^\]]+)\]/g, function(_, field){ return req.headers[field.toLowerCase()]; })
    .replace(/:res\[([^\]]+)\]/g, function(_, field){
      return res._headers
        ? (res._headers[field.toLowerCase()] || res.__headers[field])
        : (res.__headers && res.__headers[field]);
    });
}

function formatApacheStyle(token, req, res) {
  return token
    // common log format
    .replace('%h', checkUndef(formatRemoteHost(req)))
    .replace('%l', '-') //we don't try to resolve this
    .replace('%u', checkUndef(formatUserName(req)))
    .replace('%t', checkUndef(formatDate(new Date())))
    .replace('%r', checkUndef(req.method) + " " + checkUndef(req.originalUrl) + " HTTP/" + checkUndef(formatHttpVersion(req)))
    .replace('%>s', checkUndef(formatStatusCode(res)))
    .replace('%b', checkUndef(res.headers['content-length']))
    // combined log format
    .replace('%{Referer}i', checkUndef(formatReferer(req)))
    .replace('%{User-agent}i', checkUndef(req.headers['user-agent']));
}

function formatDate(date) {
    return date.toString("[dd/MMM/yyyy:hh:mm:ss ") + date.getTimezoneOffset() + "]";
}

function formatHttpVersion(req) {
    return req.httpVersionMajor && req.httpVersionMinor && (req.httpVersionMajor + '.' + req.httpVersionMinor);
}

function formatRemoteHost(req) {
    return req.socket && (req.socket.remoteAddress || (req.socket.socket && req.socket.socket.remoteAddress));
}

function formatStatusCode(res) {
    return res.__statusCode || res.statusCode;
}

function formatReferer(req) {
    return req.headers['referer'] || req.headers['referrer'];
}

// achtung: nkserver specific
function formatUserName(req) {
    if (req.getUser) {
        var user = req.getUser();
        return user && user.login;
    }
    return undefined;
}

function checkUndef(obj) {
    return obj || "-";
}

function tokenize(str) {
    var res = new Array();
    var start = 0;

    while (true) {
        var end1 = str.indexOf(':', start + 1);
        var end2 = str.indexOf('%', start + 1);
        var end = (-1 == end1) ? end2 : ((-1 == end2) ? end1 : Math.min(end1, end2));
        res.push(str.substr(start, ((-1 == end) ? str.length : end) - start));
        if (-1 == end || str.length - 1 == end) return res;
        start = end;
    }
}
