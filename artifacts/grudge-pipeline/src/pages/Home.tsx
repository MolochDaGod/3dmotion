import { AlertTriangle } from "lucide-react";
import { ChatPanel } from "../components/panels/ChatPanel";
import { PipelinePanel } from "../components/panels/PipelinePanel";
import { SkeletonPanel } from "../components/panels/SkeletonPanel";

export default function Home() {
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      {/* Top Banner */}
      <div className="bg-warning/20 border-b border-warning/50 px-4 py-1.5 flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <span className="text-xs font-mono font-bold text-warning tracking-widest">
          TEST MODE ACTIVE - DEVELOPMENT ENV - API CALLS MOCKED IF NOT PROVISIONED
        </span>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0">
        <div className="w-full md:w-1/4 h-full min-w-[300px]">
          <ChatPanel />
        </div>
        
        <div className="w-full md:w-1/2 h-full">
          <PipelinePanel />
        </div>
        
        <div className="w-full md:w-1/4 h-full min-w-[300px]">
          <SkeletonPanel />
        </div>
      </div>
    </div>
  );
}
