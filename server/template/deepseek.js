// DEEPSEEK_API_KEY=your_key node deepseek.js "Hello"

const https = require("https");

const API_HOST = "api.deepseek.com";
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-pro";

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input.trim()));
    process.stdin.on("error", reject);
  });
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let responseBody = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        let parsedBody;

        try {
          parsedBody = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          reject(new Error(`DeepSeek returned invalid JSON: ${responseBody}`));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = parsedBody.error && parsedBody.error.message
            ? parsedBody.error.message
            : responseBody;

          reject(new Error(`DeepSeek API error ${response.statusCode}: ${message}`));
          return;
        }

        resolve(parsedBody);
      });
    });

    request.on("error", reject);
    request.write(JSON.stringify(body));
    request.end();
  });
}

async function createDeepSeekChatCompletion({
  apiKey = process.env.DEEPSEEK_API_KEY,
  model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  messages,
  thinking = { type: "enabled" },
  reasoningEffort = "high",
  temperature,
  maxTokens
}) {
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY environment variable.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }

  const body = {
    model,
    messages,
    thinking,
    reasoning_effort: reasoningEffort,
    stream: false
  };

  if (typeof temperature !== "undefined") {
    body.temperature = temperature;
  }

  if (typeof maxTokens !== "undefined") {
    body.max_tokens = maxTokens;
  }

  return requestJson({
    hostname: API_HOST,
    path: CHAT_COMPLETIONS_PATH,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    }
  }, body);
}

async function askDeepSeek(prompt, options = {}) {
  const response = await createDeepSeekChatCompletion({
    ...options,
    messages: [
      {
        role: "system",
        content: options.systemPrompt || "You are a helpful assistant."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return response.choices[0].message.content;
}

function printUsage() {
  console.log("Usage:");
  console.log("  DEEPSEEK_API_KEY=your_key node deepseek.js \"Your question\"");
  console.log("  echo \"Your question\" | DEEPSEEK_API_KEY=your_key node deepseek.js");
  console.log("");
  console.log("Environment:");
  console.log(`  DEEPSEEK_MODEL defaults to ${DEFAULT_MODEL}`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const promptFromArgs = process.argv.slice(2).join(" ").trim();
  const prompt = promptFromArgs || await readStdin();

  if (!prompt) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const answer = await askDeepSeek(prompt);
  console.log(answer);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  askDeepSeek,
  createDeepSeekChatCompletion
};
