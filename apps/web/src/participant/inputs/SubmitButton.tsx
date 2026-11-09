import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button } from "../../components/ui";

export function SubmitButton({ disabled, busy, label }: { disabled?: boolean; busy: boolean; label?: string }) {
  const { t } = useTranslation();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={disabled} loading={busy} style={{ background: "var(--pd-accent)" }}>
      <Send className="h-5 w-5" aria-hidden /> {label ?? t("participant.submit")}
    </Button>
  );
}
