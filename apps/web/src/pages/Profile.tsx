import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicUser } from "@polldeck/shared";
import { patch } from "../lib/api";
import { useApp } from "../lib/app";
import { setLanguage } from "../lib/i18n";
import { Button, Card, Field, Input, Select, useErrorText, useToast } from "../components/ui";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useApp();
  const toast = useToast();
  const errText = useErrorText();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "" });
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      <Card className="space-y-4">
        <Field label={t("common.name")}>{(id) => <Input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t("auth.email")}>{(id) => <Input id={id} value={user?.email ?? ""} disabled />}</Field>
        <Field label={t("profile.language")}>
          {(id) => (
            <Select
              id={id}
              value={i18n.language}
              onChange={async (e) => {
                const l = e.target.value as "de" | "en";
                setLanguage(l);
                const r = await patch<{ user: PublicUser }>("/api/auth/me", { locale: l });
                setUser(r.user);
              }}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </Select>
          )}
        </Field>
        <Button
          onClick={async () => {
            try {
              const r = await patch<{ user: PublicUser }>("/api/auth/me", { name });
              setUser(r.user);
              toast(t("common.saved"), "success");
            } catch (e) {
              toast(errText(e), "error");
            }
          }}
        >
          {t("common.save")}
        </Button>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-semibold">{t("profile.changePassword")}</h2>
        <Field label={t("profile.currentPassword")}>
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}
        </Field>
        <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}
        </Field>
        <Button
          disabled={pw.next.length < 8}
          onClick={async () => {
            try {
              await patch("/api/auth/me", { currentPassword: pw.current, newPassword: pw.next });
              setPw({ current: "", next: "" });
              toast(t("common.saved"), "success");
            } catch (e) {
              toast(errText(e), "error");
            }
          }}
        >
          {t("profile.changePassword")}
        </Button>
      </Card>
    </div>
  );
}
