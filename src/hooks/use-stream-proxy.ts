"use client";

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface StreamMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
  metrics?: {
    tokens?: number;
    cost?: number;
    duration?: number;
  };
}

type StreamState = "idle" | "streaming" | "done" | "error";

interface StreamParams {
  tenantId: string;
  clientId?: string | null;
  model: string;
  temperature: number;
  additionalPrompts?: string[];
}

export function useStreamProxy(params: StreamParams) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [state, setState] = useState<StreamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (userPrompt: string) => {
      setError(null);
      setState("streaming");

      // Add user message
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userPrompt },
      ]);

      // Add empty assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", model: params.model },
      ]);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No session");

        const controller = new AbortController();
        abortRef.current = controller;

        const searchParams = new URLSearchParams({
          tenantId: params.tenantId,
          model: params.model,
          temperature: params.temperature.toString(),
          userPrompt,
        });

        if (params.clientId) {
          searchParams.set("clientId", params.clientId);
        }

        if (params.additionalPrompts) {
          searchParams.set("additionalPrompts", JSON.stringify(params.additionalPrompts));
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/stream-proxy?${searchParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Stream failed" }));
          throw new Error(errorData.error || `Stream failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                setState("done");
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.error) {
                  setError(parsed.error);
                  setState("error");
                  return;
                }

                // Append token to last assistant message
                const token = parsed.choices?.[0]?.delta?.content || parsed.content || "";
                if (token) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + token,
                      };
                    }
                    return updated;
                  });
                }

                // Handle metrics
                if (parsed.metrics) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        metrics: parsed.metrics,
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // Not JSON, treat as raw text token
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data,
                    };
                  }
                  return updated;
                });
              }
            }

            if (line.startsWith("event: error")) {
              setError("Stream error");
              setState("error");
              return;
            }
          }
        }

        setState("done");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Stream failed");
        setState("error");
      }
    },
    [params]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setState("idle");
    setError(null);
  }, []);

  return { messages, state, error, send, reset, isStreaming: state === "streaming" };
}
