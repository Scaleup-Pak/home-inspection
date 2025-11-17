# LLM Configuration UI - Client

This folder contains the client-side web interface for managing LLM configuration settings.

## Files

- `index.html` - Main HTML page
- `styles.css` - Styling and responsive design
- `app.js` - JavaScript logic for API communication

## Quick Start

### Option 1: Open Directly in Browser

1. Make sure your server is running:

   ```bash
   node server.js
   ```

2. Open `index.html` in your web browser (double-click or right-click → Open With → Browser)

### Option 2: Serve from Express Server

Add this to your `server.js`:

```javascript
// Serve static files from client folder
app.use("/config-ui", express.static(path.join(__dirname, "client")));
```

Then access at: `http://localhost:5000/config-ui`

### Option 3: Use a Simple HTTP Server

```bash
# In the client folder
cd client

# Using Python
python3 -m http.server 8080

# Using Node.js (install globally: npm install -g http-server)
http-server -p 8080

# Using PHP
php -S localhost:8080
```

Then open: `http://localhost:8080`

## Features

✅ **View Current Configuration** - Loads and displays all LLM settings
✅ **Update Settings** - Modify model, temperature, streaming, and system prompt
✅ **Real-time Validation** - Validates inputs before saving
✅ **Error Handling** - Clear error messages for failed operations
✅ **Loading States** - Visual feedback during API calls
✅ **Responsive Design** - Works on desktop, tablet, and mobile
✅ **Keyboard Shortcuts** - Press Ctrl/Cmd + S to save

## Configuration Fields

- **Model Name**: Select from available OpenAI models
- **Temperature**: Control randomness (0 = focused, 2 = creative)
- **Streaming**: Enable/disable real-time response streaming
- **System Prompt**: Define AI behavior and response style
- **API Key**: Optionally update the OpenAI API key

## API Endpoints Used

- `GET /api/llm-config` - Fetch current configuration
- `PUT /api/llm-config` - Update configuration

## Security Notes

⚠️ **Important**:

- The API key field saves to the server's `llm-config.json` file
- Add `llm-config.json` to your `.gitignore`
- Consider adding authentication for production use
- CORS is currently open - restrict it for production

## Customization

### Change API URL

Edit `app.js`:

```javascript
const API_BASE_URL = "https://your-api-domain.com";
```

### Modify Styling

Edit `styles.css` to change colors, fonts, and layout.

### Add More Models

Edit `index.html` to add more model options:

```html
<option value="gpt-4-turbo-preview">GPT-4 Turbo Preview</option>
```

## Troubleshooting

**Issue: Can't connect to server**

- Verify server is running on port 5000
- Check `API_BASE_URL` in `app.js`
- Ensure CORS is enabled on server

**Issue: Changes not saving**

- Check browser console for errors
- Verify all required fields are filled
- Check server logs for errors

**Issue: Blank page**

- Open browser console (F12) to see errors
- Ensure all files (index.html, styles.css, app.js) are in the same folder

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

To modify the UI:

1. Edit HTML structure in `index.html`
2. Update styles in `styles.css`
3. Modify functionality in `app.js`
4. Refresh browser to see changes

No build process required - it's vanilla HTML/CSS/JavaScript!
