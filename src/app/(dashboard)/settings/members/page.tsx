"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useOrg } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
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

export default function ProjectMembersPage() {
  const { toast } = useToast();
  const { locale, t } = useAppLocale();
  const { currentOrg } = useOrg();
  const { currentProject } = useProject();
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

  const addProjectMemberMutation = trpc.orgMember.addProjectMember.useMutation({
    onSuccess: () => {
      toast({ title: t("settings.members.addedSuccess") });
      setInviteOpen(false);
      setInviteEmail("");
      utils.orgMember.listProjectRoles.invalidate();
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

  const removeProjectMemberMutation =
    trpc.orgMember.removeProjectMember.useMutation({
      onSuccess: () => {
        toast({
          title: t("settings.members.removedSuccess"),
        });
        utils.orgMember.listProjectRoles.invalidate();
      },
      onError: (err) => {
        toast({
          title: t("teamManagement.error"),
          description: err.message,
          variant: "destructive",
        });
      },
    });

  const projectRolesQuery = trpc.orgMember.listProjectRoles.useQuery(
    {
      organizationId: currentOrg?.id ?? "",
      projectId: currentProject?.id ?? "",
    },
    { enabled: !!currentOrg && !!currentProject },
  );

  const updateProjectRoleMutation =
    trpc.orgMember.updateProjectRole.useMutation({
      onSuccess: () => {
        toast({ title: t("settings.members.updatedSuccess") });
        setEditingRoleUserId(null);
        utils.orgMember.listProjectRoles.invalidate();
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
        {t("org.members.noOrgSelected") || "No organization selected"}
      </div>
    );
  }

  const isAdmin = currentOrg.role === "SYSTEM_ADMIN" || currentOrg.role === "ACCOUNT_ADMIN";

  const allMembers = membersQuery.data ?? [];
  const projectCreatorId = currentProject?.createdBy;
  const projectRoles = projectRolesQuery.data ?? {};
  const hasExplicitProjectMembers = Object.keys(projectRoles).length > 0;
  const members = hasExplicitProjectMembers
    ? allMembers.filter((m) => m.role === "SYSTEM_ADMIN" || m.userId in projectRoles)
    : allMembers;

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t("header.members")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.members.subtitle", { orgName: currentOrg.name })}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t("settings.members.addMember")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t("settings.members.addMemberTitle")}
                </DialogTitle>
                <DialogDescription>
                  {t("settings.members.addMemberDesc")}
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
                      {currentOrg.role === "SYSTEM_ADMIN" && (
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
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() =>
                    currentProject &&
                    addProjectMemberMutation.mutate({
                      organizationId: currentOrg.id,
                      projectId: currentProject.id,
                      email: inviteEmail,
                      role: inviteRole,
                    })
                  }
                  disabled={
                    addProjectMemberMutation.isPending ||
                    !inviteEmail.includes("@")
                  }
                >
                  {addProjectMemberMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("teamManagement.add")}
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
                <TableHead>{t("settings.orgs.orgSettings") || "Org Role"}</TableHead>
                <TableHead>{t("settings.orgs.projectSettings") || "Project Role"}</TableHead>
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

                const isProjectOwner = projectCreatorId === m.userId;

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
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {m.profile?.name ?? "—"}
                            </span>
                            {isProjectOwner && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {t("settings.members.projectOwner")}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.profile?.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleVariant(m.role)}>
                        {roleLabel(
                          m.role as "SYSTEM_ADMIN" | "ACCOUNT_ADMIN" | "EDITOR" | "VIEWER",
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {m.role === "SYSTEM_ADMIN" ? (
                        <Badge variant="default">{roleLabel("SYSTEM_ADMIN")}</Badge>
                      ) : editingRoleUserId === m.userId && currentProject ? (
                        <Select
                          value={projectRoles[m.userId] ?? m.role}
                          onValueChange={(v) =>
                            updateProjectRoleMutation.mutate({
                              organizationId: currentOrg.id,
                              projectId: currentProject.id,
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
                            {currentOrg.role === "SYSTEM_ADMIN" && (
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
                          <Badge
                            variant={roleVariant(
                              projectRoles[m.userId] ?? m.role,
                            )}
                          >
                            {roleLabel(
                              (projectRoles[m.userId] ?? m.role) as
                                | "SYSTEM_ADMIN"
                                | "ACCOUNT_ADMIN"
                                | "EDITOR"
                                | "VIEWER",
                            )}
                          </Badge>
                          {isAdmin && (
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
                        {m.role !== "SYSTEM_ADMIN" && currentProject && (
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
                                  {t("settings.members.removeTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("settings.members.removeMemberConfirm", {
                                    name: m.profile?.name ?? m.profile?.email,
                                    projectName: currentProject?.name
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
                                    removeProjectMemberMutation.mutate({
                                      organizationId: currentOrg.id,
                                      projectId: currentProject.id,
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
                {t("settings.members.leaveTitle")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("settings.members.leaveTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("settings.members.leaveDesc", { orgName: currentOrg.name })}
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
                  {t("settings.members.leaveTitle")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
