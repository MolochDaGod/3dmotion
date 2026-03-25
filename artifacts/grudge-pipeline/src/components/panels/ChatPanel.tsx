import { useState, useRef, useEffect } from "react";
import { Bot, Terminal, Send, Zap, ChevronRight } from "lucide-react";
import { Panel, PanelHeader, Button, Textarea, cn } from "../ui/cyber-ui";
import { useMeshyChat } from "../../hooks/use-meshy";
import { usePipelineStore } from "../../store/use-pipeline-store";
import type { ChatMessage } from "../../types/api";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'SYS.INIT // Grudge Pipeline Prompt Optimizer Online.\n\nDescribe the character you want to generate. I will optimize parameters for the Meshy Text-to-3D API (T-Pose, polycounts, topology) suitable for game rigging.' }
  ]);
  const [input, setInput] = useState("");
  
  const chatMutation = useMeshyChat();
  const setSuggestedConfig = usePipelineStore((s) => s.setSuggestedConfig);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    
    const newMsg: ChatMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput("");

    chatMutation.mutate({ messages: updatedMessages }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        if (data.extractedPrompt) {
          setSuggestedConfig(data.extractedPrompt, data.extractedParams);
        }
      }
    });
  };

  return (
    <Panel className="h-full scanline">
      <PanelHeader title="AI LOG" icon={Terminal} />
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm"
      >
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
            <div className={cn(
              "max-w-[85%] p-3 rounded-md border",
              msg.role === 'user' 
                ? "bg-primary/5 border-primary/30 text-primary-50" 
                : "bg-secondary/5 border-secondary/30 text-foreground"
            )}>
              <div className="flex items-center gap-2 mb-1 text-xs opacity-50 uppercase tracking-widest">
                {msg.role === 'user' ? (
                  <>USER_INPUT <ChevronRight className="w-3 h-3" /></>
                ) : (
                  <><Bot className="w-3 h-3" /> SYS_RESPONSE</>
                )}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex items-start">
            <div className="max-w-[85%] p-3 rounded-md border bg-secondary/5 border-secondary/30 text-secondary animate-pulse">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4" /> Processing query...
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-panel-border bg-black/40">
        {usePipelineStore.getState().suggestedPrompt && (
           <Button 
             variant="secondary" 
             className="w-full mb-3 text-xs"
             onClick={() => document.getElementById('preview-prompt')?.focus()}
           >
             <Zap className="w-3 h-3 mr-1" /> Use Optimized Prompt
           </Button>
        )}
        <div className="relative">
          <Textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="E.g. A cyberpunk ninja with a glowing katana..."
            className="min-h-[60px] pb-10"
          />
          <Button 
            variant="primary" 
            size="sm"
            className="absolute bottom-2 right-2 px-2 py-1 h-auto text-xs"
            onClick={handleSend}
            isLoading={chatMutation.isPending}
          >
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </Panel>
  );
}
