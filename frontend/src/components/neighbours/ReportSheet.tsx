import React, { useState } from "react";
import { View } from "react-native";
import { api } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { Button, Sheet, useToast } from "@/src/ui";

export function ReportSheet({ visible, onClose, targetType, targetId, estateId }: { visible: boolean; onClose: () => void; targetType: "user" | "post" | "reply" | "event" | "place" | "comment" | "collection"; targetId: string; estateId?: string }) {
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reasons: [string, string][] = [["spam", "Spam or selling"], ["harassment", "Harassment or bullying"], ["scam", "Scam or fraud"], ["inappropriate", "Inappropriate content"], ["privacy", "Shares private information"], ["misinformation", "False or misleading"], ["other", "Something else"]];
  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await api.socialReport({ target_type: targetType, target_id: targetId, reason, estate_id: estateId });
      track("report_submitted", { target_type: targetType });
      toast.success("Report received", "Moderators review reports within 24 hours. Thank you for keeping Neighbours safe.");
      onClose();
      setReason(null);
    } catch (e: any) {
      toast.error("Couldn't send report", e?.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Report" testID="report-sheet">
      <View style={{ gap: 6 }}>
        {reasons.map(([k, label]) => (
          <Button key={k} label={label} variant={reason === k ? "primary" : "secondary"} size="sm" fullWidth onPress={() => setReason(k)} testID={`report-reason-${k}`} />
        ))}
        <Button label="Send report" variant="destructive" size="lg" fullWidth disabled={!reason} loading={busy} onPress={submit} style={{ marginTop: 6 }} testID="report-submit" />
      </View>
    </Sheet>
  );
}

