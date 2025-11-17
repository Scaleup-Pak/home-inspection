# Home Inspection App Backend

AI-powered home inspection analysis with image processing capabilities.

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your OpenAI API key:

   ```
   OPENAI_API_KEY=your_actual_api_key_here
   ```

3. **Start the server:**

   ```bash
   node server.js
   ```

4. **Access the LLM Configuration UI:**
   Open: http://localhost:5000/llm-config-ui

## Features

- **Image Analysis**: AI-powered home inspection from photos
- **LLM Configuration**: Web UI to manage AI model settings
- **Vision Testing**: Validates model compatibility before saving
- **Streaming Support**: Real-time responses with organization verification
- **Multiple Models**: Support for GPT-4o, GPT-4 Turbo, and more

## API Endpoints

- `POST /api/analyze` - Analyze home inspection images
- `POST /api/chat` - Chat with conversation history
- `GET /api/llm-config` - Get current LLM configuration
- `PUT /api/llm-config` - Update LLM configuration
- `POST /api/llm-config/test` - Test configuration with vision capability
- `GET /health` - Health check

## Security

- API keys are stored in `.env` (never committed)
- Configuration persisted to `llm-config.json` (without API keys)
  
## Restoring `llm-config.json`

If `llm-config.json` was accidentally deleted, recreate it at the project root with the following default values (do not add your OpenAI API key here - see notes):

```json
{
   "modelName": "gpt-4o-mini",
   "streaming": true,
   "temperature": 0.3,
   "topP": 1.0,
   "systemPrompt": "Your system prompt text...",
   "chatPrompt": null
}
```

The server will default the `systemPrompt` to the built-in professional home-inspection prompt if you omit it. Always keep `llm-config.json` listed in `.gitignore` to avoid pushing secrets.
- GitHub push protection prevents accidental key exposure
