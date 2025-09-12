require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// LangChain imports
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { ChatPromptTemplate } = require('@langchain/core/prompts');

const app = express();

// ✅ Allow all origins for CORS
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Initialize LangChain ChatOpenAI
const llm = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4o-mini',
  streaming: true,
  temperature: 0.3,
});

const outputParser = new StringOutputParser();

const SYSTEM_PROMPT = `You are a highly professional home inspection consultant ...`;

// Create image analysis prompt template
const imageAnalysisPrompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_PROMPT],
  ["human", "Analyze these home inspection photos grouped by category: {imageAnalysisText}"]
]);

// Create chat prompt template
const chatPrompt = ChatPromptTemplate.fromMessages([
  ["system", "{systemPrompt}"],
  ["system", "Context from previous analysis: {context}"],
  ["placeholder", "{conversationHistory}"],
  ["human", "{message}"]
]);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Helper function
function createImageContent(base64Data, category, index) {
  return {
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${base64Data}`
    }
  };
}

// ---------- ROUTES ----------
app.post('/api/analyze', upload.array('photo'), async (req, res) => {
  try {
    const categories = JSON.parse(req.body.categories || '[]');
    const images = req.files.map((file, index) => ({
      category: categories[index] || 'Unknown',
      path: file.path,
    }));

    const imageContents = [];
    const imageDescriptions = [];
    
    images.forEach((img, index) => {
      const base64Data = fs.readFileSync(img.path, 'base64');
      imageContents.push(createImageContent(base64Data, img.category, index));
      imageDescriptions.push(`${img.category} Photo ${index + 1}`);
    });

    const imageAnalysisText = imageDescriptions.join(', ') + '\n\n[Images provided for analysis]';

    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          { type: "text", text: `Analyze these home inspection photos grouped by category: ${imageAnalysisText}` },
          ...imageContents
        ]
      })
    ];

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await llm.stream(messages);
    
    for await (const chunk of stream) {
      res.write(chunk.content || '');
    }
    
    res.end();

    images.forEach(img => {
      try { fs.unlinkSync(img.path); } catch (err) { console.error('Error cleaning up file:', err); }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).send('Analysis failed: ' + error.message);
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt, context, conversationHistory } = req.body;
    
    const historyMessages = [];
    if (Array.isArray(conversationHistory)) {
      conversationHistory.forEach(msg => {
        const content = (msg.content || '').toString();
        if (content.trim()) {
          if (msg.role === 'user') historyMessages.push(new HumanMessage(content));
          else if (msg.role === 'assistant') historyMessages.push(new AIMessage(content));
        }
      });
    }

    const chain = chatPrompt.pipe(llm).pipe(outputParser);

    const chainInput = {
      systemPrompt: (systemPrompt || SYSTEM_PROMPT || '').toString(),
      context: (context || '').toString(),
      conversationHistory: historyMessages,
      message: (message || '').toString()
    };

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await chain.stream(chainInput);
    
    for await (const chunk of stream) {
      res.write(chunk || '');
    }
    
    res.end();

  } catch (error) {
    console.error('Chat error:', error);
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    res.status(500).send('Chat failed: ' + errorMessage);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', langchain: 'enabled' });
});

// ✅ IMPORTANT for Vercel: Export handler properly
module.exports = app;
