require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

const app = express();
const port = 3001;

try {
  // Semua kode setup dan route Anda di sini
  
  app.use(cors());
  app.use(express.json());
  app.use(express.static('public'));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 requests per windowMs
    message: 'Too many requests from this IP, please try again after a minute'
  });

  app.use('/chat', apiLimiter);

  // Add this near the top of your routes
  app.get('/api-test', (req, res) => {
    res.json({ message: 'API is working' });
  });

  // Tambahkan route debug
  app.get('/debug', (req, res) => {
    res.json({
      env: process.env.NODE_ENV,
      stability_api_key: !!process.env.STABILITY_API_KEY,
      // Jangan tampilkan API key yang sebenarnya!
    });
  });

  // Tambahkan ini di bagian atas route Anda
  app.get('/', (req, res) => {
    res.send('Welcome to the Stability AI Web App');
  });

  app.post('/generate-image', async (req, res) => {
    const { prompt, negativePrompt, imageCount, imageSize } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }
    
    if (typeof imageCount !== 'number' || imageCount < 1 || imageCount > 4) {
      return res.status(400).json({ message: 'Invalid image count' });
    }
    
    const validSizes = ['1024x1024', '1152x896', '1216x832', '1344x768', '1536x640', '640x1536', '768x1344', '832x1216', '896x1152'];
    if (!validSizes.includes(imageSize)) {
      return res.status(400).json({ message: 'Invalid image size' });
    }
    
    console.log('Received request:', { prompt, negativePrompt, imageCount, imageSize });

    try {
      const [width, height] = imageSize.split('x').map(Number);
      const response = await axios.post(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          text_prompts: [
            { text: prompt, weight: 1 },
            { text: negativePrompt, weight: -1 }
          ].filter(p => p.text),
          cfg_scale: 7,
          width,
          height,
          samples: imageCount,
          steps: 30,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          },
        }
      );

      console.log('API response:', response.data);

      if (!response.data.artifacts || !Array.isArray(response.data.artifacts)) {
        throw new Error('Invalid response from Stability AI API');
      }

      res.json(response.data);
    } catch (error) {
      console.error('Error:', error.response ? error.response.data : error.message);
      res.status(error.response ? error.response.status : 500).json({ 
        message: error.response ? error.response.data.message : 'An error occurred while generating the image(s)'
      });
    }
  });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  app.post('/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: message }
        ],
      });

      console.log('OpenAI API Response:', completion.choices[0]);

      if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
        throw new Error('Invalid response from OpenAI API');
      }

      res.json({ reply: completion.choices[0].message.content });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ 
        message: 'An error occurred while processing the chat message',
        error: error.message
      });
    }
  });

} catch (error) {
  console.error('Uncaught error:', error);
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  });
}

module.exports = app;

// Comment out or remove the following lines:
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
//   console.log('Stability API Key loaded:', !!process.env.STABILITY_API_KEY);
//   console.log('OpenAI API Key loaded:', !!process.env.OPENAI_API_KEY);
// });