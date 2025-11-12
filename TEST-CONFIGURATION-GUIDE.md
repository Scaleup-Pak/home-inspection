# Test Configuration Feature - User Guide

## 🎯 Overview

The **Test Configuration** feature allows users to validate their LLM settings **before saving** them. This prevents configuration errors from causing issues during actual image analysis or chat operations.

## 🚀 How It Works

### User Flow:

1. **Select Configuration**
   - Choose model from dropdown
   - Adjust temperature slider (0-2)
   - Adjust topP slider (0-1) 
   - Edit system prompt
   - Toggle streaming on/off

2. **Click "🧪 Test Configuration"**
   - Sends a minimal test request to OpenAI API
   - Tests with **exact settings** from the form (not saved config)
   - Tests streaming if enabled, non-streaming if disabled
   - Shows "Testing..." message while running

3. **View Results**
   - ✅ **Success**: Shows "Configuration is valid and working!"
   - ❌ **Error**: Shows detailed error with fix instructions

### What Gets Tested:

✅ Model accessibility (do you have access to this model?)  
✅ API key validity  
✅ Parameter support (temperature, topP restrictions)  
✅ Streaming capability (organization verification)  
✅ Rate limits  
✅ Service availability  

## 📋 Example Scenarios

### Scenario 1: Testing GPT-4 with Streaming (Unverified Org)

**User Selects:**
- Model: GPT-4
- Temperature: 0.7
- TopP: 1.0
- Streaming: ✅ Enabled

**Clicks Test → Result:**
```
❌ Configuration Test Failed

⚠️ ORGANIZATION VERIFICATION REQUIRED FOR STREAMING

Your organization must be verified to use streaming with this model.

💡 How to fix:
1. Go to: https://platform.openai.com/settings/organization/general
2. Click on 'Verify Organization'
3. Wait up to 15 minutes for verification to propagate
4. OR: Disable streaming in the configuration to use this model immediately

📌 Parameter: stream
🔧 Error Code: unsupported_value
```

**User Action**: Either verify organization OR disable streaming and test again.

---

### Scenario 2: Testing O1 Model with Wrong Temperature

**User Selects:**
- Model: O1
- Temperature: 0.7 (❌ Wrong - O1 only supports 1.0)
- TopP: 1.0
- Streaming: ✅ Enabled

**Clicks Test → Result:**
```
❌ Configuration Test Failed

This model only supports temperature=1. Current value: 0.7

💡 How to fix:
1. Set temperature to 1.0 to use this model

📌 Parameter: temperature
🔧 Error Code: unsupported_value
```

**User Action**: Adjust temperature slider to 1.0 and test again.

---

### Scenario 3: Testing GPT-5 with TopP Parameter

**User Selects:**
- Model: GPT-5
- Temperature: 1.0
- TopP: 0.8 (❌ Not supported by GPT-5)
- Streaming: ✅ Enabled

**Clicks Test → Result:**
```
❌ Configuration Test Failed

This model does not support the top_p parameter.

💡 How to fix:
1. This is a GPT-5 series model which doesn't use topP

📌 Parameter: top_p
🔧 Error Code: unsupported_value
```

**User Action**: TopP is automatically excluded for GPT-5 models, but UI shows warning.

---

### Scenario 4: Successful Test

**User Selects:**
- Model: GPT-4o-mini
- Temperature: 0.7
- TopP: 1.0
- Streaming: ❌ Disabled

**Clicks Test → Result:**
```
✅ Configuration is valid and working!

💬 Test response: "Success"
```

**User Action**: Click "💾 Save Changes" to apply the configuration.

## 🎨 UI Components

### Form Fields:
1. **Model Name** - Dropdown with 50+ models organized by series
2. **Temperature** - Slider (0-2) with real-time value display
3. **Top P** - Slider (0-1) with real-time value display
4. **System Prompt** - Multi-line textarea with keyboard shortcuts
5. **Enable Streaming** - Toggle switch (ON/OFF)

### Buttons:
1. **🔄 Reload** - Fetch and load saved configuration
2. **🧪 Test Configuration** - Test current form values WITHOUT saving
3. **💾 Save Changes** - Save configuration and reinitialize LLM

### Dynamic Warnings:
- O-Series models show: "⚠️ This model only supports temperature=1 and topP=1"
- GPT-5 models show: "⚠️ This model does not support the topP parameter"
- Sliders auto-disable based on model restrictions

## 🔧 Technical Details

### API Endpoint: `POST /api/llm-config/test`

**Request Body:**
```json
{
  "modelName": "gpt-4",
  "temperature": 0.7,
  "topP": 1.0,
  "systemPrompt": "You are a helpful assistant...",
  "streaming": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Configuration is valid and working! (Streaming verified)",
  "testResponse": "Success"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "⚠️ ORGANIZATION VERIFICATION REQUIRED FOR STREAMING...",
  "details": {
    "status": 400,
    "type": "invalid_request_error",
    "code": "unsupported_value",
    "param": "stream"
  },
  "helpfulTips": [
    "Go to: https://platform.openai.com/settings/organization/general",
    "Click on 'Verify Organization'",
    "Wait up to 15 minutes for verification to propagate",
    "OR: Disable streaming in the configuration to use this model immediately"
  ],
  "originalError": "Your organization must be verified to stream this model..."
}
```

### Test Flow:

1. **Gather form values** (model, temp, topP, prompt, streaming)
2. **Send to test endpoint** with current selections
3. **Backend creates test LLM instance** with provided config
4. **Sends minimal test message** ("Test" → "Success")
5. **If streaming enabled**: Tests with actual streaming
6. **If streaming disabled**: Tests with invoke method
7. **Returns result** with success or detailed error

### Timeout Protection:
- 15-second timeout on test requests
- Prevents hanging on network issues
- Shows timeout error with helpful message

## 💡 Best Practices

### For Users:
1. **Always test before saving** - Especially when changing models
2. **Read error messages carefully** - They include fix instructions
3. **Check streaming requirements** - Some models need verification
4. **Start with streaming disabled** - Enable after verification
5. **Use realistic system prompts** - Test with actual prompt you'll use

### For Developers:
1. **Test endpoint mirrors actual usage** - Same LLM initialization
2. **Errors include actionable tips** - Not just technical messages
3. **Streaming tested properly** - Uses stream() method when enabled
4. **Links to settings pages** - Direct users to fix issues
5. **Multi-line alert support** - Display detailed information clearly

## 🐛 Common Issues & Solutions

### Issue: "Organization verification required"
**Solution**: Go to OpenAI settings and verify organization, OR disable streaming

### Issue: "Invalid API key"
**Solution**: Check .env file, verify key is active at platform.openai.com/api-keys

### Issue: "Model not found"
**Solution**: Check model name spelling, verify you have access to this model

### Issue: "Rate limit exceeded"
**Solution**: Wait a moment, or upgrade plan for higher limits

### Issue: "Test request timed out"
**Solution**: Check network connection, try again, or check OpenAI status

### Issue: "Temperature/topP not supported"
**Solution**: Follow model-specific restrictions (O-series, GPT-5 have limitations)

## 🎯 Key Benefits

✅ **Prevents runtime errors** - Catch issues before actual usage  
✅ **Saves time** - No need to wait for failed analysis  
✅ **Clear guidance** - Know exactly how to fix issues  
✅ **Confidence** - Know your config works before saving  
✅ **Better UX** - No confusion about why something failed  
✅ **Streaming validation** - Test streaming before relying on it  

## 📍 Access the UI

Open in your browser: **http://localhost:5000/llm-config-ui**

The server must be running (`node server.js`) to use the configuration UI.
