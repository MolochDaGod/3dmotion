import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Panel = React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(
  ({ className, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(
        "bg-panel border border-panel-border rounded-xl overflow-hidden flex flex-col relative",
        "shadow-lg shadow-black/50 backdrop-blur-md",
        className
      )}
      {...props}
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-panel-border to-transparent opacity-50" />
      {children}
    </motion.div>
  )
);
Panel.displayName = "Panel";

export const PanelHeader = ({ title, icon: Icon, right }: { title: string, icon?: any, right?: React.ReactNode }) => (
  <div className="px-4 py-3 border-b border-panel-border bg-black/20 flex items-center justify-between">
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-primary" />}
      <h2 className="text-sm font-bold text-foreground tracking-widest">{title}</h2>
    </div>
    {right}
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", isLoading, children, disabled, ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold font-mono tracking-wide uppercase transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
    const variants = {
      primary: "bg-primary-dim text-primary border border-primary/50 hover:bg-primary/20 hover:glow-border-primary",
      secondary: "bg-secondary-dim text-secondary border border-secondary/50 hover:bg-secondary/20 hover:glow-box-secondary",
      outline: "bg-transparent text-foreground border border-panel-border hover:border-muted hover:bg-white/5",
      ghost: "bg-transparent text-muted hover:text-foreground hover:bg-white/5",
      danger: "bg-destructive/10 text-destructive border border-destructive/50 hover:bg-destructive/20",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(base, variants[variant], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex w-full bg-black/40 border border-panel-border px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted/50",
        "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full min-h-[80px] bg-black/40 border border-panel-border px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted/50 resize-y",
        "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Label = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <label className={cn("text-xs font-semibold tracking-wider text-muted uppercase mb-1.5 block", className)}>
    {children}
  </label>
);

export const Badge = ({ children, status = "default" }: { children: React.ReactNode, status?: "default" | "success" | "warning" | "error" }) => {
  const colors = {
    default: "bg-white/10 text-muted border-panel-border",
    success: "bg-primary-dim text-primary border-primary/30 glow-text-primary",
    warning: "bg-warning/10 text-warning border-warning/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span className={cn("px-2 py-0.5 text-[10px] font-mono border rounded-sm", colors[status])}>
      {children}
    </span>
  );
};

export const ProgressBar = ({ progress, status }: { progress: number, status?: string }) => {
  const isError = status === 'FAILED';
  const isSuccess = status === 'SUCCEEDED';
  
  return (
    <div className="w-full h-1.5 bg-black/50 overflow-hidden relative border-y border-panel-border/50">
      <motion.div 
        className={cn(
          "h-full relative",
          isError ? "bg-destructive" : isSuccess ? "bg-primary" : "bg-accent"
        )}
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5 }}
      >
        {!isSuccess && !isError && (
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9InRyYW5zcGFyZW50Ii8+PGxpbmUgeDE9IjAiIHkxPSI0IiB4Mj0iNCIgeTI9IjAiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')] opacity-50 animate-[slide_1s_linear_infinite]" />
        )}
      </motion.div>
    </div>
  );
};
