
const https = require('https');
const encryptionService = require('./encryptionService');
const credentialService = require('./credentialService');
const crypto = require('crypto');
const zlib = require('zlib');

class ProxyService {
  constructor() {
    this.decoyEnabled = process.env.DECOY_REQUESTS_ENABLED === 'true';
    this.decoyInterval = null;
    if (this.decoyEnabled) {
      this.startDecoyRequests();
    }
  }

  startDecoyRequests() {
    // Make decoy requests at random intervals between 3-7 seconds
    const getRandomInterval = () => Math.floor(Math.random() * 4000) + 3000;
    
    const scheduleNext = () => {
      const nextInterval = getRandomInterval();
      setTimeout(() => {
        if (Math.random() < 0.2) {
          this.sendDecoyRequest();
        }
        scheduleNext();
      }, nextInterval);
    };
    
    scheduleNext();
  }

  async makeRequest(options, data = null) {
    console.log('Making request to:', options.hostname + options.path);
    
    const requestId = this.generateRequestId();
    const timestamp = Date.now();
    
    const hasQuery = options.path.includes('?');
    const separator = hasQuery ? '&' : '?';
    const randomParams = this.generateRandomQueryParams();
    const path = `${options.path}${separator}${randomParams}`;
    
    const proxyOptions = {
      ...options,
      path,
      headers: this.obfuscateHeaders({
        ...options.headers,
        'User-Agent': this.generateRandomUserAgent(),
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'X-Request-ID': requestId,
        'X-Client-Time': timestamp,
        'X-Client-Version': '1.0.0',
        'X-Session-ID': crypto.randomBytes(16).toString('hex'),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      })
    };

    try {
      await this.randomDelay();

      return new Promise((resolve, reject) => {
        const req = https.request(proxyOptions, (res) => {
          const chunks = [];
          let buffer = Buffer.from([]);

          // Handle different encodings
          const encoding = res.headers['content-encoding'];
          let stream = res;

          if (encoding === 'gzip') {
            stream = res.pipe(zlib.createGunzip());
          } else if (encoding === 'deflate') {
            stream = res.pipe(zlib.createInflate());
          } else if (encoding === 'br') {
            stream = res.pipe(zlib.createBrotliDecompress());
          }

          stream.on('data', (chunk) => {
            chunks.push(chunk);
          });

          stream.on('end', () => {
            try {
              buffer = Buffer.concat(chunks);
              const responseText = buffer.toString('utf8');
              
              if (responseText) {
                try {
                  // First try to parse as JSON
                  const parsedResponse = JSON.parse(responseText);
                  
                  if (options.hostname.includes('api.openai.com')) {
                    // For OpenAI, encrypt the response before sending
                    const encryptedResponse = encryptionService.encrypt(JSON.stringify(parsedResponse));
                    resolve(encryptedResponse);
                  } else {
                    // For other APIs, return parsed JSON directly
                    resolve(parsedResponse);
                  }
                } catch (parseError) {
                  // If not JSON, return raw response
                  resolve(responseText);
                }
              } else {
                resolve(null);
              }
            } catch (error) {
              console.error('Error processing response:', error);
              reject(error);
            }
          });

          stream.on('error', (error) => {
            console.error('Stream error:', error);
            reject(error);
          });
        });

        req.on('error', (error) => {
          console.error('Request error:', error);
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        if (data) {
          try {
            if (options.hostname.includes('api.openai.com')) {
              // For OpenAI, encrypt request data
              const encryptedData = encryptionService.encrypt(
                typeof data === 'string' ? data : JSON.stringify(data)
              );
              req.write(Buffer.from(JSON.stringify(encryptedData)));
            } else {
              // For other APIs, send data directly
              req.write(typeof data === 'string' ? data : JSON.stringify(data));
            }
          } catch (error) {
            console.error('Error processing request data:', error);
            reject(error);
          }
        }
        
        req.end();
      });
    } catch (error) {
      console.error('Request failed:', error);
      throw error;
    }
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * 50);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  generateRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  async sendDecoyRequest() {
    const decoyRoutes = [
      'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
      'https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js',
      'https://api.github.com/meta',
      'https://api.cdnjs.com/libraries',
      'https://unpkg.com/react@18/umd/react.production.min.js'
    ];
    
    const randomRoute = decoyRoutes[Math.floor(Math.random() * decoyRoutes.length)];
    
    try {
      await this.makeRequest({
        hostname: new URL(randomRoute).hostname,
        path: new URL(randomRoute).pathname,
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      });
    } catch (error) {
      console.debug('Decoy request failed:', error.message);
    }
  }

  generateRequestId() {
    return `req_${crypto.randomBytes(16).toString('hex')}`;
  }

  cleanup() {
    if (this.decoyInterval) {
      clearInterval(this.decoyInterval);
    }
  }

  generateRandomPath() {
    const paths = [
      '/assets/js/main.min.js',
      '/static/css/app.css',
      '/api/v1/data',
      '/cdn/resources/bundle.js',
      '/media/content/stream'
    ];
    return paths[Math.floor(Math.random() * paths.length)];
  }

  generateRandomQueryParams() {
    const params = new URLSearchParams();
    params.append('t', Date.now());
    params.append('v', Math.random().toString(36).substring(7));
    params.append('r', crypto.randomBytes(4).toString('hex'));
    return params.toString();
  }

  obfuscateHeaders(headers) {
    const commonHeaders = {
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      ...this.generateTimingHeaders(),
      ...this.generateCacheHeaders()
    };

    return {
      ...headers,
      ...commonHeaders,
      'Referer': 'https://app.local' + this.generateRandomPath(),
      'Origin': 'https://app.local'
    };
  }

  generateTimingHeaders() {
    // Add realistic browser timing headers
    const now = Date.now();
    const navStart = now - Math.floor(Math.random() * 1000);
    
    return {
      'Server-Timing': `cdn;dur=${Math.floor(Math.random() * 100)}, cache;dur=${Math.floor(Math.random() * 50)}`,
      'Timing-Allow-Origin': '*'
    };
  }

  generateCacheHeaders() {
    // Add realistic cache headers
    const maxAge = Math.floor(Math.random() * 3600);
    return {
      'Cache-Control': `public, max-age=${maxAge}, must-revalidate`,
      'ETag': `"${crypto.randomBytes(8).toString('hex')}"`,
      'Last-Modified': new Date(Date.now() - Math.floor(Math.random() * 86400000)).toUTCString()
    };
  }
}

module.exports = new ProxyService(); 