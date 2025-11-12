# Error Handling Update - Streaming & Analysis Endpoints

## Changes Made

### 1. Enhanced `/api/analyze` Endpoint Error Handling
**Problem**: When users encountered streaming errors (like organization verification), the error messages were generic and unhelpful.

**Solution**: Added comprehensive error parsing and user-friendly messages:
- **Organization Verification Error**: Clear message with verification link and tip to disable streaming
- **Parameter Errors**: Specific guidance for temperature and topP issues
- **API Key Errors**: Clear instructions to check .env file
- **Rate Limiting**: Helpful advice to wait or upgrade
- **Service Unavailable**: Status check link provided

### 2. Enhanced `/api/llm-config/test` Endpoint
**Problem**: Test endpoint was using `invoke()` method which doesn't test streaming functionality, so streaming-specific errors weren't caught during testing.

**Solution**: 
- Now tests with actual streaming if `streaming: true` is configured
- Catches streaming-specific errors (organization verification, etc.)
- Returns helpful tips array with actionable steps
- Provides links to relevant settings pages

### 3. Improved Client-Side Error Display
**Problem**: Error messages were basic and didn't show helpful tips.

**Solution**:
- Now displays `helpfulTips` array as numbered list
- Shows clear formatting: Error → Parameter → Code → Tips → Technical Details
- Multi-line alert support ensures all information is visible

## Error Types Now Handled

### Streaming Errors
```
⚠️ ORGANIZATION VERIFICATION REQUIRED FOR STREAMING

Your organization must be verified to use streaming with this model.

💡 How to fix:
1. Go to: https://platform.openai.com/settings/organization/general
2. Click on 'Verify Organization'
3. Wait up to 15 minutes for verification to propagate
4. OR: Disable streaming in the configuration to use this model immediately
```

### Temperature Errors
```
This model only supports temperature=1. Current value: 0.7

💡 How to fix:
1. Set temperature to 1.0 to use this model
```

### TopP Errors
```
This model does not support the top_p parameter.

💡 How to fix:
1. This is a GPT-5 series model which doesn't use topP
```

### Quota Errors
```
You have exceeded your API quota.

💡 How to fix:
1. Check your plan at: https://platform.openai.com/account/billing
2. Upgrade your plan if needed
3. Wait for quota reset
```

### API Key Errors
```
Invalid API key.

💡 How to fix:
1. Check your OpenAI API key in the .env file
2. Verify the key is active at: https://platform.openai.com/api-keys
```

## Testing Instructions

### Test Organization Verification Error
1. Open LLM Configuration UI: http://localhost:5000/llm-config-ui
2. Select a model that requires verification (like GPT-4)
3. Ensure streaming is enabled in your current config
4. Click "🧪 Test Configuration"
5. If your organization isn't verified, you'll see the helpful error with tips

### Test in Analysis Endpoint
1. Use the image analysis feature with a model requiring verification
2. If error occurs, you'll see formatted error message with:
   - Clear explanation
   - Verification link
   - Tip to disable streaming as workaround

## Benefits

✅ **Users know exactly what's wrong** - Clear error messages instead of technical jargon

✅ **Users know how to fix it** - Step-by-step instructions with links

✅ **Test before save** - Catch errors during testing, not during actual usage

✅ **Streaming tested properly** - Test endpoint now validates streaming works

✅ **Better UX** - No more confusion about why something isn't working

## Files Modified

1. **server.js**
   - Enhanced `/api/analyze` error handling
   - Modified `/api/llm-config/test` to test streaming properly
   - Added `helpfulTips` array to error responses

2. **client/app.js**
   - Enhanced `testConfig()` to display helpful tips
   - Better error message formatting

## Next Steps

Users can now:
1. Test their configuration before saving
2. See exactly why a configuration won't work
3. Get actionable steps to fix issues
4. Understand model-specific limitations clearly
