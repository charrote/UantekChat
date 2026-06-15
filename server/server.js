import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.post('/api/chat', async (req, res) => {
  const { apiKey, messages } = req.body;

  const usedApiKey = apiKey && apiKey.trim() ? apiKey : config.defaultAPIKey;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (usedApiKey) {
      headers['Authorization'] = `Bearer ${usedApiKey}`;
    }

    const systemPromptToUse = req.body.systemPrompt || config.systemPrompt;
    const systemMessage = systemPromptToUse
      ? { role: 'system', content: systemPromptToUse }
      : null;
    const fullMessages = systemMessage
      ? [systemMessage, ...messages]
      : messages;

    const response = await fetch(`${config.lmStudio.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.selectedModel || config.lmStudio.model,
        messages: fullMessages,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }

    pump();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    title: config.title,
    model: config.lmStudio.model,
    selectedModel: config.selectedModel,
    bookStack: config.bookStack || { host: 'localhost', port: 6875 }
  });
});



app.all('/api/bookstack/proxy', async (req, res) => {
  const { baseUrl, token, path: apiPath } = req.method === 'GET' ? req.query : req.body
  if (!baseUrl || !apiPath) {
    return res.status(400).json({ error: 'Missing baseUrl or path' })
  }
  try {
    const rewrittenUrl = String(baseUrl).replace(/\/+$/, '').replace(/^http:\/\/(localhost|127\.0\.0\.1)/, 'http://host.docker.internal')
    const url = `${rewrittenUrl}/${String(apiPath).replace(/^\//, '')}`
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Token ${token}`
    const fetchOptions = { method: req.method, headers }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body.body || {})
    }
    const response = await fetch(url, fetchOptions)
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json()
      res.status(response.status).json(data)
    } else {
      const text = await response.text()
      res.status(response.status).send(text)
    }
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Proxy BookStack HTML content for iframe
app.all('/api/bookstack/content*', async (req, res) => {
  const path = req.url.replace('/api/bookstack/content', '')
  const bs = config.bookStack || { host: 'localhost', port: 6875 }
  const baseUrl = `http://${bs.host}:${bs.port}`
  const rewrittenUrl = String(baseUrl).replace(/\/+$/, '').replace(/^http:\/\/(localhost|127\.0\.0\.1)/, 'http://host.docker.internal')
  const url = `${rewrittenUrl}${path}`
  try {
    const headers = { ...req.headers, host: new URL(url).host }
    delete headers['transfer-encoding']
    const response = await fetch(url, { method: req.method, headers })
    const contentType = response.headers.get('content-type') || ''
    res.status(response.status)
    if (contentType.includes('text/html')) {
      let html = await response.text()
      html = html.replace(/(href|src|action)=(["'])\//g, `$1=$2/api/bookstack/content/`)
      res.setHeader('content-type', contentType)
      res.send(html)
    } else {
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value)
        }
      })
      const buffer = await response.arrayBuffer()
      res.send(Buffer.from(buffer))
    }
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// RAG proxy routes
app.post('/api/rag/chat', async (req, res) => {
  try {
    const response = await fetch(`${config.rag.baseUrl}/rag/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!response.ok) throw new Error(`RAG service error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/rag/query', async (req, res) => {
  try {
    const response = await fetch(`${config.rag.baseUrl}/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!response.ok) throw new Error(`RAG service error: ${response.status}`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
    pump();
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/rag/status', async (req, res) => {
  try {
    const response = await fetch(`${config.rag.baseUrl}/health`);
    const healthy = response.ok;
    res.json({
      available: healthy,
      docCount: 0,
      lastSync: null
    });
  } catch (error) {
    res.json({ available: false, docCount: 0, lastSync: null, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Model: ${config.lmStudio.model}`);
});
