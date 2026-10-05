import https from 'node:https';
import { config } from '../config.js';
import { ReportGenerationError } from './generator.js';

const systemPrompt = '你是个人信息保护影响评估报告助手，请用中文给出专业、可落地、适合放入正式评估报告的建议。';

export async function askDeepSeek(prompt: string): Promise<string> {
  const apiKey = config.deepseek.apiKey;
  if (!apiKey) throw new ReportGenerationError('未配置 DeepSeek API Key', 503);

  const body = JSON.stringify({
    model: config.deepseek.model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
    thinking: { type: 'enabled' },
    reasoning_effort: 'high',
    stream: false,
  });

  return new Promise<string>((resolve, reject) => {
    const request = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          request.destroy(new Error('DeepSeek response too large'));
        } else {
          chunks.push(chunk);
        }
      });
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new ReportGenerationError(`DeepSeek 请求失败 (${response.statusCode ?? 'unknown'})`, 502));
          return;
        }
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            choices?: { message?: { content?: unknown } }[];
          };
          const content = result.choices?.[0]?.message?.content;
          if (typeof content !== 'string') throw new Error('Missing message content');
          resolve(content);
        } catch {
          reject(new ReportGenerationError('DeepSeek 返回了无效响应', 502));
        }
      });
      response.on('error', reject);
    });
    request.setTimeout(config.deepseek.timeoutMs, () => request.destroy(new Error('DeepSeek timeout')));
    request.on('error', () => reject(new ReportGenerationError('DeepSeek 请求失败或超时', 502)));
    request.end(body);
  });
}
