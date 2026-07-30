import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mediaUrl } from "@/components/ImageUploader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, Loader2, Trash2, Copy, Image as ImageIcon, FileText } from "lucide-react";

export default function MediaLibrary() {
  const { can } = useAuth();
  const ref = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canCreate = can("media", "create");
  const canDelete = can("media", "delete");

  const load = async () => { setLoading(true); try { const { data } = await api.get("/media"); setRows(data); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const fd = new FormData(); fd.append("file", f);
        await api.post("/media/upload?folder=library", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success("Uploaded"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); } finally { setBusy(false); }
  };
  const del = async (id) => { await api.delete(`/media/${id}`); toast.success("Removed"); load(); };
  const copy = (u) => { navigator.clipboard.writeText(mediaUrl(u)); toast.success("URL copied"); };
  const isImg = (ct) => (ct || "").startsWith("image");

  return (
    <div className="space-y-6" data-testid="media-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight">Media Library</h1>
          <p className="text-muted-foreground text-sm mt-1">Shared assets for the app, landing page & admin — one source of truth.</p>
        </div>
        {canCreate && <>
          <input ref={ref} type="file" accept="image/*,video/*,application/pdf" multiple className="hidden" onChange={(e) => upload(Array.from(e.target.files || []))} data-testid="media-upload-input" />
          <Button onClick={() => ref.current?.click()} disabled={busy} data-testid="media-upload-button">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />} Upload</Button>
        </>}
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : rows.length === 0 ? <Card className="p-16 text-center text-muted-foreground border-dashed"><ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" /> No media yet. Upload your first asset.</Card>
        : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {rows.map((m) => (
              <Card key={m.id} className="overflow-hidden group" data-testid={`media-${m.id}`}>
                <div className="h-32 bg-muted flex items-center justify-center overflow-hidden">
                  {isImg(m.content_type) ? <img src={mediaUrl(m.url)} alt={m.original_filename} className="w-full h-full object-cover" />
                    : <FileText className="h-10 w-10 text-muted-foreground" />}
                </div>
                <div className="p-3">
                  <div className="text-xs font-medium truncate" title={m.original_filename}>{m.original_filename}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{(m.size / 1024).toFixed(0)} KB · {m.folder}</div>
                  <div className="mt-2 flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => copy(m.url)} data-testid={`media-copy-${m.id}`}><Copy className="h-3 w-3 mr-1" /> URL</Button>
                    {canDelete && <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" data-testid={`media-delete-${m.id}`}><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Remove this asset?</AlertDialogTitle><AlertDialogDescription>It will be hidden from the library.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del(m.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>}
                  </div>
                </div>
              </Card>
            ))}
          </div>}
    </div>
  );
}
