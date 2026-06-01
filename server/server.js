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
app.use(express.json());

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
    selectedModel: config.selectedModel
  });
});

app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${config.lmStudio.baseUrl}/models`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config', (req, res) => {
  const { selectedModel } = req.body;
  if (selectedModel) {
    config.selectedModel = selectedModel;
    import('fs').then(fs => {
      fs.writeFileSync(join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
    });
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Model: ${config.lmStudio.model}`);
});
