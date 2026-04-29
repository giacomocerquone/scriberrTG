import fs from "node:fs";
import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";

function normalizeBaseUrl(hostUrl: string): string {
  const trimmed = hostUrl.replace(/\/+$/, "");
  return `${trimmed}/api/v1`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

type JobStatus = "uploaded" | "pending" | "processing" | "completed" | "failed";

export class ScriberrClient {
  private http: AxiosInstance;

  constructor(opts: { hostUrl: string; apiToken: string }) {
    this.http = axios.create({
      baseURL: normalizeBaseUrl(opts.hostUrl),
      timeout: 60_000,
      headers: {
        Authorization: `Bearer ${opts.apiToken}`,
        "X-API-Key": opts.apiToken,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
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

  async getJobStatus(id: string): Promise<unknown> {
    const res = await this.http.get(`/transcription/${encodeURIComponent(id)}/status`);
    return res.data;
  }

  async getTranscript(id: string): Promise<unknown> {
    const res = await this.http.get(`/transcription/${encodeURIComponent(id)}/transcript`);
    return res.data;
  }

  async waitForTranscript(opts: {
    id: string;
    pollIntervalMs: number;
    pollTimeoutMs: number;
  }): Promise<TranscriptionResult> {
    const started = Date.now();
    while (true) {
      if (Date.now() - started > opts.pollTimeoutMs) {
        throw new Error(
          `Timed out waiting for transcription (${opts.id}) after ${opts.pollTimeoutMs}ms`,
        );
      }

      let status: unknown;
      try {
        status = await this.getJobStatus(opts.id);
      } catch (e: unknown) {
        const maybeAxios = e as { response?: { status?: number } } | null;
        const code = maybeAxios?.response?.status;
        if (code === 404) {
          await sleep(opts.pollIntervalMs);
          continue;
        }
        throw e;
      }

      const st = status as AnyObject;
      const state = (st.status as unknown) ?? (st.state as unknown) ?? (st.job_status as unknown);
      const normalized = (typeof state === "string" ? state.toLowerCase() : state) as
        | JobStatus
        | unknown;

      if (normalized === "failed") {
        throw new Error(`Transcription failed (${opts.id}): ${JSON.stringify(status)}`);
      }

      if (normalized === "completed") {
        const embedded = st.transcript as unknown;
        if (typeof embedded === "string" && embedded.trim())
          return { id: opts.id, transcript: embedded, status };
        try {
          const transcriptPayload = await this.getTranscript(opts.id);
          const tp = transcriptPayload as AnyObject;
          const text =
            (tp.text as unknown) ??
            (tp.transcript as unknown) ??
            (tp.result as unknown) ??
            ((tp.data as AnyObject | undefined)?.text as unknown);

          if (typeof text === "string" && text.trim()) {
            return { id: opts.id, transcript: text, status, transcriptPayload };
          }
          return {
            id: opts.id,
            transcript: JSON.stringify(transcriptPayload),
            status,
            transcriptPayload,
          };
        } catch {
          return { id: opts.id, transcript: JSON.stringify(status), status };
        }
      }

      await sleep(opts.pollIntervalMs);
    }
  }
}
