import fs from "node:fs";
import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
import { EventSource } from "eventsource";

function normalizeBaseUrl(hostUrl: string): string {
  const trimmed = hostUrl.replace(/\/+$/, "");
  return `${trimmed}/api/v1`;
}

type AnyObject = Record<string, unknown>;
type WhisperXParams = {
  model?: string;
  language?: string;
  device?: string;
  compute_type?: string;
};

export type TranscriptionProfile = {
  id?: string;
  name?: string;
  is_default?: boolean;
  parameters?: WhisperXParams;
};

export type TranscriptionResult = {
  id: string;
  transcript: string;
  status: unknown;
  transcriptPayload?: unknown;
};

export class ScriberrClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private apiToken: string;

  constructor(opts: { hostUrl: string; apiToken: string }) {
    this.baseUrl = normalizeBaseUrl(opts.hostUrl);
    this.apiToken = opts.apiToken;
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 60_000,
      headers: {
        "X-API-Key": opts.apiToken,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  async waitForTranscriptSse(opts: { id: string; timeoutMs: number }): Promise<void> {
    const url = `${this.baseUrl}/events/?job_id=${encodeURIComponent(opts.id)}`;

    await new Promise<void>((resolve, reject) => {
      const es = new EventSource(url, {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...init.headers,
              "X-API-Key": this.apiToken,
            },
          }),
      });

      const timeout = setTimeout(() => {
        es.close();
        reject(
          new Error(`Timed out waiting for SSE job update (${opts.id}) after ${opts.timeoutMs}ms`),
        );
      }, opts.timeoutMs);

      function cleanup() {
        clearTimeout(timeout);
        es.close();
      }

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(String(evt.data)) as AnyObject;
          if (data.type === "job_update") {
            const payload = (data.payload ?? {}) as AnyObject;
            const jobId = payload.job_id as string | undefined;
            const status = payload.status as string | undefined;
            if (jobId !== opts.id) return;
            if (status === "completed") {
              cleanup();
              resolve();
            }
            if (status === "failed") {
              cleanup();
              reject(
                new Error(`Transcription failed (${opts.id}) via SSE: ${JSON.stringify(payload)}`),
              );
            }
          }
        } catch (_e) {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        cleanup();
        reject(new Error("SSE connection error"));
      };
    });
  }

  async submitTranscriptionJob(opts: {
    filePath: string;
    filename: string;
    title?: string;
    model?: string;
    language?: string;
    device?: string;
    compute_type?: string;
  }): Promise<{ id: string; raw: unknown }> {
    const form = new FormData();
    // Per Scriberr Swagger, /transcription/submit expects the file in `audio`.
    form.append("audio", fs.createReadStream(opts.filePath), opts.filename);
    if (opts.title) form.append("title", opts.title);
    if (opts.model) form.append("model", opts.model);
    if (opts.language) form.append("language", opts.language);
    if (opts.device) form.append("device", opts.device);
    if (opts.compute_type) form.append("compute_type", opts.compute_type);

    const res = await this.http.post("/transcription/submit", form, {
      headers: form.getHeaders(),
    });

    const data: AnyObject = (res.data ?? {}) as AnyObject;
    const id = (data.id ?? data.transcription_id ?? data.job_id) as string | undefined;
    if (!id) {
      throw new Error(`Unexpected /transcription/submit response: ${JSON.stringify(data)}`);
    }
    return { id, raw: data };
  }

  async listProfiles(): Promise<TranscriptionProfile[]> {
    const res = await this.http.get("/profiles");
    const data = res.data;
    return Array.isArray(data) ? (data as TranscriptionProfile[]) : [];
  }

  async getTranscript(id: string): Promise<{ transcript: { text: string } }> {
    const res = await this.http.get(`/transcription/${encodeURIComponent(id)}/transcript`);
    return res.data;
  }
}
