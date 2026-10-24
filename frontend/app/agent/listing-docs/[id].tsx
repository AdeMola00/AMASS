/** Deep link target used by DOCS_VERIFIED / DOCS_REJECTED notifications → documents tab of the listing manager. */
import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

export default function ListingDocsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/agent/listing/${id}?tab=docs` as any} />;
}
