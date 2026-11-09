import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadImage } from "../lib/api";
import { Button, IconButton, useErrorText, useToast } from "../components/ui";

export function ImagePicker({ value, onChange, label, compact }: { value?: string | null; onChange: (url: string | null) => void; label: string; compact?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const errText = useErrorText();
  const pick = async (file: File) => {
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <>
          <img src={value} alt="" className={compact ? "h-9 w-9 rounded object-cover" : "h-16 w-24 rounded object-cover ring-1 ring-slate-200 dark:ring-slate-700"} />
          <IconButton label={t("editor.removeImage")} onClick={() => onChange(null)}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </>
      ) : compact ? (
        <IconButton label={label} onClick={() => ref.current?.click()} disabled={busy}>
          <ImagePlus className="h-4 w-4" />
        </IconButton>
      ) : (
        <Button size="sm" variant="secondary" loading={busy} onClick={() => ref.current?.click()}>
          <ImagePlus className="h-4 w-4" aria-hidden /> {label}
        </Button>
      )}
    </div>
  );
}
