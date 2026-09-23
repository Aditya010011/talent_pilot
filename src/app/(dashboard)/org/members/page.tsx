"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, LogOut, Pencil } from "lucide-react";

export default function MembersPage() {
  const { toast } = useToast();
  const { locale, t } = useAppLocale();
  const { currentOrg } = useOrg();
  useAuth();
  const utils = trpc.useUtils();
  const roleLabel = (role: "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER") => {
    switch (role) {
      case "SYSTEM_ADMIN": return t("teamManagement.systemAdmin");
      case "ACCOUNT_ADMIN": return t("teamManagement.accountAdmin");
      case "EDITOR": return t("teamManagement.editor");
      case "VIEWER": return t("teamManagement.viewer");
      default: return role;
    }
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ACCOUNT_ADMIN" | "EDITOR" | "VIEWER">(
    "EDITOR",
  );
  const [editingRoleUserId, setEditingRoleUserId] = useState<string | null>(
    null,
  );

  const membersQuery = trpc.orgMember.list.useQuery(
    { organizationId: currentOrg?.id ?? "" },
    { enabled: !!currentOrg },
  );

  const inviteMutation = trpc.orgMember.invite.useMutation({
    onSuccess: () => {
      toast({ title: t("org.members.invitedSuccess") });
      setInviteOpen(false);
      setInviteEmail("");
      utils.orgMember.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = trpc.orgMember.updateRole.useMutation({
    onSuccess: () => {
      toast({ title: t("org.members.updatedSuccess") });
      setEditingRoleUserId(null);
      utils.orgMember.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const removeMutation = trpc.orgMember.remove.useMutation({
    onSuccess: () => {
      toast({ title: t("org.members.removedSuccess") });
      utils.orgMember.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const leaveMutation = trpc.orgMember.leave.useMutation({
    onSuccess: () => {
      toast({ title: t("org.members.leftSuccess") });
      utils.organization.list.invalidate();
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t("org.members.noOrgSelected")}
      </div>
    );
  }

  const isOwner = currentOrg.role === "SYSTEM_ADMIN";
  const isAdmin = isOwner || currentOrg.role === "ACCOUNT_ADMIN";
  const members = membersQuery.data ?? [];

  const roleVariant = (role: string) => {
    switch (role) {
      case "SYSTEM_ADMIN":
        return "default";
      case "ACCOUNT_ADMIN":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {t("org.members.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("org.members.subtitle", { orgName: currentOrg.name })}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("org.members.invite")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("org.members.invite")}</DialogTitle>
                <DialogDescription>
                  {t("org.members.inviteDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{t("teamManagement.email")}</Label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("teamManagement.role")}</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACCOUNT_ADMIN">
                        {t("teamManagement.accountAdmin")}
                      </SelectItem>
                      <SelectItem value="EDITOR">
                        {t("teamManagement.editor")}
                      </SelectItem>
                      <SelectItem value="VIEWER">
                        {t("teamManagement.viewer")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() =>
                    inviteMutation.mutate({
                      organizationId: currentOrg.id,
                      email: inviteEmail,
                      role: inviteRole,
                    })
                  }
                  disabled={
                    inviteMutation.isPending || !inviteEmail.includes("@")
                  }
                >
                  {inviteMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("org.members.invite").split(" ")[0]}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("org.members.invite").replace(" Invite", "") || t("settings.orgs.members") || "Member"}</TableHead>
                <TableHead>{t("teamManagement.role")}</TableHead>
                <TableHead>{t("settings.members.joined")}</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const profileInitials =
                  m.profile?.name
                    ?.split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase() ?? "?";

                return (
                  <TableRow key={m.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={m.profile?.avatar ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {profileInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {m.profile?.name ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.profile?.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingRoleUserId === m.userId && m.role !== "SYSTEM_ADMIN" ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) =>
                            updateRoleMutation.mutate({
                              organizationId: currentOrg.id,
                              userId: m.userId,
                              role: v as "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER",
                            })
                          }
                          onOpenChange={(open) => {
                            if (!open) setEditingRoleUserId(null);
                          }}
                          defaultOpen
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {isOwner && (
                              <SelectItem value="ACCOUNT_ADMIN">
                                {t("teamManagement.accountAdmin")}
                              </SelectItem>
                            )}
                            <SelectItem value="EDITOR">
                              {t("teamManagement.editor")}
                            </SelectItem>
                            <SelectItem value="VIEWER">
                              {t("teamManagement.viewer")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Badge variant={roleVariant(m.role)}>
                            {roleLabel(
                              m.role as "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER",
                            )}
                          </Badge>
                          {isAdmin && m.role !== "SYSTEM_ADMIN" && (
                            <button
                              onClick={() => setEditingRoleUserId(m.userId)}
                              className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {m.role !== "SYSTEM_ADMIN" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("org.members.removeConfirm")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("org.members.removeMemberConfirm", {
                                    name: m.profile?.name ?? m.profile?.email,
                                    orgName: currentOrg.name
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("common.cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() =>
                                    removeMutation.mutate({
                                      organizationId: currentOrg.id,
                                      userId: m.userId,
                                    })
                                  }
                                >
                                  {t("common.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isAdmin && currentOrg.role !== "SYSTEM_ADMIN" && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={leaveMutation.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("org.members.leaveConfirm")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("org.members.leaveConfirm")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("org.members.leaveDesc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    leaveMutation.mutate({
                      organizationId: currentOrg.id,
                    })
                  }
                >
                  {leaveMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("org.members.leaveConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
