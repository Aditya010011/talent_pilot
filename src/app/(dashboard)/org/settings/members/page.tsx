"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg } from "@/components/org-provider";
import { trpc } from "@/lib/trpc/client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarIcon, Edit, Loader2, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { formatCreditBalance } from "@/lib/interview-credits";
import { isCoachingChromePath, settingsOrganizationsPath } from "@/lib/product-access";

function useManagedOrganizationId() {
  const { currentOrg, orgs } = useOrg();
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("organizationId");
  const organizationId = fromQuery || currentOrg?.id || "";
  const managedOrg = useMemo(
    () => orgs.find((o) => o.id === organizationId) ?? (currentOrg?.id === organizationId ? currentOrg : null),
    [orgs, organizationId, currentOrg],
  );
  return { organizationId, managedOrg, currentOrg, orgs };
}

function OrgCreditsPanel({
  organizationId,
  isSystemAdmin,
}: {
  organizationId: string;
  isSystemAdmin: boolean;
}) {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const creditsQuery = trpc.organization.getCredits.useQuery(
    { organizationId },
    { enabled: !!organizationId && isSystemAdmin },
  );
  const [setValue, setSetValue] = useState("");
  const [addValue, setAddValue] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [expireDate, setExpireDate] = useState<Date>();
  const [coachingEnabled, setCoachingEnabled] = useState(false);
  const [interviewEnabled, setInterviewEnabled] = useState(true);
  const pathname = usePathname();
  const coachingChrome = isCoachingChromePath(pathname);

  useEffect(() => {
    if (!creditsQuery.data) return;
    setStartDate(
      creditsQuery.data.startDate ? new Date(creditsQuery.data.startDate) : undefined,
    );
    setExpireDate(
      creditsQuery.data.expireDate ? new Date(creditsQuery.data.expireDate) : undefined,
    );
    setCoachingEnabled(creditsQuery.data.coachingEnabled ?? false);
    setInterviewEnabled(creditsQuery.data.interviewEnabled !== false);
  }, [
    creditsQuery.data?.startDate,
    creditsQuery.data?.expireDate,
    creditsQuery.data?.coachingEnabled,
    creditsQuery.data?.interviewEnabled,
    organizationId,
  ]);

  const invalidateOrgCredits = () => {
    utils.organization.getCredits.invalidate({ organizationId });
    utils.organization.getBalance.invalidate({ organizationId });
    utils.team.listUsers.invalidate({ organizationId });
  };

  const setCreditsMutation = trpc.organization.setCredits.useMutation({
    onSuccess: (data) => {
      toast({ title: t("teamManagement.orgCreditsUpdated") });
      setSetValue(String(data.credits));
      invalidateOrgCredits();
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    },
  });

  const addCreditsMutation = trpc.organization.addCredits.useMutation({
    onSuccess: (data) => {
      toast({ title: t("teamManagement.orgCreditsUpdated") });
      setAddValue("");
      setSetValue(String(data.credits));
      invalidateOrgCredits();
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    },
  });

  const setDatesMutation = trpc.organization.setDates.useMutation({
    onSuccess: (data) => {
      toast({ title: t("teamManagement.orgDatesUpdated") });
      setStartDate(data.startDate ? new Date(data.startDate) : undefined);
      setExpireDate(data.expireDate ? new Date(data.expireDate) : undefined);
      invalidateOrgCredits();
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    },
  });

  const setCoachingMutation = trpc.organization.setCoachingEnabled.useMutation({
    onSuccess: (data) => {
      toast({ title: t("teamManagement.orgCoachingUpdated") });
      setCoachingEnabled(data.coachingEnabled);
      setInterviewEnabled(data.interviewEnabled !== false);
      utils.organization.getCredits.invalidate({ organizationId });
      utils.organization.list.invalidate();
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    },
  });

  const setInterviewMutation = trpc.organization.setInterviewEnabled.useMutation({
    onSuccess: (data) => {
      toast({ title: t("teamManagement.orgInterviewUpdated") });
      setInterviewEnabled(data.interviewEnabled !== false);
      setCoachingEnabled(data.coachingEnabled);
      utils.organization.getCredits.invalidate({ organizationId });
      utils.organization.list.invalidate();
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    },
  });

  if (!isSystemAdmin) return null;

  const balance = creditsQuery.data?.credits ?? 0;
  const displaySetValue = setValue === "" && creditsQuery.data != null ? String(balance) : setValue;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-lg font-semibold">{t("teamManagement.orgCredits")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("teamManagement.orgCreditsDescription")}
          </p>
          {coachingChrome && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("teamManagement.orgCoachingBillingHint")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <Label>{t("teamManagement.orgCreditsBalance")}</Label>
            <div className="text-2xl font-semibold tabular-nums">
              {creditsQuery.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                formatCreditBalance(balance)
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-credits-set">{t("teamManagement.orgCreditsSet")}</Label>
            <div className="flex gap-2">
              <Input
                id="org-credits-set"
                type="number"
                min={0}
                className="w-36"
                value={displaySetValue}
                onChange={(e) => setSetValue(e.target.value)}
              />
              <Button
                disabled={setCreditsMutation.isPending || displaySetValue === ""}
                onClick={() => {
                  const credits = parseInt(displaySetValue, 10);
                  if (Number.isNaN(credits) || credits < 0) return;
                  setCreditsMutation.mutate({ organizationId, credits });
                }}
              >
                {setCreditsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("teamManagement.orgCreditsSave")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-credits-add">{t("teamManagement.orgCreditsAdd")}</Label>
            <div className="flex gap-2">
              <Input
                id="org-credits-add"
                type="number"
                min={1}
                className="w-36"
                placeholder={t("teamManagement.orgCreditsAmount")}
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={addCreditsMutation.isPending || !addValue}
                onClick={() => {
                  const amount = parseInt(addValue, 10);
                  if (Number.isNaN(amount) || amount <= 0) return;
                  addCreditsMutation.mutate({ organizationId, amount });
                }}
              >
                {addCreditsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("teamManagement.orgCreditsAddButton")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-6 border-t pt-4">
          <div className="space-y-2">
            <Label>{t("teamManagement.orgStartDate")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PP") : <span>dd/mm/yyyy</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>{t("teamManagement.orgExpireDate")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expireDate ? format(expireDate, "PP") : t("teamManagement.noExpiry")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={expireDate} onSelect={setExpireDate} />
              </PopoverContent>
            </Popover>
          </div>

          <Button
            disabled={setDatesMutation.isPending}
            onClick={() => {
              setDatesMutation.mutate({
                organizationId,
                startDate: startDate ? startDate.toISOString() : null,
                expireDate: expireDate ? expireDate.toISOString() : null,
              });
            }}
          >
            {setDatesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("teamManagement.orgDatesSave")}
          </Button>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="org-coaching-toggle">{t("teamManagement.orgCoachingEnabled")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("teamManagement.orgCoachingDescription")}
            </p>
          </div>
          <Switch
            id="org-coaching-toggle"
            checked={coachingEnabled}
            disabled={setCoachingMutation.isPending}
            onCheckedChange={(checked) => {
              setCoachingEnabled(checked);
              setCoachingMutation.mutate({ organizationId, coachingEnabled: checked });
            }}
          />
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="org-interview-toggle">{t("teamManagement.orgInterviewEnabled")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("teamManagement.orgInterviewDescription")}
            </p>
          </div>
          <Switch
            id="org-interview-toggle"
            checked={interviewEnabled}
            disabled={setInterviewMutation.isPending}
            onCheckedChange={(checked) => {
              setInterviewEnabled(checked);
              setInterviewMutation.mutate({ organizationId, interviewEnabled: checked });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MembersTable({
  organizationId,
  isSystemAdmin,
}: {
  organizationId: string;
  isSystemAdmin: boolean;
}) {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.team.listUsers.useQuery(
    { organizationId },
    { enabled: !!organizationId },
  );

  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Edit states
  const [editRole, setEditRole] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editUserType, setEditUserType] = useState("NORMAL");

  const deleteMutation = trpc.team.deleteUser.useMutation({
    onSuccess: () => {
      toast({ title: t("teamManagement.userDeletedSuccess") });
      utils.team.listUsers.invalidate({ organizationId });
      setDeletingUser(null);
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    }
  });

  const updateMutation = trpc.team.updateUser.useMutation({
    onSuccess: () => {
      toast({ title: t("teamManagement.userUpdatedSuccess") });
      utils.team.listUsers.invalidate({ organizationId });
      setEditingUser(null);
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    }
  });

  const handleEditClick = (m: any) => {
    setEditingUser(m);
    setEditRole(m.role);
    
    const currentName = m.profile?.name || "";
    setEditDisplayName(currentName);
    const nameParts = currentName.split(" ");
    setEditFirstName(nameParts[0] || "");
    setEditLastName(nameParts.slice(1).join(" ") || "");
    
    setEditPhone(m.metadata.phone || "");
    setEditCompany(m.metadata.company || "");
    
    setEditEmail(m.profile?.email || "");
    setEditPassword("");
    setEditUserType(m.metadata.userType || "NORMAL");
  };

  const submitEdit = () => {
    if (!editingUser) return;
    updateMutation.mutate({
      organizationId,
      userId: editingUser.userId,
      role: editRole as any,
      name: editDisplayName || `${editFirstName} ${editLastName}`.trim(),
      phone: editPhone,
      company: editCompany,
      email: editEmail,
      password: editPassword,
      userType: editUserType as any,
    });
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8 text-muted-foreground" /></div>;

  return (
    <>
      <div className="border rounded-md mt-4 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{t("teamManagement.user")}</TableHead>
              <TableHead>{t("teamManagement.type")}</TableHead>
              <TableHead>{t("teamManagement.planRole")}</TableHead>
              <TableHead>{t("teamManagement.status")}</TableHead>
              <TableHead>{t("teamManagement.lastLogin")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="flex items-center gap-2 font-medium">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.profile?.avatar || ""} />
                    <AvatarFallback>{m.profile?.name?.[0] || m.profile?.email[0] || "?"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm">{m.profile?.name || t("teamManagement.noName")}</div>
                    <div className="text-xs text-muted-foreground">{m.profile?.email}</div>
                  </div>
                </TableCell>
                <TableCell>{m.metadata.userType}</TableCell>
                <TableCell>
                  {m.role === "SYSTEM_ADMIN" ? t("teamManagement.systemAdmin") : m.role === "ACCOUNT_ADMIN" ? t("teamManagement.accountAdmin") : m.role === "EDITOR" ? t("teamManagement.editor") : t("teamManagement.viewer")}
                </TableCell>
                <TableCell>
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-xs">{t("teamManagement.active")}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.lastSignInAt ? format(new Date(m.lastSignInAt), "PP p") : t("teamManagement.never")}
                </TableCell>
                <TableCell>
                  <div className="flex gap-4 text-muted-foreground">
                    <button onClick={() => handleEditClick(m)} className="hover:text-foreground transition-colors"><Edit className="h-4 w-4" /></button>
                    {m.role !== "SYSTEM_ADMIN" && (
                      <button onClick={() => setDeletingUser(m)} className="hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teamManagement.deleteUser")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("teamManagement.deleteUserConfirm").replace("{email}", deletingUser?.profile?.email)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("teamManagement.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingUser && organizationId) {
                  deleteMutation.mutate({ organizationId, userId: deletingUser.userId });
                }
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teamManagement.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("teamManagement.editUser")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            
            {isSystemAdmin && (
              <RadioGroup value={editUserType} onValueChange={setEditUserType} disabled={!isSystemAdmin} className="flex gap-6 mb-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="NORMAL" id="e-r1" />
                  <Label htmlFor="e-r1">{t("teamManagement.normalUser")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="SALES" id="e-r2" />
                  <Label htmlFor="e-r2">{t("teamManagement.sales")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="AFFILIATE" id="e-r3" />
                  <Label htmlFor="e-r3">{t("teamManagement.affiliate")}</Label>
                </div>
              </RadioGroup>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("teamManagement.role")}</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCOUNT_ADMIN">{t("teamManagement.accountAdmin")}</SelectItem>
                    <SelectItem value="EDITOR">{t("teamManagement.editor")}</SelectItem>
                    <SelectItem value="VIEWER">{t("teamManagement.viewer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{t("teamManagement.email")}</Label>
                <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{t("teamManagement.newPassword")}</Label>
                <Input type="password" placeholder={t("teamManagement.newPasswordPlaceholder")} value={editPassword} onChange={e => setEditPassword(e.target.value)} />
              </div>
              
              <div className="space-y-2">
                <Label>{t("teamManagement.displayName")}</Label>
                <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{t("teamManagement.firstName")}</Label>
                <Input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{t("teamManagement.lastName")}</Label>
                <Input value={editLastName} onChange={e => setEditLastName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{t("teamManagement.phone")}</Label>
                <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("teamManagement.company")}</Label>
                <Input value={editCompany} onChange={e => setEditCompany(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>{t("teamManagement.cancel")}</Button>
            <Button onClick={submitEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("teamManagement.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function OrgSettingsMembersPage() {
  const { organizationId, managedOrg, currentOrg, orgs } = useManagedOrganizationId();
  const { t } = useAppLocale();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const pathname = usePathname();
  const coachingChrome = isCoachingChromePath(pathname);

  const [userType, setUserType] = useState("NORMAL");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editOrgName, setEditOrgName] = useState("");

  const createUserMutation = trpc.team.createUser.useMutation({
    onSuccess: () => {
      toast({ title: t("teamManagement.userCreatedSuccess") });
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setDisplayName("");
      setFirstName("");
      setLastName("");
      setPhone("");
      setCompany("");
      setRole("");
      utils.team.listUsers.invalidate({ organizationId });
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const updateOrgMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      toast({ title: t("teamManagement.orgNameUpdated") });
      setEditOrgOpen(false);
      // Refresh org list so "Managing {name}" updates without switching workspace
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

  if (!organizationId) return null;

  // Permission comes from the admin's own workspace role, not the managed org's display role.
  const isSystemAdmin = orgs.some((o) => o.role === "SYSTEM_ADMIN") || currentOrg?.role === "SYSTEM_ADMIN";
  const isAccountAdmin = currentOrg?.role === "ACCOUNT_ADMIN" || managedOrg?.role === "ACCOUNT_ADMIN";

  if (currentOrg?.role === "VIEWER" && !isSystemAdmin) {
    return <div className="p-8 text-center text-muted-foreground">{t("teamManagement.noPermission")}</div>;
  }

  const handleSubmit = () => {
    if (password !== confirmPassword) {
      toast({ title: t("teamManagement.passwordsDoNotMatch"), variant: "destructive" });
      return;
    }
    if (!email || !password || !role) {
      toast({ title: t("teamManagement.fillRequiredFields"), variant: "destructive" });
      return;
    }
    
    createUserMutation.mutate({
      organizationId,
      email,
      password,
      role: role as any,
      name: displayName || `${firstName} ${lastName}`.trim(),
      userType: userType as any,
      phone,
      company,
    });
  };

  const openEditOrg = () => {
    setEditOrgName(managedOrg?.name ?? "");
    setEditOrgOpen(true);
  };

  const submitEditOrg = () => {
    const name = editOrgName.trim();
    if (!name) return;
    updateOrgMutation.mutate({ id: organizationId, name });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-20">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5 text-muted-foreground" asChild>
          <Link href={settingsOrganizationsPath({ coachingChrome })}>
            <ArrowLeft className="h-4 w-4" />
            {t("teamManagement.backToOrganizations")}
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t("teamManagement.title")}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground">
            {managedOrg?.name
              ? t("teamManagement.managingOrg", { name: managedOrg.name })
              : t("teamManagement.description")}
          </p>
          {isSystemAdmin && managedOrg && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground"
              onClick={openEditOrg}
            >
              <Edit className="h-3.5 w-3.5" />
              {t("teamManagement.editOrgName")}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editOrgOpen} onOpenChange={setEditOrgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teamManagement.editOrgName")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="edit-org-name">{t("org.general.orgName")}</Label>
            <Input
              id="edit-org-name"
              value={editOrgName}
              onChange={(e) => setEditOrgName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitEditOrg();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrgOpen(false)}>
              {t("teamManagement.cancel")}
            </Button>
            <Button
              onClick={submitEditOrg}
              disabled={updateOrgMutation.isPending || !editOrgName.trim()}
            >
              {updateOrgMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("org.general.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrgCreditsPanel organizationId={organizationId} isSystemAdmin={isSystemAdmin} />

      <Tabs defaultValue="view" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="view">{t("teamManagement.viewAccounts")}</TabsTrigger>
          <TabsTrigger value="create">{t("teamManagement.createAccount")}</TabsTrigger>
        </TabsList>

        <TabsContent value="view">
          <MembersTable organizationId={organizationId} isSystemAdmin={isSystemAdmin} />
        </TabsContent>

        <TabsContent value="create">
          <Card className="max-w-4xl">
            <CardContent className="space-y-6 pt-6">
          {isSystemAdmin && (
            <RadioGroup value={userType} onValueChange={setUserType} disabled={!isSystemAdmin} className="flex gap-6 mb-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NORMAL" id="r1" />
                <Label htmlFor="r1">{t("teamManagement.normalUser")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="SALES" id="r2" />
                <Label htmlFor="r2">{t("teamManagement.sales")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="AFFILIATE" id="r3" />
                <Label htmlFor="r3">{t("teamManagement.affiliate")}</Label>
              </div>
            </RadioGroup>
          )}

          <div className="space-y-2">
            <Label>
              {isSystemAdmin 
                ? t("teamManagement.existingAdminAccounts")
                : t("teamManagement.existingMemberAccounts")
              }
            </Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder={t("teamManagement.selectAnAccount")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">--</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex gap-1">
              <span className="text-red-500">*</span>
              {t("teamManagement.role")}
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder={t("teamManagement.pleaseSelectRole")} />
              </SelectTrigger>
              <SelectContent>
                {isSystemAdmin && <SelectItem value="ACCOUNT_ADMIN">{t("teamManagement.accountAdmin")}</SelectItem>}
                {(isSystemAdmin || isAccountAdmin) && (
                  <>
                    <SelectItem value="EDITOR">{t("teamManagement.editor")}</SelectItem>
                    <SelectItem value="VIEWER">{t("teamManagement.viewer")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-red-500">{t("teamManagement.pleaseSelectRole")}</p>
          </div>

          <div className="space-y-2">
            <Label className="flex gap-1"><span className="text-red-500">*</span>{t("teamManagement.email")}</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="flex gap-1"><span className="text-red-500">*</span>{t("teamManagement.password")}</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <p className="text-[10px] text-blue-600 italic">
              {t("teamManagement.passwordHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex gap-1"><span className="text-red-500">*</span>{t("teamManagement.confirmedPassword")}</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="flex gap-1"><span className="text-red-500">*</span>{t("teamManagement.displayName")}</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("teamManagement.firstName")}</Label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("teamManagement.lastName")}</Label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("teamManagement.phoneNumber")}</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("teamManagement.companyName")}</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} />
          </div>

          <div className="flex gap-4 pt-4 mt-4">
            <Button onClick={handleSubmit} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("teamManagement.add")}
            </Button>
            <Button variant="secondary">{t("teamManagement.cancel")}</Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
