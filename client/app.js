// Configuration
// Note: Browser JavaScript cannot access .env files or process.env
// The API_BASE_URL should point to where your server is running
const API_BASE_URL = 'https://home-inspection-production.up.railway.app';

// Models that have restricted parameters
// O-series: Only support temperature=1 and topP=1
// GPT-5 series: Do NOT support topP parameter at all, only temperature
const O_SERIES_MODELS = ['o1', 'o1-preview', 'o1-mini', 'o3', 'o3-mini', 'o3-pro', 'o4-mini'];
const GPT5_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-pro', 'gpt-5-codex', 'gpt-5-chat'];

// Elements
const form = document.getElementById('configForm');
const alert = document.getElementById('alert');
const loading = document.getElementById('loading');
const temperatureSlider = document.getElementById('temperature');
const tempValue = document.getElementById('tempValue');
const topPSlider = document.getElementById('topP');
const topPValue = document.getElementById('topPValue');
const modelSelect = document.getElementById('modelName');
const modelWarning = document.getElementById('modelWarning');

// Check if model is O-series (restricted to temp=1, topP=1)
function isOSeriesModel(modelName) {
    return O_SERIES_MODELS.some(m => modelName.toLowerCase().includes(m));
}

// Check if model is GPT-5 series (no topP support)
function isGPT5Model(modelName) {
    return GPT5_MODELS.some(m => modelName.toLowerCase().includes(m));
}

// Update UI based on model selection
function updateModelRestrictions() {
    const selectedModel = modelSelect.value;
    const isOSeries = isOSeriesModel(selectedModel);
    const isGPT5 = isGPT5Model(selectedModel);
    
    if (isOSeries) {
        // O-series models: only support temperature=1 and topP=1
        modelWarning.textContent = '⚠️ This model only supports temperature=1 and topP=1';
        modelWarning.style.display = 'block';
        
        // Disable both sliders and set to 1
        temperatureSlider.disabled = true;
        topPSlider.disabled = true;
        temperatureSlider.value = 1;
        topPSlider.value = 1;
        tempValue.textContent = '1';
        topPValue.textContent = '1';
        
        temperatureSlider.style.opacity = '0.5';
        topPSlider.style.opacity = '0.5';
    } else if (isGPT5) {
        // GPT-5 series: only support temperature=1, do not support topP parameter at all
        modelWarning.textContent = '⚠️ This model only supports temperature=1 and does not support topP parameter';
        modelWarning.style.display = 'block';
        
        // Disable both sliders and lock temperature to 1
        temperatureSlider.disabled = true;
        topPSlider.disabled = true;
        temperatureSlider.value = 1;
        topPSlider.value = 1;
        tempValue.textContent = '1';
        topPValue.textContent = '1 (not supported)';
        
        temperatureSlider.style.opacity = '0.5';
        topPSlider.style.opacity = '0.5';
    } else {
        // Standard models: full parameter support
        modelWarning.style.display = 'none';
        
        // Enable both sliders
        temperatureSlider.disabled = false;
        topPSlider.disabled = false;
        temperatureSlider.style.opacity = '1';
        topPSlider.style.opacity = '1';
    }
}

// Listen for model changes
modelSelect.addEventListener('change', updateModelRestrictions);

// Update temperature display
temperatureSlider.addEventListener("input", (e) => {
  tempValue.textContent = e.target.value;
});

// Update top_p display
topPSlider.addEventListener("input", (e) => {
  topPValue.textContent = e.target.value;
});

// Show alert message
function showAlert(message, type = "success") {
  // Clear any existing timeout
  if (window.alertTimeout) {
    clearTimeout(window.alertTimeout);
    window.alertTimeout = null;
  }
  
  // Clear existing content
  alert.innerHTML = '';
  
  // Create alert content container
  const alertContent = document.createElement('div');
  alertContent.className = 'alert-content';
  
  // Create message span
  const messageSpan = document.createElement('span');
  messageSpan.className = 'alert-message';
  messageSpan.textContent = message;
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'alert-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close alert');
  closeBtn.onclick = closeAlert;
  
  // Append elements
  alertContent.appendChild(messageSpan);
  alertContent.appendChild(closeBtn);
  alert.appendChild(alertContent);
  
  // Set alert type and show
  alert.className = `alert ${type} show`;
  
  // Only auto-hide success and info messages after 5 seconds
  // Keep error and warning messages visible until manually closed
  if (type === "success" || type === "info") {
    window.alertTimeout = setTimeout(() => {
      alert.classList.remove("show");
      window.alertTimeout = null;
    }, 5000);
  }
}

// Close alert manually
function closeAlert() {
  if (window.alertTimeout) {
    clearTimeout(window.alertTimeout);
    window.alertTimeout = null;
  }
  alert.classList.remove("show");
}

// Show/hide loading
function setLoading(isLoading) {
  loading.classList.toggle("show", isLoading);
  form.style.opacity = isLoading ? "0.5" : "1";
  form.style.pointerEvents = isLoading ? "none" : "auto";

  // Disable/enable buttons
  const buttons = form.querySelectorAll("button");
  buttons.forEach((btn) => {
    btn.disabled = isLoading;
  });
}

// Load current configuration
async function loadConfig() {
  setLoading(true);
  try {
    const response = await fetch(`${API_BASE_URL}/api/llm-config`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      const config = data.config;

      console.log("Loaded config:", config);
      console.log("System prompt:", config.systemPrompt);

      // Populate form fields
      document.getElementById("modelName").value =
        config.modelName || "gpt-4o-mini";
      document.getElementById("temperature").value = config.temperature || 0.3;
      tempValue.textContent = config.temperature || 0.3;
      document.getElementById("topP").value =
        config.topP !== undefined ? config.topP : 1.0;
      topPValue.textContent = config.topP !== undefined ? config.topP : 1.0;

      const systemPromptEl = document.getElementById("systemPrompt");
      systemPromptEl.value = config.systemPrompt || "";
      console.log(
        "Set textarea value to:",
        systemPromptEl.value.substring(0, 100)
      );
      console.log("Textarea element:", systemPromptEl);
      console.log("Textarea has value:", systemPromptEl.value.length, "characters");

      // Set streaming checkbox
      document.getElementById("streaming").checked = config.streaming !== false;

      // Check if loaded model has restrictions
      updateModelRestrictions();

      showAlert("✅ Configuration loaded successfully!", "success");
    } else {
      showAlert("❌ Failed to load configuration", "error");
    }
  } catch (error) {
    console.error("Load error:", error);
    showAlert(`❌ Error loading configuration: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

// Save configuration
async function saveConfig(event) {
  event.preventDefault();
  setLoading(true);

  // Gather form data
  const config = {
    modelName: document.getElementById("modelName").value,
    temperature: parseFloat(document.getElementById("temperature").value),
    topP: parseFloat(document.getElementById("topP").value),
    systemPrompt: document.getElementById("systemPrompt").value.trim(),
    streaming: document.getElementById("streaming").checked,
  };

  // Validate system prompt
  if (!config.systemPrompt) {
    showAlert("❌ System prompt cannot be empty", "error");
    setLoading(false);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/llm-config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      showAlert(
        "✅ Configuration saved successfully! LLM has been reinitialized with new settings.",
        "success"
      );

      // Update form with returned config
      if (data.config) {
        document.getElementById("modelName").value = data.config.modelName;
        document.getElementById("temperature").value = data.config.temperature;
        tempValue.textContent = data.config.temperature;
        document.getElementById("topP").value =
          data.config.topP !== undefined ? data.config.topP : 1.0;
        topPValue.textContent =
          data.config.topP !== undefined ? data.config.topP : 1.0;
        document.getElementById("systemPrompt").value =
          data.config.systemPrompt;
      }
    } else {
      showAlert(`❌ Failed to save: ${data.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    console.error("Save error:", error);
    showAlert(`❌ Error saving configuration: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

// Test configuration
async function testConfig() {
  setLoading(true);

  // Gather form data
  const config = {
    modelName: document.getElementById("modelName").value,
    temperature: parseFloat(document.getElementById("temperature").value),
    topP: parseFloat(document.getElementById("topP").value),
    systemPrompt: document.getElementById("systemPrompt").value.trim(),
    streaming: document.getElementById("streaming").checked,
  };

  // Validate system prompt
  if (!config.systemPrompt) {
    showAlert("❌ System prompt cannot be empty", "error");
    setLoading(false);
    return;
  }

  try {
    showAlert("🧪 Testing configuration... This may take a few seconds.", "info");
    
    const response = await fetch(`${API_BASE_URL}/api/llm-config/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    const data = await response.json();

    if (data.success) {
      // Show success with actual ChatGPT response
      let successMsg = `✅ Configuration is working!\n\n`;
      successMsg += `📋 Tested Configuration:\n`;
      successMsg += `• Model: ${data.config.model}\n`;
      successMsg += `• Temperature: ${data.config.temperature}\n`;
      successMsg += `• Top P: ${data.config.topP}\n`;
      successMsg += `• Streaming: ${data.config.streaming ? 'Enabled' : 'Disabled'}\n`;
      successMsg += `• Vision Support: ✅ YES (Image analysis works!)\n\n`;
      successMsg += `💬 ChatGPT Response:\n"${data.response}"`;
      
      showAlert(successMsg, "success");
    } else {
      // Show actual error from OpenAI
      let errorMsg = `❌ Configuration Test Failed\n\n`;
      
      // Highlight vision errors prominently
      if (data.isVisionError) {
        errorMsg = `🚫 VISION NOT SUPPORTED\n\n`;
        errorMsg += `${data.error}\n\n`;
        errorMsg += `⚠️ This home inspection app REQUIRES image analysis capability.\n`;
        errorMsg += `Please select a vision-capable model.`;
      } else {
        errorMsg += `🚫 Error from OpenAI:\n${data.error}\n\n`;
        
        if (data.parameter) {
          errorMsg += `📌 Problem with parameter: ${data.parameter}\n`;
        }
        
        if (data.errorCode && data.errorCode !== 'unknown') {
          errorMsg += `🔧 Error Code: ${data.errorCode}\n`;
        }
        
        if (data.errorType && data.errorType !== 'unknown') {
          errorMsg += `📂 Error Type: ${data.errorType}\n`;
        }
        
        errorMsg += `\n💡 What to do:\n`;
        errorMsg += `• Check the error message above\n`;
        errorMsg += `• Adjust your configuration accordingly\n`;
        errorMsg += `• Try testing again with different settings`;
      }
      
      showAlert(errorMsg, "error");
    }
  } catch (error) {
    console.error("Test error:", error);
    showAlert(
      `❌ Error testing configuration: ${error.message}\n\nPlease check your network connection and try again.`,
      "error"
    );
  } finally {
    setLoading(false);
  }
}

// Event listeners
form.addEventListener("submit", saveConfig);

// Load config on page load
window.addEventListener("DOMContentLoaded", () => {
  loadConfig();
});

// Add keyboard shortcut (Ctrl/Cmd + S to save)
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    form.dispatchEvent(new Event("submit"));
  }
});
