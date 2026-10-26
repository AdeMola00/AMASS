/**
 * Improve › New renovation project — reached from a completed inspection ("Start project") or an approved loan.
 * Three fields (scope, budget, target finish) then Create; the tracker pre-fills milestones already reached.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { AppText, Card, Input, useToast } from "@/src/ui";
import { Field, FormShell, MoneyInput } from "@/src/components/home/FormBits";
import { DateField } from "@/src/components/home/Calendar";

export default function NewProject() {
  const router = useRouter();
  const toast = useToast();
  const { property, inspection, finance } = useLocalSearchParams<{ property: string; inspection?: string; finance?: string }>();
  const [prop, setProp] = useState<any>(null);
  const [scope, setScope] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!property) return;
    api
      .improveProperty(property)
      .then((r) => {
        setProp(r.property);
        const rep = r.inspections?.find((i: any) => i.report)?.report;
        if (rep?.estimated_renovation_cost_ngn && cost == null) setCost(rep.estimated_renovation_cost_ngn);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property]);

  const save = async () => {
    setTried(true);
    if (!property || scope.trim().length < 5) return;
    setSaving(true);
    try {
      const doc = await api.createProject({ property_id: property, inspection_id: inspection || undefined, finance_application_id: finance || undefined, scope: scope.trim(), estimated_cost_ngn: cost ?? undefined, estimated_completion: finish ?? undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Project created", "Track milestones as the work progresses.");
      router.replace(`/improve/project/${doc.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't create the project", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FormShell title="New renovation project" subtitle="Plan the work and track it to completion" onSave={save} saveLabel="Create project" saving={saving} disabled={!property} testID="project-form">
        {prop ? (
          <Card elevation="xs" style={{ gap: 2 }}>
            <AppText variant="bodyMedium" numberOfLines={1}>
              {prop.title}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {[prop.location, prop.city].filter(Boolean).join(", ")}
            </AppText>
          </Card>
        ) : null}
        <Input label="What's being done?" value={scope} onChangeText={setScope} placeholder="e.g. Re-roof, rewire kitchen, repaint exterior" multiline maxLength={2000} error={tried && scope.trim().length < 5 ? "Describe the work in a few words" : null} testID="project-scope" />
        <Field label="Budget" hint="Pre-filled from the inspection estimate when there is one">
          <MoneyInput label="Estimated cost (₦)" value={cost} onChange={setCost} testID="project-cost" />
        </Field>
        <DateField label="Target completion (optional)" value={finish} onChange={setFinish} allowClear quick="future" testID="project-finish" />
        <View />
      </FormShell>
    </>
  );
}
