import React, { useEffect, useState } from "react";
import { StyleProp, ImageStyle } from "react-native";
import { Image } from "expo-image";
import { authedImageSource } from "@/src/lib/pickImage";

/** Image that can load auth-protected `/api/files/...` uploads (proofs, service-request photos). */
export function AuthedImage({ url, style, contentFit = "cover", testID }: { url: string; style?: StyleProp<ImageStyle>; contentFit?: "cover" | "contain"; testID?: string }) {
  const [src, setSrc] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  useEffect(() => {
    let alive = true;
    authedImageSource(url).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [url]);
  return <Image source={src ?? undefined} style={style} contentFit={contentFit} transition={150} testID={testID} />;
}
