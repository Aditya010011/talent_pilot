"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg, type OrgInfo } from "@/components/org-provider";
import { useProject } from "@/components/project-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { trpc, trpc as trpcClient } from "@/lib/trpc/client";
import { FolderKanban, Loader2, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function OrgSection({ org, isCurrent }: { org: OrgInfo; isCurrent: boolean }) {
  const { toast } = useToast();
  const { locale } = useAppLocale();
  const utils = trpc.useUtils();
  const isZh = locale === "zh";

  const [showMembers, setShowMembers] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ACCOUNT_ADMIN" | "EDITOR" | "VIEWER">("EDITOR");

  const membersQuery = trpc.orgMember.list.useQuery(
    { organizationId: org.id },
    { enabled: showMembers }
  );

  const inviteMutation = trpc.orgMember.invite.useMutation({
    onSuccess: () => {
      toast({ title: isZh ? "已发送邀请" : "Invite sent successfully" });
      setInviteOpen(false);
      setInviteEmail("");
      utils.orgMember.list.invalidate({ organizationId: org.id });
    },
    onError: (err) => {
      toast({
        title: isZh ? "错误" : "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Global system admin can manage ACCOUNT_ADMIN invites even when list labels the org as ACCOUNT_ADMIN
  const { orgs } = useOrg();
  const canManageAdmins = org.role === "SYSTEM_ADMIN" || orgs.some((o) => o.role === "SYSTEM_ADMIN");

  return (
    <div className="space-y-4">
      <Card
        onClick={() => setShowMembers(!showMembers)}
        className="cursor-pointer transition-colors hover:bg-muted/50"
      >
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-xl">{org.name}</CardTitle>
            {isCurrent && (
              <Badge variant="secondary" className="text-xs">
                {isZh ? "当前" : "Current"}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {showMembers && (
        <Card className="mt-2 border-muted bg-muted/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-semibold">{isZh ? "成员" : "Members"}</CardTitle>
              <CardDescription className="text-xs">
                {canManageAdmins
                  ? (isZh ? "管理组织管理员和团队成员" : "Manage organization administrators and team members")
                  : (isZh ? "组织成员目录" : "Organization members directory")}
              </CardDescription>
            </div>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {isZh ? "添加成员" : "Add Member"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{isZh ? "邀请成员" : "Invite Member"}</DialogTitle>
                  <DialogDescription>
                    {isZh
                      ? `邀请新成员加入 “${org.name}”`
                      : `Invite a new member to join "${org.name}"`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="inviteEmail">{isZh ? "邮箱" : "Email"}</Label>
                    <Input
                      id="inviteEmail"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inviteRole">{isZh ? "角色" : "Role"}</Label>
                    <select
                      id="inviteRole"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                    >
                      {canManageAdmins && <option value="ACCOUNT_ADMIN">{isZh ? "账户管理员" : "Account Admin"}</option>}
                      <option value="EDITOR">{isZh ? "编辑者" : "Editor"}</option>
                      <option value="VIEWER">{isZh ? "查看者" : "Viewer"}</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteOpen(false)}>
                    {isZh ? "取消" : "Cancel"}
                  </Button>
                  <Button
                    onClick={() => inviteMutation.mutate({ organizationId: org.id, email: inviteEmail, role: inviteRole })}
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                  >
                    {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isZh ? "发送邀请" : "Send Invite"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {membersQuery.isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {(membersQuery.data ?? []).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-muted last:border-0">
                    <div>
                      <p className="font-semibold text-foreground">{m.profile?.name || m.profile?.email}</p>
                      <p className="text-muted-foreground">{m.profile?.email}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize text-[10px]">
                      {m.role.toLowerCase().replace("_", " ")}
                    </Badge>
                  </div>
                ))}
                {(membersQuery.data ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">{isZh ? "未找到成员" : "No members found"}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function OrganizationsPage() {
  const { orgs, currentOrg } = useOrg();
  const { locale } = useAppLocale();
  const router = useRouter();
  const isZh = locale === "zh";

  // Only SYSTEM_ADMIN can see the full organizations list
  const isSystemAdmin = orgs.some((o) => o.role === "SYSTEM_ADMIN");

  // Redirect ACCOUNT_ADMIN immediately to their own org settings
  if (currentOrg && !isSystemAdmin) {
    router.replace("/org/settings");
    return null;
  }

  const ownedCount = orgs.filter((o) => o.role === "SYSTEM_ADMIN").length;
  const { data: orgLimitData } = trpcClient.organization.orgLimit.useQuery();
  const orgLimit = orgLimitData?.limit ?? 10;
  const limitReached = ownedCount >= orgLimit;

  // SYSTEM_ADMIN sees all orgs; ACCOUNT_ADMIN should not reach here
  const visibleOrgs = isSystemAdmin ? orgs : (currentOrg ? [currentOrg] : []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {isZh ? "组织" : "Organizations"}
          </h1>
          <p className="text-muted-foreground">
            {isZh
              ? "管理你的组织和项目。"
              : "Manage your organizations and projects."}
          </p>
        </div>
        {/* Only SYSTEM_ADMIN can create new organizations */}
        {isSystemAdmin && (
          limitReached ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled>
                      <Plus className="mr-2 h-4 w-4" />
                      {isZh ? "新建组织" : "New Organization"}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-center">
                  {isZh
                      ? `你已达到 ${orgLimit} 个组织的上限。`
                      : `You\u2019ve reached the limit of ${orgLimit} organizations.`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Link href="/org/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {isZh ? "新建组织" : "New Organization"}
              </Button>
            </Link>
          )
        )}
      </div>

      {visibleOrgs.map((org) => (
        <OrgSection
          key={org.id}
          org={org}
          isCurrent={currentOrg?.id === org.id}
        />
      ))}
    </div>
  );
}
