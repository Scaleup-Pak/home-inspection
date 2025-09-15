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

const SYSTEM_PROMPT = `You are a highly professional home inspection consultant evaluating properties. You specialize in analyzing property-related images and providing focused inspection reports.

RESPONSE GUIDELINES:
- If images show clear property inspection content (structural elements, HVAC, electrical, plumbing, exterior/interior issues), provide a **detailed professional analysis**.
- If images are NOT related to home inspection (people, vehicles, random objects, landscapes, etc.), respond with a **very short and strict message**:
  "I specialize in home inspection analysis. The uploaded image doesn't appear to show property inspection content. Please upload images of structural elements, systems, or areas you'd like me to inspect."
- Do NOT provide long explanations or reports for unrelated images.
- Keep reports proportional to the inspection findings. Only expand when actual property issues are detected.

Key capabilities for PROPERTY INSPECTION images:
- Structural integrity assessment
- Safety hazard identification
- Maintenance recommendations with priority levels
- Building code compliance evaluation
- Budget estimates for repairs
- Professional terminology explanation

IMPORTANT CONSTRAINTS:
- Absolutely avoid generating long or detailed responses for non-inspection images.
- Always reference specific visible issues in your analysis when inspection-related.
- Maintain a professional, authoritative tone while being concise.`;
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

// Helper function to convert base64 image to LangChain format
function createImageContent(base64Data, category, index) {
  return {
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${base64Data}`
    }
  };
}

app.post('/api/analyze', upload.array('photo'), async (req, res) => {
  try {
    const categories = JSON.parse(req.body.categories || '[]');
    const images = req.files.map((file, index) => ({
      category: categories[index] || 'Unknown',
      path: file.path,
    }));

    // Convert images to base64
    const imageContents = [];
    const imageDescriptions = [];
    
    images.forEach((img, index) => {
      const base64Data = fs.readFileSync(img.path, 'base64');
      imageContents.push(createImageContent(base64Data, img.category, index));
      imageDescriptions.push(`${img.category} Photo ${index + 1}`);
    });

    // Create the analysis text with image descriptions
    const imageAnalysisText = imageDescriptions.join(', ') + '\n\n[Images provided for analysis]';

    // Create messages array with images
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          { type: "text", text: `Analyze these home inspection photos grouped by category: ${imageAnalysisText}` },
          ...imageContents
        ]
      })
    ];

    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Stream the response using LangChain
    const stream = await llm.stream(messages);
    
    for await (const chunk of stream) {
      res.write(chunk.content || '');
    }
    
    res.end();

    // Clean up uploaded files
    images.forEach(img => {
      try {
        fs.unlinkSync(img.path);
      } catch (err) {
        console.error('Error cleaning up file:', err);
      }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).send('Analysis failed: ' + error.message);
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt, context, conversationHistory } = req.body;
    
    console.log('Received chat request:', {
      message: message?.substring(0, 50) + (message?.length > 50 ? '...' : ''),
      systemPrompt: systemPrompt?.substring(0, 50) + (systemPrompt?.length > 50 ? '...' : ''),
      context: context?.substring(0, 50) + (context?.length > 50 ? '...' : ''),
      conversationHistoryLength: (conversationHistory || []).length,
    });

    // Convert conversation history to LangChain message format
    const historyMessages = [];
    if (Array.isArray(conversationHistory)) {
      conversationHistory.forEach(msg => {
        const content = (msg.content || '').toString();
        if (content.trim()) {
          if (msg.role === 'user') {
            historyMessages.push(new HumanMessage(content));
          } else if (msg.role === 'assistant') {
            historyMessages.push(new AIMessage(content));
          }
        }
      });
    }

    // Create the chain
    const chain = chatPrompt.pipe(llm).pipe(outputParser);

    // Prepare the input
    const chainInput = {
      systemPrompt: (systemPrompt || SYSTEM_PROMPT || '').toString(),
      context: (context || '').toString(),
      conversationHistory: historyMessages,
      message: (message || '').toString()
    };

    console.log('LangChain input prepared:', {
      systemPromptLength: chainInput.systemPrompt.length,
      contextLength: chainInput.context.length,
      historyLength: chainInput.conversationHistory.length,
      messageLength: chainInput.message.length
    });

    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Stream the response using LangChain
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', langchain: 'enabled' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
