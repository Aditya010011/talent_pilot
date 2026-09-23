"use client";

import { useAppLocale } from "@/components/app-locale-provider";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { copyToClipboard } from "@/lib/utils";
import { Ban, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function maskApiKey(key: string) {
  const prefix = "dlv_";
  if (!key.startsWith(prefix)) {
    return `${key.slice(0, 8)}...`;
  }
  const secret = key.slice(prefix.length);
  return `${prefix}${secret.slice(0, 8)}...`;
}

function formatDate(value: string | null, locale: string, neverLabel: string) {
  if (!value) return neverLabel;
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : undefined);
}

export default function ApiKeysSettingsPage() {
  const { toast } = useToast();
  const { locale, t } = useAppLocale();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [expiresLocal, setExpiresLocal] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const listQuery = trpc.apiKey.list.useQuery();

  const createMutation = trpc.apiKey.create.useMutation({
    onSuccess: (data) => {
      setRevealedKey(data.key);
      setName("");
      setExpiresLocal("");
      utils.apiKey.list.invalidate();
      toast({
        title: t("settings.apiKeys.createdSuccess"),
      });
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const revokeMutation = trpc.apiKey.revoke.useMutation({
    onSuccess: () => {
      utils.apiKey.list.invalidate();
      toast({ title: t("settings.apiKeys.revokedSuccess") });
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = trpc.apiKey.delete.useMutation({
    onSuccess: () => {
      utils.apiKey.list.invalidate();
      toast({ title: t("settings.apiKeys.deletedSuccess") });
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const copyKey = async (key: string) => {
    try {
      await copyToClipboard(key);
      toast({ title: t("settings.apiKeys.copied") });
    } catch {
      toast({
        title: t("settings.apiKeys.copyFailed"),
        variant: "destructive",
      });
    }
  };

  const keys = listQuery.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold">{t("settings.apiKeys.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.apiKeys.subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.apiKeys.createTitle")}</CardTitle>
          <CardDescription>
            {t("settings.apiKeys.distinctNameDesc") || t("settings.apiKeys.createDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2 flex-1">
              <Label htmlFor="keyName">{t("settings.apiKeys.name") || t("settings.orgs.name") || "Name"}</Label>
              <Input
                id="keyName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={locale === "zh" ? "例如：生产环境 CI" : locale === "ko" ? "예: 엔지니어링 채용 Q1" : "e.g. Production CI"}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="keyExpires">{t("teamManagement.expireDate")}</Label>
              <Input
                id="keyExpires"
                type="datetime-local"
                value={expiresLocal}
                onChange={(e) => setExpiresLocal(e.target.value)}
              />
            </div>
            <Button
              className="shrink-0"
              disabled={createMutation.isPending || !name.trim()}
              onClick={() => {
                const expiresAt =
                  expiresLocal.trim() === ""
                    ? undefined
                    : new Date(expiresLocal).toISOString();
                createMutation.mutate({
                  name: name.trim(),
                  ...(expiresAt ? { expiresAt } : {}),
                });
              }}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.apiKeys.createBtn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={revealedKey !== null}
        onOpenChange={(open) => {
          if (!open) setRevealedKey(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("settings.apiKeys.saveTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.apiKeys.saveDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 font-mono text-sm break-all">
            {revealedKey}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => revealedKey && copyKey(revealedKey)}>
              <Copy className="mr-2 h-4 w-4" />
              {t("settings.apiKeys.copy")}
            </Button>
            <Button type="button" onClick={() => setRevealedKey(null)}>
              {t("settings.apiKeys.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.apiKeys.yourKeys")}</CardTitle>
          <CardDescription>
            {t("settings.apiKeys.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-12 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : keys.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              <p>
                {t("settings.apiKeys.noKeys")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.apiKeys.name") || t("settings.orgs.name") || "Name"}</TableHead>
                  <TableHead>{t("settings.apiKeys.title").slice(0, -1) || "Key"}</TableHead>
                  <TableHead>{t("results.status")}</TableHead>
                  <TableHead>{t("settings.apiKeys.lastUsed") || "Last used"}</TableHead>
                  <TableHead>{t("results.date") || "Created"}</TableHead>
                  <TableHead className="w-[1%] text-right">{t("settings.members.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {maskApiKey(row.key)}
                    </TableCell>
                    <TableCell>
                      {row.isActive ? (
                        <Badge variant="default">{t("settings.apiKeys.active")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("settings.apiKeys.revoked")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.lastUsedAt, locale, t("settings.apiKeys.never"))}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.createdAt, locale, "—")}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t("settings.apiKeys.copyFull")}
                          onClick={() => copyKey(row.key)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {row.isActive && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                title={t("settings.apiKeys.revoke")}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("settings.apiKeys.revokeConfirm")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("settings.apiKeys.revokeDesc")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => revokeMutation.mutate({ id: row.id })}
                                  disabled={revokeMutation.isPending}
                                >
                                  {t("settings.apiKeys.revoke")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title={t("settings.apiKeys.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("settings.apiKeys.deleteConfirm")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("settings.apiKeys.deleteDesc")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate({ id: row.id })}
                                disabled={deleteMutation.isPending}
                              >
                                {t("settings.apiKeys.delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
