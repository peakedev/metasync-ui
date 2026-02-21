"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import { useStreamProxy } from "@/hooks/use-stream-proxy";
import { useMetaSyncProxy } from "@/hooks/use-metasync-proxy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";

interface Model { _id: string; name: string; }

export default function ChatPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { data: tenant } = useTenant(tenantSlug);
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: models } = useMetaSyncProxy<Model[]>({ path: "/models", tenantSlug });
  const { messages, state, error, send, isStreaming } = useStreamProxy({ tenantId: tenant?.id || "", model, temperature });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function handleSend() {
    if (!input.trim() || !model || isStreaming) return;
    setStarted(true);
    send(input.trim());
    setInput("");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {!started && (
        <div className="flex gap-4 p-4 border-b">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select model" /></SelectTrigger>
            <SelectContent>{(models || []).map(m => <SelectItem key={m._id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Temp:</span>
            <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-20" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[70%] rounded-lg p-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {msg.role === "assistant" && <p className="text-xs text-muted-foreground mb-1">{msg.model}</p>}
              <p className="text-sm whitespace-pre-wrap">{msg.content}{isStreaming && i === messages.length - 1 && msg.role === "assistant" ? "▊" : ""}</p>
              {msg.metrics && (
                <div className="mt-2 flex gap-3 text-xs text-muted-foreground border-t pt-2">
                  {msg.metrics.tokens && <span>{msg.metrics.tokens} tokens</span>}
                  {msg.metrics.cost && <span>${msg.metrics.cost.toFixed(4)}</span>}
                  {msg.metrics.duration && <span>{msg.metrics.duration}ms</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {error && (
          <div className="flex justify-start"><div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." disabled={isStreaming || !model} className="flex-1" />
          <Button type="submit" disabled={isStreaming || !input.trim() || !model}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}
