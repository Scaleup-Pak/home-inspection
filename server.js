require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// LangChain imports
const { ChatOpenAI } = require("@langchain/openai");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const Mustache = require("mustache");

const app = express();
app.use(cors());
// Increase body size so clients can POST base64-encoded images in chat requests.
// Base64 is larger than binary; set to a reasonable limit for development. Adjust in production.
app.use(express.json({ limit: "15mb" }));

const upload = multer({ dest: "uploads/" });

// Built-in default system prompt
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

// Path for persisted LLM configuration
const CONFIG_PATH = path.join(__dirname, "llm-config.json");

// Default LLM config
let llmConfig = {
  modelName: "gpt-4o-mini",
  streaming: true,
  temperature: 0.3,
  topP: 1.0,
  systemPrompt: SYSTEM_PROMPT,
  chatPrompt: null,
};

// Load persisted config if available
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    llmConfig = Object.assign({}, llmConfig, parsed);
    // Ensure new keys exist
    llmConfig.chatPrompt = parsed.chatPrompt || null;
    console.log("Loaded LLM config from", CONFIG_PATH);
  }
} catch (err) {
  console.error("Failed to load LLM config:", err);
}

// Create / re-create ChatOpenAI instance from llmConfig
let llm;
function initLlm() {
  try {
    const modelLower = llmConfig.modelName
      ? llmConfig.modelName.toLowerCase()
      : "";

    // Check if model is GPT-5 series (does not support topP)
    const isGPT5Model =
      modelLower.includes("gpt-5") ||
      modelLower.includes("gpt-5-mini") ||
      modelLower.includes("gpt-5-nano") ||
      modelLower.includes("gpt-5-pro") ||
      modelLower.includes("gpt-5-codex") ||
      modelLower.includes("gpt-5-chat");

    // Build config object
    const llmInitConfig = {
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: llmConfig.modelName,
      streaming: Boolean(llmConfig.streaming),
      temperature: Number(llmConfig.temperature),
      systemPrompt: llmConfig.systemPrompt,
    };

    // Only add topP if model supports it (not GPT-5 series)
    if (!isGPT5Model) {
      llmInitConfig.topP = Number(llmConfig.topP);
    }

    llm = new ChatOpenAI(llmInitConfig);

    const logMessage = `Initialized LLM with model: ${llmConfig.modelName} temperature: ${llmConfig.temperature}`;
    if (isGPT5Model) {
      console.log(logMessage + " (topP not supported by this model)");
    } else {
      console.log(logMessage + ` topP: ${llmConfig.topP}`);
    }
  } catch (err) {
    console.error("Failed to initialize LLM:", err);
    throw err;
  }
}

// initialize on startup
initLlm();

const outputParser = new StringOutputParser();

// Create image analysis prompt template
const imageAnalysisPrompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_PROMPT],
  [
    "human",
    "Analyze these home inspection photos grouped by category: {imageAnalysisText}",
  ],
]);

// Create chat prompt template
const chatPrompt = ChatPromptTemplate.fromMessages([
  ["system", "{systemPrompt}"],
  ["system", "Context from previous analysis: {context}"],
  ["placeholder", "{conversationHistory}"],
  ["human", "{message}"],
]);

// Serve static files from client folder
app.use("/llm-config-ui", express.static(path.join(__dirname, "client")));

app.use((err, req, res, next) => {
  console.error(err.stack || err);
  // Special handling for payload too large - body-parser throws this when exceeding express json limit
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error:
        "Request entity too large. Try reducing image size or number of images, or increase the server JSON limit.",
    });
  }

  res.status(500).send("Something broke!");
});

// Helper function to convert base64 image to LangChain format
function createImageContent(base64Data, category, index) {
  return {
    type: "image_url",
    image_url: {
      url: `data:image/jpeg;base64,${base64Data}`,
    },
  };
}

// Render a prompt template using Mustache, with simple safeguards
function renderPromptTemplate(template, variables = {}) {
  try {
    // Shorten report if it is too long to avoid token explosion
    if (variables.report && variables.report.length > 8000) {
      variables.report =
        variables.report.substring(0, 8000) + "\n\n[TRUNCATED]";
    }

    // Provide a stringified images list helper
    if (Array.isArray(variables.images)) {
      const imagesArr = variables.images;
      variables.images = imagesArr
        .map((img, idx) => {
          if (!img) return "";
          const category = img.category || "unknown";
          const uri =
            img.uri || img.url || (img.base64 ? "[base64 image]" : "unknown");
          return `Image ${idx + 1}: category=${category}, uri=${uri}`;
        })
        .join("\n");
      variables.imagesList = variables.images;
      variables.imageCount = imagesArr.length || 0;
    }

    return Mustache.render(template || "", variables);
  } catch (err) {
    console.warn("Prompt templating error:", err);
    return template; // fallback if templating fails
  }
}
// Ensure llmConfig has a systemPrompt (default to the built-in SYSTEM_PROMPT)
if (!llmConfig.systemPrompt) {
  llmConfig.systemPrompt = SYSTEM_PROMPT;
}
app.post("/api/analyze", upload.array("photo"), async (req, res) => {
  try {
    const categories = JSON.parse(req.body.categories || "[]");
    const images = req.files.map((file, index) => ({
      category: categories[index] || "Unknown",
      path: file.path,
    }));

    // Convert images to base64
    const imageContents = [];
    const imageDescriptions = [];

    images.forEach((img, index) => {
      const base64Data = fs.readFileSync(img.path, "base64");
      imageContents.push(createImageContent(base64Data, img.category, index));
      imageDescriptions.push(`${img.category} Photo ${index + 1}`);
    });

    // Create the analysis text with image descriptions
    const imageAnalysisText =
      imageDescriptions.join(", ") + "\n\n[Images provided for analysis]";

    // Create messages array with images
    const messages = [
      new SystemMessage(llmConfig.systemPrompt || SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          {
            type: "text",
            text: `Analyze these home inspection photos grouped by category: ${imageAnalysisText}`,
          },
          ...imageContents,
        ],
      }),
    ];

    // Set up streaming response
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");

    // Stream the response using LangChain
    const stream = await llm.stream(messages);

    for await (const chunk of stream) {
      res.write(chunk.content || "");
    }

    res.end();

    // Clean up uploaded files
    images.forEach((img) => {
      try {
        fs.unlinkSync(img.path);
      } catch (err) {
        console.error("Error cleaning up file:", err);
      }
    });
  } catch (error) {
    console.error("Analysis error:", error);

    // Clean up uploaded files even on error
    if (req.files) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error("Error cleaning up file:", err);
        }
      });
    }

    // Parse error for user-friendly message
    let errorMessage = error.message || "Unknown error occurred";

    if (error.status === 400) {
      if (error.code === "unsupported_value" && error.param === "stream") {
        errorMessage =
          "⚠️ ORGANIZATION VERIFICATION REQUIRED\n\n" +
          "Your organization must be verified to use streaming with this model.\n\n" +
          "Please go to: https://platform.openai.com/settings/organization/general\n" +
          "Click on 'Verify Organization'\n\n" +
          "If you just verified, it can take up to 15 minutes for access to propagate.\n\n" +
          "TIP: You can disable streaming in the LLM Configuration UI to use this model immediately.";
      } else if (
        error.code === "unsupported_value" &&
        error.param === "temperature"
      ) {
        errorMessage = `This model only supports temperature=1. Current configuration: ${llmConfig.temperature}`;
      } else if (
        error.code === "unsupported_parameter" &&
        error.param === "top_p"
      ) {
        errorMessage = `This model does not support the top_p parameter.`;
      }
    } else if (error.status === 401) {
      errorMessage =
        "Invalid API key. Please check your OpenAI API key in .env file.";
    } else if (error.status === 429) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
    } else if (error.status === 503) {
      errorMessage =
        "OpenAI service is temporarily unavailable. Please try again later.";
    }

    res.status(error.status || 500).send("Analysis failed:\n\n" + errorMessage);
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      systemPrompt,
      context,
      conversationHistory,
      images,
      promptOverride,
    } = req.body;
    req.body;

    console.log("Received chat request:", {
      message: message?.substring(0, 50) + (message?.length > 50 ? "..." : ""),
      systemPrompt:
        systemPrompt?.substring(0, 50) +
        (systemPrompt?.length > 50 ? "..." : ""),
      context: context?.substring(0, 50) + (context?.length > 50 ? "..." : ""),
      conversationHistoryLength: (conversationHistory || []).length,
      imagesCount: Array.isArray(images) ? images.length : 0,
    });

    // Convert conversation history to LangChain message format
    const historyMessages = [];
    if (Array.isArray(conversationHistory)) {
      conversationHistory.forEach((msg) => {
        const content = (msg.content || "").toString();
        if (content.trim()) {
          if (msg.role === "user") {
            historyMessages.push(new HumanMessage(content));
          } else if (msg.role === "assistant") {
            historyMessages.push(new AIMessage(content));
          }
        }
      });
    }

    // Build template variables for prompt interpolation
    const templateVariables = {
      report: context || "",
      images: images || [],
    };

    // Resolve system prompt priority: promptOverride > server chatPrompt > client systemPrompt > llmConfig
    let resolvedSystemPrompt = systemPrompt;
    if (promptOverride) {
      resolvedSystemPrompt = renderPromptTemplate(
        promptOverride,
        templateVariables
      );
      console.log("Using promptOverride");
    } else if (llmConfig.chatPrompt) {
      resolvedSystemPrompt = renderPromptTemplate(
        llmConfig.chatPrompt || "",
        templateVariables
      );
      console.log("Using server configured chatPrompt");
    }
    // fallback to client-provided or persisted
    resolvedSystemPrompt =
      resolvedSystemPrompt || llmConfig.systemPrompt || SYSTEM_PROMPT;

    // If the client provided images, convert them to image contents
    // Accept image items as either:
    // - strings that are data URLs (data:image/...), or
    // - objects with { base64 } or { url } fields
    let imageContents = [];
    if (Array.isArray(images) && images.length) {
      imageContents = images
        .map((img, idx) => {
          if (!img) return null;
          if (typeof img === "string") {
            // already data URL?
            if (img.startsWith("data:")) {
              return {
                type: "image_url",
                image_url: { url: img },
              };
            }
            // assume it's a base64 string
            return createImageContent(img, `Chat Image ${idx + 1}`, idx);
          }
          if (typeof img === "object") {
            if (img.url) {
              return {
                type: "image_url",
                image_url: { url: img.url },
              };
            }
            if (img.base64) {
              return createImageContent(
                img.base64,
                `Chat Image ${idx + 1}`,
                idx
              );
            }
          }
          return null;
        })
        .filter(Boolean);
    }

    // If images provided: use a direct ChatOpenAI request with image content included
    if (imageContents.length > 0) {
      // Build message array including images with the current user message.
      const messages = [
        new SystemMessage(resolvedSystemPrompt),
        ...historyMessages,
        new HumanMessage({
          content: [
            { type: "text", text: (message || "").toString() },
            ...imageContents,
          ],
        }),
      ];

      // Stream the response back (vision models will process image_url)
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      try {
        const stream = await llm.stream(messages);
        for await (const chunk of stream) {
          // llm.stream yields chunk.content
          res.write(chunk.content || "");
        }
        res.end();
        return;
      } catch (err) {
        console.error("Chat with images error:", err);

        // handle known OpenAI errors for images
        let errorMessage = err.message || "Unknown error";
        if (
          err.message &&
          err.message.includes("image_url is only supported by certain models")
        ) {
          errorMessage =
            "❌ This model does NOT support vision/image analysis. " +
            "Please select a vision-capable model (e.g. gpt-4o, gpt-4o-mini, gpt-4-vision-preview). " +
            "Original error: " +
            err.message;
        } else if (
          err.status === 400 &&
          err.code === "unsupported_value" &&
          err.param === "stream"
        ) {
          errorMessage =
            "⚠️ ORGANIZATION VERIFICATION REQUIRED FOR STREAMING.\n" +
            "Go to https://platform.openai.com/settings/organization/general to verify your organization, or disable streaming in the configuration to proceed.";
        }

        // Provide JSON for frontend to display errors clearly
        const errorResponse = {
          success: false,
          error: errorMessage,
          errorType: err.type || "unknown",
          errorCode: err.code || null,
          parameter: err.param || null,
          details: err.response?.data || null,
        };
        return res.status(err.status || 500).json(errorResponse);
      }
    }

    // No images: follow the previous chat flow with prompt pipeline
    const chain = chatPrompt.pipe(llm).pipe(outputParser);

    const chainInput = {
      systemPrompt: (
        resolvedSystemPrompt ||
        llmConfig.systemPrompt ||
        ""
      ).toString(),
      context: (context || "").toString(),
      conversationHistory: historyMessages,
      message: (message || "").toString(),
    };

    console.log("LangChain input prepared:", {
      systemPromptLength: chainInput.systemPrompt.length,
      contextLength: chainInput.context.length,
      historyLength: chainInput.conversationHistory.length,
      messageLength: chainInput.message.length,
    });

    // Stream the response using LangChain (no images)
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await chain.stream(chainInput);
    for await (const chunk of stream) {
      res.write(chunk || "");
    }
    res.end();
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage =
      error.response?.data?.error?.message || error.message || "Unknown error";

    // Provide descriptive JSON so frontend can show the actual OpenAI error
    res.status(error.status || 500).json({
      success: false,
      error: errorMessage,
      errorType: error.type || "unknown",
      errorCode: error.code || null,
      parameter: error.param || null,
      details: error.response?.data || null,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    langchain: "enabled",
    llm: {
      model: llmConfig.modelName,
      temperature: llmConfig.temperature,
      topP: llmConfig.topP,
    },
  });
});

// Get current LLM configuration
app.get("/api/llm-config", (req, res) => {
  const safeConfig = Object.assign({}, llmConfig);
  // Do not return API key in responses
  if (safeConfig.openAIApiKey) delete safeConfig.openAIApiKey;
  res.json({ success: true, config: safeConfig });
});

// Update LLM configuration (systemPrompt, modelName, temperature, streaming, openAIApiKey)
app.put("/api/llm-config", express.json(), async (req, res) => {
  try {
    const allowed = [
      "systemPrompt",
      "modelName",
      "temperature",
      "topP",
      "streaming",
      "openAIApiKey",
      "chatPrompt",
    ];
    const updates = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    // Basic validation
    if (updates.modelName && typeof updates.modelName !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "modelName must be a string" });
    }
    if (updates.systemPrompt && typeof updates.systemPrompt !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "systemPrompt must be a string" });
    }
    if (updates.chatPrompt !== undefined) {
      if (typeof updates.chatPrompt !== "string") {
        return res
          .status(400)
          .json({ success: false, error: "chatPrompt must be a string" });
      }
    }
    if (updates.temperature !== undefined) {
      const t = Number(updates.temperature);
      if (Number.isNaN(t) || t < 0 || t > 2) {
        return res.status(400).json({
          success: false,
          error: "temperature must be a number between 0 and 2",
        });
      }
      updates.temperature = t;
    }
    if (updates.topP !== undefined) {
      const p = Number(updates.topP);
      if (Number.isNaN(p) || p < 0 || p > 1) {
        return res.status(400).json({
          success: false,
          error: "topP must be a number between 0 and 1",
        });
      }
      updates.topP = p;
    }
    if (updates.streaming !== undefined) {
      updates.streaming = Boolean(updates.streaming);
    }

    // Model-specific validation
    const modelName = updates.modelName || llmConfig.modelName;
    const modelLower = modelName ? modelName.toLowerCase() : "";

    // O-series models: Only support temperature=1 and topP=1
    const isOSeriesModel =
      modelLower.includes("o1") ||
      modelLower.includes("o1-preview") ||
      modelLower.includes("o1-mini") ||
      modelLower.includes("o3") ||
      modelLower.includes("o3-mini") ||
      modelLower.includes("o3-pro") ||
      modelLower.includes("o4-mini");

    // GPT-5 series models: Only support temperature=1, do NOT support topP parameter
    const isGPT5Model =
      modelLower.includes("gpt-5") ||
      modelLower.includes("gpt-5-mini") ||
      modelLower.includes("gpt-5-nano") ||
      modelLower.includes("gpt-5-pro") ||
      modelLower.includes("gpt-5-codex") ||
      modelLower.includes("gpt-5-chat");

    if (isOSeriesModel) {
      // O-series models only support temperature=1 and topP=1
      if (updates.temperature !== undefined && updates.temperature !== 1) {
        return res.status(400).json({
          success: false,
          error: `Model ${modelName} only supports temperature=1. Other values are not allowed.`,
        });
      }
      if (updates.topP !== undefined && updates.topP !== 1) {
        return res.status(400).json({
          success: false,
          error: `Model ${modelName} only supports topP=1. Other values are not allowed.`,
        });
      }
      // Auto-set to required values if not provided
      if (updates.temperature === undefined) {
        updates.temperature = 1;
      }
      if (updates.topP === undefined) {
        updates.topP = 1;
      }
    } else if (isGPT5Model) {
      // GPT-5 models only support temperature=1 and do NOT support topP parameter at all
      if (updates.temperature !== undefined && updates.temperature !== 1) {
        return res.status(400).json({
          success: false,
          error: `Model ${modelName} only supports temperature=1. Other values are not allowed.`,
        });
      }
      // Auto-set temperature to 1 if not provided
      if (updates.temperature === undefined) {
        updates.temperature = 1;
      }
      // Remove topP from updates - not supported by GPT-5
      if (updates.topP !== undefined) {
        console.warn(
          `topP parameter is not supported for ${modelName}, removing from config`
        );
        delete updates.topP;
      }
    }

    // Apply updates
    llmConfig = Object.assign({}, llmConfig, updates);

    // Persist config (excluding API key for security)
    try {
      const configToSave = Object.assign({}, llmConfig);
      delete configToSave.openAIApiKey; // Never save API key to file
      fs.writeFileSync(
        CONFIG_PATH,
        JSON.stringify(configToSave, null, 2),
        "utf8"
      );
    } catch (err) {
      console.error("Failed to persist LLM config:", err);
    }

    // Re-init LLM with new settings
    initLlm();

    const safeConfig = Object.assign({}, llmConfig);
    if (safeConfig.openAIApiKey) delete safeConfig.openAIApiKey;
    res.json({ success: true, config: safeConfig });
  } catch (err) {
    console.error("Failed to update LLM config:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to update config",
    });
  }
});

// Test LLM configuration endpoint
app.post("/api/llm-config/test", express.json(), async (req, res) => {
  try {
    const testConfig = req.body;

    // Validate required fields
    if (!testConfig.modelName) {
      return res.status(400).json({
        success: false,
        error: "Model name is required for testing",
      });
    }

    // Build test LLM config - send EXACTLY what user configured
    const testLlmConfig = {
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: testConfig.modelName,
      streaming: Boolean(testConfig.streaming),
      temperature: Number(testConfig.temperature) || 0.7,
      topP: Number(testConfig.topP) || 1.0,
    };

    console.log("Testing LLM configuration with user settings:", {
      model: testConfig.modelName,
      temperature: testLlmConfig.temperature,
      topP: testLlmConfig.topP,
      streaming: testLlmConfig.streaming,
    });

    // Create a test LLM instance with user's exact configuration
    const testLlm = new ChatOpenAI(testLlmConfig);

    // Test with vision capability (image_url) since this is a home inspection app
    // Use a simple base64 test image (1x1 transparent PNG)
    const testImageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const testMessages = [
      new SystemMessage(
        testConfig.systemPrompt || "You are a helpful assistant."
      ),
      new HumanMessage({
        content: [
          {
            type: "text",
            text: "This is a test. Respond with: 'Configuration test successful - Vision supported'",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${testImageBase64}`,
            },
          },
        ],
      }),
    ];

    // Test the configuration with a timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out after 15 seconds")),
        15000
      )
    );

    // Test based on streaming setting
    let response;
    if (testLlmConfig.streaming) {
      const stream = await Promise.race([
        testLlm.stream(testMessages),
        timeout,
      ]);
      let content = "";
      for await (const chunk of stream) {
        content += chunk.content || "";
      }
      response = { content };
    } else {
      response = await Promise.race([testLlm.invoke(testMessages), timeout]);
    }

    console.log("✅ Test successful for model:", testConfig.modelName);

    // Return actual response from ChatGPT
    res.json({
      success: true,
      message:
        "✅ Configuration is working! Model supports vision (image analysis).",
      response: response.content || response.text || "Test completed",
      config: {
        model: testConfig.modelName,
        temperature: testLlmConfig.temperature,
        topP: testLlmConfig.topP,
        streaming: testLlmConfig.streaming,
      },
    });
  } catch (error) {
    console.error("❌ Test configuration failed:", error);

    // Return the ACTUAL error from OpenAI
    let errorMessage = error.message || "Unknown error occurred";

    // Add helpful context for vision-related errors
    if (
      error.message &&
      error.message.includes("image_url is only supported by certain models")
    ) {
      errorMessage =
        "❌ This model does NOT support vision/image analysis.\n\n" +
        "This app requires image analysis for home inspections. " +
        "Please select a vision-capable model like:\n" +
        "• GPT-4o (recommended)\n" +
        "• GPT-4o-mini\n" +
        "• GPT-4 Turbo with Vision\n" +
        "• GPT-4 Vision Preview\n\n" +
        "Original error: " +
        error.message;
    }

    const errorResponse = {
      success: false,
      error: errorMessage,
      errorType: error.type || "unknown",
      errorCode: error.code || "unknown",
      statusCode: error.status || 500,
      isVisionError: error.message && error.message.includes("image_url"),
    };

    // Add parameter info if available
    if (error.param) {
      errorResponse.parameter = error.param;
    }

    // Include full error details for debugging
    if (error.response?.data) {
      errorResponse.details = error.response.data;
    }

    res.status(error.status || 500).json(errorResponse);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
