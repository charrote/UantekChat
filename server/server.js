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

// Web Search endpoints
app.get('/api/web/status', (req, res) => {
  const tavilyApiKey = config.webSearch?.tavilyApiKey || '';
  res.json({
    available: !!tavilyApiKey,
    enabled: config.webSearch?.enabled !== false
  });
});

app.post('/api/web/query', async (req, res) => {
  const { query, messages, searchWeb, searchRag, top_k = 5 } = req.body;

  if (!query && (!messages || messages.length === 0)) {
    return res.status(400).json({ error: 'Missing query or messages' });
  }

  const tavilyApiKey = config.webSearch?.tavilyApiKey || '';
  const userQuery = query || (messages && messages.length > 0 ? messages[messages.length - 1].content : '');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let combinedSources = [];
  let ragContent = '';

  try {
    // 1. Web search via Tavily
    if (searchWeb && tavilyApiKey) {
      const tavilyResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: userQuery,
          search_depth: 'basic',
          include_answer: false,
          max_results: top_k
        })
      });

      if (tavilyResponse.ok) {
        const tavilyData = await tavilyResponse.json();
        const webSources = (tavilyData.results || []).map(r => ({
          title: r.title || '网络来源',
          url: r.url || '',
          score: r.score || 0.5,
          type: 'web'
        }));
        combinedSources.push(...webSources);
        ragContent += webSources.map(r =>
          `[网络资料] ${r.title} (${r.url}):\n${r.content || ''}`
        ).join('\n\n');
      }
    }

    // 2. RAG search
    if (searchRag && config.rag?.enabled !== false) {
      try {
        const ragResponse = await fetch(`${config.rag.baseUrl}/rag/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: userQuery, top_k, stream: false })
        });

        if (ragResponse.ok) {
          const ragData = await ragResponse.json();
          const ragSources = (ragData.sources || []).map(s => ({
            title: s.title || s.source || '知识库来源',
            url: s.url || '',
            score: s.score || 0.5,
            type: 'rag'
          }));
          combinedSources.push(...ragSources);
          if (ragData.content) {
            ragContent += `\n\n[知识库资料]\n${ragData.content}`;
          }
        }
      } catch (e) {
        // RAG unavailable, continue without it
      }
    }

    // 3. Send sources event
    if (combinedSources.length > 0) {
      res.write(`event: sources\ndata: ${JSON.stringify(combinedSources)}\n\n`);
    }

    // 4. Generate response with LM Studio
    const systemContext = combinedSources.length > 0
      ? `以下是与用户问题相关的参考资料，请基于这些资料回答用户问题。如果资料不足以回答问题，请如实说明。

回答格式要求：
- 使用清晰的段落结构，段落之间用空行分隔
- 适当使用标题（#、##）、列表（-、1.）等 Markdown 格式组织内容，便于阅读
- 请勿将 Markdown 标记字符（如 #、*、--- 等）作为纯文本输出——这些符号仅用于格式标记，不应以原文形式出现在正文中
- 多个要点请分条展示
- 引用来源时请注明出处

参考资料：
${ragContent}`
      : '';

    const systemPrompt = systemContext
      ? `${config.systemPrompt || ''}\n\n${systemContext}`
      : config.systemPrompt || '';

    const systemMessage = systemPrompt ? { role: 'system', content: systemPrompt } : null;
    const fullMessages = systemMessage
      ? [systemMessage, ...(messages || [{ role: 'user', content: userQuery }])]
      : (messages || [{ role: 'user', content: userQuery }]);

    const usedApiKey = config.defaultAPIKey || '';
    const lmResponse = await fetch(`${config.lmStudio.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(usedApiKey ? { 'Authorization': `Bearer ${usedApiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.selectedModel || config.lmStudio.model,
        messages: fullMessages,
        stream: true
      })
    });

    if (!lmResponse.ok) {
      const errorText = await lmResponse.text().catch(() => 'Unknown error');
      res.write(`event: token\ndata: [联网搜索错误: ${lmResponse.status} ${errorText}]\n\n`);
      res.end();
      return;
    }

    const reader = lmResponse.body.getReader();
    const decoder = new TextDecoder();

    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  res.write(`event: token\ndata: ${content}\n\n`);
                }
              } catch { /* skip parse errors */ }
            }
          }
        }
      } catch (error) {
        res.end();
      }
    }

    pump();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`event: token\ndata: [联网搜索错误: ${error.message}]\n\n`);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Model: ${config.lmStudio.model}`);
});
