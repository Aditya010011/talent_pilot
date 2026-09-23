"use client";

import { useOrg } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { useNewTraining } from "@/components/interview/new-training-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Brain,
  Copy,
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

type Training = {
  id: string;
  title: string;
  description?: string | null;
  isActive?: boolean;
  timeLimitMinutes?: number | null;
  publicSlug?: string | null;
  pregenerated_videos?: unknown;
  updatedAt?: string;
  firstSlideImageUrl?: string | null;
};

export default function CoachingTrainingsPage() {
  const router = useRouter();
  const { currentProject } = useProject();
  const { currentOrg } = useOrg();
  const { openNewTraining } = useNewTraining();
  const { toast } = useToast();
  const isViewer = currentOrg?.role === "VIEWER";
  const isAdmin =
    currentOrg?.role === "SYSTEM_ADMIN" || currentOrg?.role === "ACCOUNT_ADMIN";
  const projectId = currentProject?.id;
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");

  const { data, isLoading } = trpc.training.list.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const deleteMutation = trpc.training.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Training deleted" });
      utils.training.list.invalidate();
    },
    onError: (err) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const trainings: Training[] = (data?.trainings ?? []) as Training[];

  const filtered = trainings.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/c/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!" });
  };

  const handleCardClick = (e: React.MouseEvent, id: string) => {
    if (isViewer) return;
    if ((e.target as HTMLElement).closest("button, a, [role='menuitem']")) {
      return;
    }
    router.push(`/coaching/trainings/${id}/edit`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-6 w-6 text-sky-500" />
            <h1 className="text-3xl font-bold">Trainings</h1>
          </div>
          <p className="text-muted-foreground">
            AI coaching sessions delivered as video — candidates watch and listen.
          </p>
        </div>
        <Button
          className="bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white border-0 shadow-sm"
          onClick={() => {
            if (!isViewer) openNewTraining(projectId);
          }}
          disabled={isViewer}
          title={isViewer ? "Viewer role is read-only" : undefined}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Training
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search trainings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Brain className="mx-auto h-14 w-14 text-sky-500/30" />
            <h3 className="mt-4 text-lg font-semibold">
              {search ? "No trainings match your search" : "No trainings yet"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? "Try a different search term."
                : "Create a training to deliver AI coaching to your team."}
            </p>
            {!isViewer && !search && (
              <Button
                onClick={() => openNewTraining(projectId)}
                className="mt-4 bg-[#1b2a4a] hover:bg-[#15233e] dark:bg-[#152442] dark:hover:bg-[#1d325a] text-white border-0 shadow-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Training
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((training) => (
            <Card
              key={training.id}
              onClick={(e) => handleCardClick(e, training.id)}
              className="flex flex-col h-full hover:shadow-md transition-shadow group cursor-pointer overflow-hidden border border-border"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <CardTitle className="text-lg font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                      {training.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                      {training.description ?? "No description"}
                    </p>
                  </div>
                  {training.firstSlideImageUrl ? (
                    <div className="h-20 w-[min(58%,13.5rem)] shrink-0 overflow-hidden rounded-md bg-muted sm:h-[5.5rem]">
                      <img
                        src={training.firstSlideImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const wrap = e.currentTarget.parentElement;
                          if (wrap) wrap.hidden = true;
                        }}
                      />
                    </div>
                  ) : null}
                  
                  {/* Dropdown Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 shrink-0 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isViewer && (
                        <DropdownMenuItem onClick={() => router.push(`/coaching/trainings/${training.id}/edit`)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {training.publicSlug && (
                        <>
                          <DropdownMenuItem onClick={() => copyLink(training.publicSlug!)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`/c/${training.publicSlug}`, '_blank')}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open Session
                          </DropdownMenuItem>
                        </>
                      )}
                      {!isViewer && isAdmin && (
                        <DropdownMenuItem 
                          className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                          onClick={() => deleteMutation.mutate({ id: training.id })}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="mt-auto pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  {training.timeLimitMinutes && (
                    <Badge variant="outline" className="gap-1 text-xs bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300">
                      <Timer className="h-3.5 w-3.5" />
                      {training.timeLimitMinutes}m
                    </Badge>
                  )}
                  {(training as any).pregenerated_videos && (
                    <Badge variant="outline" className="gap-1 text-xs bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300">
                      <Video className="h-3.5 w-3.5" />
                      Videos
                    </Badge>
                  )}
                  <Badge
                    variant={training.isActive ? "outline" : "secondary"}
                    className={`text-xs ${training.isActive ? "border-sky-400 text-sky-600 bg-sky-50 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300" : ""}`}
                  >
                    {training.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
