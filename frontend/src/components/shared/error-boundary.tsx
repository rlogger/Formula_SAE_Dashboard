"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = "/";
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
                    <div className="mb-6 rounded-full bg-destructive/10 p-4 text-destructive">
                        <AlertCircle size={48} />
                    </div>
                    <h1 className="mb-2 text-2xl font-bold tracking-tight">Something went wrong</h1>
                    <p className="mb-8 max-w-md text-muted-foreground">
                        An unexpected error occurred in the dashboard. We&apos;ve been notified and are looking into it.
                    </p>
                    <div className="flex gap-4">
                        <Button onClick={this.handleReset} variant="outline" className="gap-2">
                            <RefreshCcw size={16} />
                            Reload Application
                        </Button>
                        <Button onClick={() => window.location.reload()} className="gap-2">
                            Try Again
                        </Button>
                    </div>
                    {process.env.NODE_ENV === "development" && (
                        <div className="mt-8 max-w-2xl overflow-auto rounded-lg bg-muted p-4 text-left text-xs font-mono">
                            <p className="mb-2 font-bold text-destructive">{this.state.error?.toString()}</p>
                            <pre>{this.state.error?.stack}</pre>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
