import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectThumb } from "@/src/components/ProjectThumb";
import { Ambient, Chip, ChipRow, Empty, IconBtn, Input, Row, T, Btn } from "@/src/components/ui";
import { confirmAsk, deleteProjectForever, duplicateProject, promptText, saveProject, toast, useStore } from "@/src/engine/store";
import type { Project } from "@/src/engine/types";
import { projectRoute, usesNativeTabs } from "@/src/navigation";
import { radius, spacing, useTheme } from "@/src/theme";

const filters = ["All", "Favourites", "Design", "Document", "Presentation", "Drawing", "Vector", "Video", "Board", "Archived", "Trash"];

export default function Projects() {
  const { projects, ready } = useStore(); const router = useRouter(); const { colors } = useTheme();
  const insets = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const [q, setQ] = useState(""); const [f, setF] = useState("All"); const [list, setList] = useState(false);
  const [sort, setSort] = useState<"recent" | "name">("recent"); const [menu, setMenu] = useState<Project | null>(null);
  const cols = width > 700 ? 4 : 2; const cw = (width - spacing.md * 2 - 12 * (cols - 1)) / cols;
  const data = useMemo(() => projects.filter((p) => {
    if (f === "Trash") return p.trashed; if (p.trashed) return false;
    if (f === "Archived") return p.archived; if (p.archived) return false;
    if (f === "Favourites" && !p.favorite) return false;
    if (!["All", "Favourites"].includes(f) && p.kind !== f.toLowerCase()) return false;
    const s = q.toLowerCase(); return !s || p.name.toLowerCase().includes(s) || p.tags.some((t) => t.includes(s)) || p.folder.toLowerCase().includes(s) || p.category.toLowerCase().includes(s);
  }).sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt)), [projects, q, f, sort]);

  const act = async (k: string) => {
    const p = menu!; setMenu(null);
    if (k === "open") router.push(projectRoute(p));
    if (k === "share") router.push(p.kind === "video" ? projectRoute(p) : (`/export/${p.id}` as any));
    if (k === "rename") { const n = await promptText("Rename project", p.name); if (n?.trim()) saveProject({ ...p, name: n.trim() }); }
    if (k === "dup") { duplicateProject(p); toast("Project duplicated", "success"); }
    if (k === "fav") saveProject({ ...p, favorite: !p.favorite }, { touch: false });
    if (k === "archive") saveProject({ ...p, archived: !p.archived }, { touch: false });
    if (k === "folder") { const n = await promptText("Move to folder", p.folder, { placeholder: "Folder name (empty = none)" }); if (n !== null) saveProject({ ...p, folder: n.trim() }, { touch: false }); }
    if (k === "tags") { const n = await promptText("Tags", p.tags.join(", "), { placeholder: "comma, separated" }); if (n !== null) saveProject({ ...p, tags: n.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) }, { touch: false }); }
    if (k === "trash") { saveProject({ ...p, trashed: true }, { touch: false }); toast("Moved to Trash · restore from the Trash filter"); }
    if (k === "restore") saveProject({ ...p, trashed: false }, { touch: false });
    if (k === "delete" && (await confirmAsk({ title: "Delete forever?", message: `“${p.name}” and its backup copy will be permanently removed from this device.`, confirmLabel: "Delete", destructive: true }))) { await deleteProjectForever(p.id); toast("Deleted"); }
  };
  const bottom = usesNativeTabs ? insets.bottom : 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="projects-screen">
      <Ambient />
      <View style={{ paddingTop: insets.top + 8, backgroundColor: colors.glassStrong, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md }}>
          <T v="h1" style={{ flex: 1 }}>Projects</T>
          <IconBtn icon={sort === "name" ? "text" : "time"} label="Toggle sort" onPress={() => setSort(sort === "name" ? "recent" : "name")} testID="projects-sort-toggle" />
          <IconBtn icon={list ? "grid" : "list"} label="Toggle grid or list" onPress={() => setList(!list)} testID="projects-view-toggle" />
          <IconBtn icon="add-circle" label="New project" onPress={() => router.push("/create")} testID="projects-new-button" tone={colors.brandPrimary} />
        </View>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 8 }}><Input value={q} onChangeText={setQ} placeholder="Search name, tag, folder" testID="projects-search-input" /></View>
        <ChipRow>{filters.map((x) => <Chip key={x} label={x} active={f === x} onPress={() => setF(x)} testID={`projects-filter-${x.toLowerCase()}`} />)}</ChipRow>
      </View>
      <FlatList
        key={list ? "l" : "g" + cols} data={data} numColumns={list ? 1 : cols} keyExtractor={(p) => p.id}
        columnWrapperStyle={list ? undefined : { gap: 12 }} contentContainerStyle={{ padding: spacing.md, gap: 12, paddingBottom: bottom + 24 }}
        ListEmptyComponent={!ready ? (
          <View testID="projects-skeleton" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: list ? "100%" : cw, height: list ? 80 : cw * 1.1 + 48, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary }} />)}
          </View>
        ) : <Empty icon="folder-open" title={f === "Trash" ? "Trash is empty" : "No projects found"} text="Create a project or start from a template." action={<Btn label="New project" icon="add" onPress={() => router.push("/create")} testID="projects-empty-create" />} />}
        renderItem={({ item }) => <ProjectThumb p={item} width={cw} list={list} onPress={() => (item.trashed ? setMenu(item) : router.push(projectRoute(item)))} onLongPress={() => setMenu(item)} testID={`project-card-${item.id}`} />}
      />
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }} onPress={() => setMenu(null)}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 12, paddingBottom: insets.bottom + 12 }} testID="project-action-sheet">
            <T v="h3" style={{ paddingHorizontal: spacing.md, paddingBottom: 6 }}>{menu?.name}</T>
            {(menu?.trashed ? [["restore", "Restore", "arrow-undo"], ["delete", "Delete forever", "trash"]] : [["open", "Open", "open"], ["share", "Save & share (export)", "share-social"], ["rename", "Rename", "create"], ["dup", "Duplicate", "copy"], ["fav", menu?.favorite ? "Remove favourite" : "Favourite", "heart"], ["folder", "Move to folder", "folder"], ["tags", "Edit tags", "pricetags"], ["archive", menu?.archived ? "Unarchive" : "Archive", "archive"], ["trash", "Move to Trash", "trash"]]).map(([k, l, i]) => (
              <Row key={k} icon={i as any} title={l} onPress={() => act(k)} testID={`project-action-${k}`} right={<View />} />
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
