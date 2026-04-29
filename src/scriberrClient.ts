import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "node:fs";

function normalizeBaseUrl(hostUrl: string): string {
  const trimmed = hostUrl.replace(/\/+$/, "");
  return `${trimmed}/api/v1`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type AnyObject = Record<string, unknown>;

export type TranscriptionResult = {
  id: string;
  transcript: string;
  status: unknown;
  transcriptPayload?: unknown;
};

export class ScriberrClient {
  private http: AxiosInstance;

  constructor(opts: { hostUrl: string; apiToken: string }) {
    this.http = axios.create({
      baseURL: normalizeBaseUrl(opts.hostUrl),
      timeout: 60_000,
      headers: {
        Authorization: `Bearer ${opts.apiToken}`,
        "X-API-Key": opts.apiToken
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
  }

  async submitQuickTranscription(opts: { filePath: string; filename: string }): Promise<{ id: string; raw: unknown }> {
    const form = new FormData();
    form.append("file", fs.createReadStream(opts.filePath), opts.filename);

    const res = await this.http.post("/transcription/quick", form, {
      headers: form.getHeaders()
    });

    const data: AnyObject = (res.data ?? {}) as AnyObject;
    const id = (data.id ?? data.transcription_id ?? data.job_id) as string | undefined;
    if (!id) {
      throw new Error(`Unexpected /transcription/quick response: ${JSON.stringify(data)}`);
    }
    return { id, raw: data };
  }

  async getQuickStatus(id: string): Promise<unknown> {
    const res = await this.http.get(`/transcription/quick/${encodeURIComponent(id)}`);
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
        throw new Error(`Timed out waiting for transcription (${opts.id}) after ${opts.pollTimeoutMs}ms`);
      }

      let status: unknown;
      try {
        status = await this.getQuickStatus(opts.id);
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
      const progress = (st.progress ?? {}) as AnyObject;
      const state =
        (st.status as unknown) ??
        (st.state as unknown) ??
        (st.job_status as unknown) ??
        (st.phase as unknown) ??
        (progress.status as unknown);

      const normalized = typeof state === "string" ? state.toLowerCase() : state;

      if (normalized === "failed" || normalized === "error" || normalized === "cancelled") {
        throw new Error(`Transcription failed (${opts.id}): ${JSON.stringify(status)}`);
      }

      if (normalized === "completed" || normalized === "done" || normalized === "finished") {
        const embedded =
          (st.transcript as unknown) ??
          (st.text as unknown) ??
          (st.result as unknown) ??
          ((st.data as AnyObject | undefined)?.transcript as unknown) ??
          ((st.data as AnyObject | undefined)?.text as unknown);

        if (typeof embedded === "string" && embedded.trim()) {
          return { id: opts.id, transcript: embedded, status };
        }

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
            transcriptPayload
          };
        } catch {
          return { id: opts.id, transcript: JSON.stringify(status), status };
        }
      }

      await sleep(opts.pollIntervalMs);
    }
  }
}

