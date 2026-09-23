"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useOrg } from "@/components/org-provider";
import { trpc } from "@/lib/trpc/client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function MembersTable() {
  const { currentOrg } = useOrg();
  const { t } = useAppLocale();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.team.listUsers.useQuery(
    { organizationId: currentOrg?.id as string },
    { enabled: !!currentOrg?.id }
  );

  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  const isSystemAdmin = currentOrg?.role === "SYSTEM_ADMIN";

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
      utils.team.listUsers.invalidate();
      setDeletingUser(null);
    },
    onError: (err) => {
      toast({ title: t("teamManagement.error"), description: err.message, variant: "destructive" });
    }
  });

  const updateMutation = trpc.team.updateUser.useMutation({
    onSuccess: () => {
      toast({ title: t("teamManagement.userUpdatedSuccess") });
      utils.team.listUsers.invalidate();
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
      organizationId: currentOrg!.id,
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
                if (deletingUser && currentOrg) {
                  deleteMutation.mutate({ organizationId: currentOrg.id, userId: deletingUser.userId });
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

export default function TeamManagementPage() {
  const { currentOrg } = useOrg();
  const { t } = useAppLocale();
  const { toast } = useToast();
  const utils = trpc.useUtils();

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
      utils.team.listUsers.invalidate();
    },
    onError: (err) => {
      toast({
        title: t("teamManagement.error"),
        description: err.message,
        variant: "destructive",
      });
    }
  });

  if (!currentOrg) return null;

  const isSystemAdmin = currentOrg.role === "SYSTEM_ADMIN";
  const isAccountAdmin = currentOrg.role === "ACCOUNT_ADMIN";

  if (currentOrg.role === "VIEWER") {
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
      organizationId: currentOrg.id,
      email,
      password,
      role: role as any,
      name: displayName || `${firstName} ${lastName}`.trim(),
      userType: userType as any,
      phone,
      company,
    });
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold">{t("teamManagement.title")}</h1>
        <p className="text-muted-foreground">
          {t("teamManagement.description")}
        </p>
      </div>

      <Tabs defaultValue="view" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="view">{t("teamManagement.viewAccounts")}</TabsTrigger>
          <TabsTrigger value="create">{t("teamManagement.createAccount")}</TabsTrigger>
        </TabsList>

        <TabsContent value="view">
          <MembersTable />
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
