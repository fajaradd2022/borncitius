"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, MoreHorizontal, Plus, RefreshCw, ShieldCheck, Trash2, UserX } from "lucide-react";

import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateRandomPassword } from "@/lib/generate-password";
import type { Role, User } from "@/lib/types";

// PRD 4.5 — User Management: CRUD Admin/SPV/Teknisi. Nonaktifkan akun tidak
// menghapus riwayat task yang sudah dikerjakan (soft-disable, bukan delete).
//
// Buat user & toggle aktif/nonaktif memanggil API sungguhan lewat proxy
// (token disisipkan dari cookie httpOnly di server) — state daftar di-refresh
// dari server (router.refresh()), bukan ditebak sendiri seperti sebelumnya.

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  spv: "SPV",
  teknisi: "Teknisi",
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Disalin ke clipboard.");
  } catch {
    toast.error("Tidak bisa menyalin otomatis — salin manual.");
  }
}

function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
        aria-label="Password"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onChange(generateRandomPassword())}
        aria-label="Acak ulang password"
      >
        <RefreshCw className="size-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => void copyToClipboard(value)}
        aria-label="Salin password"
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

export function UsersTableClient({ initialUsers }: { initialUsers: User[] }) {
  const router = useRouter();
  const users = initialUsers;

  // ── Dialog: Tambah User ──────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<"form" | "success">("form");
  const [createBusy, setCreateBusy] = useState(false);
  const [createdPassword, setCreatedPassword] = useState("");
  const [createdName, setCreatedName] = useState("");
  const [form, setForm] = useState<{ name: string; email: string; role: Role; password: string }>({
    name: "",
    email: "",
    role: "teknisi",
    password: generateRandomPassword(),
  });

  function resetCreateDialog() {
    setCreateOpen(false);
    setCreateStep("form");
    setForm({ name: "", email: "", role: "teknisi", password: generateRandomPassword() });
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Nama dan email wajib diisi.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetch("/api/proxy/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.password,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; name?: string } | null;
      if (!res.ok) {
        toast.error("Gagal membuat user.", { description: body?.message });
        return;
      }
      setCreatedName(body?.name ?? form.name.trim());
      setCreatedPassword(form.password);
      setCreateStep("success");
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setCreateBusy(false);
    }
  }

  // ── Toggle Aktif/Nonaktif ────────────────────────────────────────────
  async function toggleActive(user: User) {
    try {
      const res = await fetch(`/api/proxy/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal mengubah status user.", { description: body?.message });
        return;
      }
      toast.success(
        user.isActive ? `${user.name} dinonaktifkan.` : `${user.name} diaktifkan kembali.`,
      );
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    }
  }

  // ── Dialog: Reset Password ───────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetStep, setResetStep] = useState<"form" | "success">("form");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetPassword, setResetPasswordValue] = useState("");

  function openReset(user: User) {
    setResetTarget(user);
    setResetStep("form");
    setResetPasswordValue(generateRandomPassword());
  }

  async function confirmReset() {
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    setResetBusy(true);
    try {
      const res = await fetch(`/api/proxy/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal mereset password.", { description: body?.message });
        return;
      }
      setResetStep("success");
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setResetBusy(false);
    }
  }

  // ── Dialog: Hapus User ───────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/proxy/users/${deleteTarget.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menghapus akun.", { description: body?.message });
        return;
      }
      toast.success(`Akun "${deleteTarget.name}" dihapus.`);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="User Management"
        description="Kelola akun Admin, SPV, dan Teknisi"
        actions={
          <Dialog
            open={createOpen}
            onOpenChange={(open) => (open ? setCreateOpen(true) : resetCreateDialog())}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                Tambah User
              </Button>
            </DialogTrigger>
            <DialogContent>
              {createStep === "form" ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Tambah User Baru</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="new-name">Nama</Label>
                      <Input
                        id="new-name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="new-email">Email</Label>
                      <Input
                        id="new-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Role</Label>
                      <Select
                        value={form.role}
                        onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="spv">SPV</SelectItem>
                          <SelectItem value="teknisi">Teknisi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Password</Label>
                      <PasswordField
                        value={form.password}
                        onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Terisi otomatis secara acak — boleh diedit, minimal 8 karakter.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetCreateDialog} disabled={createBusy}>
                      Batal
                    </Button>
                    <Button onClick={() => void handleCreate()} disabled={createBusy}>
                      {createBusy ? "Menyimpan…" : "Simpan"}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>User &quot;{createdName}&quot; dibuat</DialogTitle>
                    <DialogDescription>
                      Sampaikan password ini ke user — tidak akan ditampilkan lagi setelah ditutup.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-2">
                    <PasswordField value={createdPassword} onChange={() => undefined} />
                  </div>
                  <DialogFooter>
                    <Button onClick={resetCreateDialog}>Tutup</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                          {user.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge className="bg-[oklch(0.7_0.15_160_/_0.18)] text-[oklch(0.35_0.12_160)] hover:bg-[oklch(0.7_0.15_160_/_0.18)]">
                          Aktif
                        </Badge>
                      ) : (
                        <Badge variant="outline">Nonaktif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void toggleActive(user)}>
                            {user.isActive ? (
                              <>
                                <UserX className="size-4" /> Nonaktifkan
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="size-4" /> Aktifkan
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openReset(user)}>
                            <KeyRound className="size-4" /> Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="size-4" /> Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <DialogContent>
          {resetStep === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle>Reset Password — {resetTarget?.name}</DialogTitle>
                <DialogDescription>
                  User ini akan logout dari semua perangkat setelah password direset.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5 py-2">
                <Label>Password Baru</Label>
                <PasswordField value={resetPassword} onChange={setResetPasswordValue} />
                <p className="text-xs text-muted-foreground">
                  Terisi otomatis secara acak — boleh diedit, minimal 8 karakter.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetBusy}>
                  Batal
                </Button>
                <Button onClick={() => void confirmReset()} disabled={resetBusy}>
                  {resetBusy ? "Mereset…" : "Reset Password"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Password direset</DialogTitle>
                <DialogDescription>
                  Sampaikan password baru ini ke {resetTarget?.name} — tidak akan ditampilkan lagi
                  setelah ditutup.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <PasswordField value={resetPassword} onChange={() => undefined} />
              </div>
              <DialogFooter>
                <Button onClick={() => setResetTarget(null)}>Tutup</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus akun {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini permanen. Akun yang masih punya referensi (folder, template, layout,
              task, atau riwayat review) tidak bisa dihapus — nonaktifkan saja kalau begitu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteUser();
              }}
            >
              {deleteBusy ? "Menghapus…" : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
