/**
 * Service requests for an estate — residents see their own; managers see everyone's.
 */
import React, { useCallback, useState } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api, Estate, ServiceRequest } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Button, Chip, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl, SkeletonRows } from "@/src/ui";
import { ServiceRequestRow } from "@/src/components/neighbours/ServiceRequestRow";

type Filter = "active" | "done";

export default function ServiceRequestsScreen() {
  const { estate_id } = useLocalSearchParams<{ estate_id?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [estates, setEstates] = useState<Estate[] | null>(null);
  const [estateId, setEstateId] = useState<string | undefined>(estate_id);
  const [data, setData] = useState<{ items: ServiceRequest[]; is_manager: boolean } | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [filter, setFilter] = useState<Filter>("active");
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      let eid = estateId;
      let list = estates;
      if (!list) {
        list = (await api.myEstates()).filter((e) => e.membership?.status === "approved");
        setEstates(list);
      }
      if (!eid) {
        eid = list[0]?.id;
        setEstateId(eid);
      }
      if (!eid) {
        setData({ items: [], is_manager: false });
        return;
      }
      setData(await api.serviceRequests(eid, scope));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [estateId, estates, scope]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const items = (data?.items ?? []).filter((r) => (filter === "active" ? !["resolved", "closed"].includes(r.status) : ["resolved", "closed"].includes(r.status)));
  const estate = estates?.find((e) => e.id === estateId);

  return (
    <Screen testID="services-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Maintenance requests" subtitle={estate?.name} right={estateId ? <IconButton icon="add" label="Report an issue" variant="primary" onPress={() => router.push(`/neighbours/services/new?estate_id=${estateId}` as any)} testID="services-new" /> : undefined} />
      <View style={{ paddingHorizontal: space[4], gap: 10, paddingBottom: space[2] }}>
        {estates && estates.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {estates.map((e) => (
              <Chip key={e.id} label={e.name} selected={e.id === estateId} onPress={() => { setEstateId(e.id); setData(null); }} testID={`services-estate-${e.id}`} />
            ))}
          </ScrollView>
        ) : null}
        <SegmentedControl options={[{ value: "active" as Filter, label: "Active" }, { value: "done" as Filter, label: "Resolved" }]} value={filter} onChange={setFilter} testIDPrefix="services-filter" />
        {data?.is_manager ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="All residents" selected={scope === "all"} onPress={() => setScope("all")} testID="services-scope-all" />
            <Chip label="Mine" selected={scope === "mine"} onPress={() => setScope("mine")} testID="services-scope-mine" />
          </View>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: 8 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {!data && !error ? (
          <SkeletonRows rows={5} />
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load requests" actionLabel="Retry" onAction={load} />
        ) : !estateId ? (
          <EmptyState icon="business-outline" title="Join an estate first" body="Maintenance requests go to your estate's management." actionLabel="Find my estate" onAction={() => router.push("/neighbours/estates" as any)} testID="services-no-estate" />
        ) : items.length === 0 ? (
          <EmptyState icon={filter === "active" ? "checkmark-done-outline" : "archive-outline"} title={filter === "active" ? "Nothing open" : "Nothing resolved yet"} body={filter === "active" ? "Report leaks, power faults, security or waste issues — management tracks them to resolution." : "Resolved and closed requests will show here."} actionLabel={filter === "active" ? "Report an issue" : undefined} onAction={() => router.push(`/neighbours/services/new?estate_id=${estateId}` as any)} testID="services-empty" />
        ) : (
          <>
            {items.map((r) => (
              <ServiceRequestRow key={r.id} request={r} onPress={() => router.push(`/neighbours/services/${r.id}` as any)} />
            ))}
            <AppText variant="micro" tone="tertiary" align="center" style={{ marginTop: 8 }}>
              {data!.is_manager ? "Residents' names are visible to management only." : "Only you and estate management can see your requests."}
            </AppText>
          </>
        )}
        {estateId && items.length > 0 ? <Button label="Report another issue" variant="secondary" fullWidth iconLeft="add" onPress={() => router.push(`/neighbours/services/new?estate_id=${estateId}` as any)} /> : null}
      </ScrollView>
    </Screen>
  );
}
