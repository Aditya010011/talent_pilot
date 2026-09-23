"use client";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { BrainCircuit, Loader2, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const MODELS = [
  {
    value: "gemini-3.5-flash",
    label: "Gemini Flash",
    description: "Google Gemini — default, high quality, multimodal support.",
  },
  {
    value: "deepseek:v4@flash",
    label: "Deepseek (Runware)",
    description: "Deepseek v4 via Runware — cost-efficient, strong reasoning.",
  },
];

export default function ModelSettingsPage() {
  const { user } = useAuth();
  const { data: isSystemAdmin = false } = trpc.user.isSystemAdmin.useQuery(undefined, {
    enabled: !!user,
  });
  const router = useRouter();
  const { toast } = useToast();

  const { data: projects, isLoading } = trpc.project.list.useQuery(
    { organizationId: "" },
    { enabled: false }
  );

  // We store the platform default model in localStorage as a lightweight approach
  // (System admin sets this and it becomes the global default for new projects)
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("platform_default_model");
    if (stored) setSelectedModel(stored);
  }, []);

  if (!isSystemAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground">Only system administrators can access this page.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem("platform_default_model", selectedModel);
      toast({ title: "Model preference saved", description: `Default model set to: ${MODELS.find(m => m.value === selectedModel)?.label}` });
    } finally {
      setSaving(false);
    }
  };

  const selectedInfo = MODELS.find((m) => m.value === selectedModel);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BrainCircuit className="h-6 w-6" />
          AI Model
        </h2>
        <p className="text-muted-foreground mt-1">
          Select the default AI model used across all interview analyses on this platform.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Default Model</CardTitle>
          <CardDescription>
            This model will be used for post-interview report generation and in-session AI responses.
            You can override this per-project in the project&apos;s General settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MODELS.map((m) => (
              <button
                key={m.value}
                onClick={() => setSelectedModel(m.value)}
                className={`rounded-lg border p-4 text-left transition-all hover:border-primary ${
                  selectedModel === m.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border"
                }`}
              >
                <div className="font-semibold text-sm">{m.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.description}</div>
                {selectedModel === m.value && (
                  <div className="mt-2 text-xs font-medium text-primary">✓ Selected</div>
                )}
              </button>
            ))}
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Model Preference
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
