const STORAGE_KEY = "pottery-tag-library-v2";
const UI_STORAGE_KEY = "pottery-tag-library-ui-v1";
const MAX_IMAGE_WIDTH = 1600;
const IMAGE_QUALITY = 0.82;
const SUPABASE_BUCKET = "pottery-images";

const state = {
  tags: [],
  entries: [],
  filters: {
    includeTagIds: [],
    excludeTagIds: [],
    matchMode: "all",
  },
  localCache: loadLocalCache(),
  ui: loadUiState(),
  formMode: "create",
  editingEntryId: null,
  cloud: {
    enabled: false,
    signedIn: false,
    user: null,
    syncReady: false,
  },
};

const cloudConfig = window.APP_CONFIG || {};
const supabaseClient = createSupabaseClient();

const tagForm = document.querySelector("#tagForm");
const tagNameInput = document.querySelector("#tagNameInput");
const tagList = document.querySelector("#tagList");

const entryForm = document.querySelector("#entryForm");
const titleInput = document.querySelector("#titleInput");
const imageInput = document.querySelector("#imageInput");
const notesInput = document.querySelector("#notesInput");
const entryTagPicker = document.querySelector("#entryTagPicker");
const imageDraftStatus = document.querySelector("#imageDraftStatus");
const entrySubmitButton = document.querySelector("#entrySubmitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");

const includeTagPicker = document.querySelector("#includeTagPicker");
const excludeTagPicker = document.querySelector("#excludeTagPicker");
const clearFiltersButton = document.querySelector("#clearFiltersButton");

const resultsGrid = document.querySelector("#resultsGrid");
const resultsSummary = document.querySelector("#resultsSummary");
const entryCount = document.querySelector("#entryCount");
const entryCardTemplate = document.querySelector("#entryCardTemplate");
const storageModeLabel = document.querySelector("#storageModeLabel");

const googleSignInButton = document.querySelector("#googleSignInButton");
const authStatusText = document.querySelector("#authStatusText");
const syncStatusText = document.querySelector("#syncStatusText");
const syncModeBadge = document.querySelector("#syncModeBadge");
const signOutButton = document.querySelector("#signOutButton");
const syncNowButton = document.querySelector("#syncNowButton");

const collapsiblePanels = {
  masterTags: document.querySelector("#masterTagsPanel"),
  entryTags: document.querySelector("#entryTagsPanel"),
  includeTags: document.querySelector("#includeTagsPanel"),
  excludeTags: document.querySelector("#excludeTagsPanel"),
};

tagForm.addEventListener("submit", handleCreateTag);
entryForm.addEventListener("submit", handleEntrySubmit);
titleInput.addEventListener("input", persistEntryDraftFromForm);
notesInput.addEventListener("input", persistEntryDraftFromForm);
imageInput.addEventListener("change", handleImageSelection);
clearFiltersButton.addEventListener("click", handleClearFilters);
googleSignInButton.addEventListener("click", handleGoogleSignIn);
signOutButton.addEventListener("click", handleSignOut);
syncNowButton.addEventListener("click", handleManualSync);
cancelEditButton.addEventListener("click", handleCancelEdit);

document.querySelectorAll('input[name="matchMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.filters.matchMode = input.value;
    persistFilters();
    renderResults();
  });
});

document.querySelectorAll(".collapse-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const section = button.dataset.section;
    toggleSection(section);
  });
});

initializeApp();

async function initializeApp() {
  state.tags = [...state.localCache.tags];
  state.entries = [...state.localCache.entries];
  state.filters = { ...state.localCache.filters };

  hydrateEntryFormFromDraft();
  renderAll();
  registerServiceWorker();

  if (!supabaseClient) {
    renderCloudStatus("Cloud sync is unavailable right now. Check your Supabase connection settings and try again.");
    return;
  }

  state.cloud.enabled = true;
  renderCloudStatus("Cloud sync is configured. Sign in to load your pottery library on any device.");

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    renderCloudStatus("Supabase is configured, but the existing session could not be restored.");
    return;
  }

  if (data.session?.user) {
    await onSignedIn(data.session.user);
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await onSignedIn(session.user);
      return;
    }

    state.cloud.signedIn = false;
    state.cloud.user = null;
    state.cloud.syncReady = false;
    state.tags = [...state.localCache.tags];
    state.entries = [...state.localCache.entries];
    state.filters = { ...state.localCache.filters };
    state.formMode = "create";
    state.editingEntryId = null;
    hydrateEntryFormFromDraft();
    renderAll();
    renderCloudStatus("Signed out. Your library is now using local storage on this device.");
  });
}

function createSupabaseClient() {
  const url = cloudConfig.supabaseUrl?.trim();
  const key = cloudConfig.supabaseAnonKey?.trim();

  if (!url || !key || !window.supabase?.createClient) {
    return null;
  }

  return window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

function loadLocalCache() {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return {
      tags: [
        createTagRecord("cone 6"),
        createTagRecord("celadon"),
        createTagRecord("reduction"),
      ],
      entries: [],
      filters: {
        includeTagIds: [],
        excludeTagIds: [],
        matchMode: "all",
      },
    };
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      entries: Array.isArray(parsed.entries)
        ? parsed.entries.map((entry) => ({
            id: entry.id || crypto.randomUUID(),
            title: entry.title || "Untitled piece",
            notes: entry.notes || "",
            tagIds: Array.isArray(entry.tagIds) ? entry.tagIds : [],
            imageUrl: entry.imageUrl || entry.imageDataUrl || "",
            imagePath: entry.imagePath || null,
            createdAt: entry.createdAt || new Date().toISOString(),
          }))
        : [],
      filters: {
        includeTagIds: Array.isArray(parsed.filters?.includeTagIds) ? parsed.filters.includeTagIds : [],
        excludeTagIds: Array.isArray(parsed.filters?.excludeTagIds) ? parsed.filters.excludeTagIds : [],
        matchMode: parsed.filters?.matchMode === "any" ? "any" : "all",
      },
    };
  } catch {
    return {
      tags: [],
      entries: [],
      filters: {
        includeTagIds: [],
        excludeTagIds: [],
        matchMode: "all",
      },
    };
  }
}

function loadUiState() {
  const stored = window.localStorage.getItem(UI_STORAGE_KEY);
  const defaults = {
    collapsedSections: {
      masterTags: false,
      entryTags: false,
      includeTags: false,
      excludeTags: false,
    },
    entryDraft: {
      title: "",
      notes: "",
      tagIds: [],
      imageDataUrl: "",
      imageName: "",
    },
  };

  if (!stored) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      collapsedSections: {
        ...defaults.collapsedSections,
        ...(parsed.collapsedSections || {}),
      },
      entryDraft: {
        ...defaults.entryDraft,
        ...(parsed.entryDraft || {}),
      },
    };
  } catch {
    return defaults;
  }
}

function persistLocalCache() {
  state.localCache = {
    tags: [...state.tags],
    entries: [...state.entries],
    filters: { ...state.filters },
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.localCache));
}

function persistUiState() {
  window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state.ui));
}

function persistFilters() {
  if (!state.cloud.signedIn) {
    persistLocalCache();
  }
}

function createTagRecord(name) {
  return {
    id: crypto.randomUUID(),
    name,
  };
}

async function handleCreateTag(event) {
  event.preventDefault();
  const rawName = tagNameInput.value.trim();
  const normalizedName = normalizeTagName(rawName);

  if (!normalizedName) {
    return;
  }

  const exists = state.tags.some((tag) => normalizeTagName(tag.name) === normalizedName);
  if (exists) {
    window.alert("That tag already exists in your master list.");
    return;
  }

  if (state.cloud.signedIn) {
    const { error } = await supabaseClient.from("tags").insert({
      user_id: state.cloud.user.id,
      name: rawName,
      normalized_name: normalizedName,
    });

    if (error) {
      window.alert(`Cloud tag save failed: ${error.message}`);
      return;
    }

    await refreshCloudData();
  } else {
    state.tags.push(createTagRecord(rawName));
    state.tags.sort((first, second) => first.name.localeCompare(second.name));
    persistLocalCache();
  }

  tagForm.reset();
  renderAll();
}

async function handleDeleteTag(tagId) {
  const isUsed = state.entries.some((entry) => entry.tagIds.includes(tagId));

  if (isUsed) {
    window.alert("This tag is already assigned to at least one pottery piece. Remove it from those pieces first.");
    return;
  }

  if (state.cloud.signedIn) {
    const { error } = await supabaseClient.from("tags").delete().eq("id", tagId).eq("user_id", state.cloud.user.id);
    if (error) {
      window.alert(`Cloud tag delete failed: ${error.message}`);
      return;
    }

    state.filters.includeTagIds = state.filters.includeTagIds.filter((id) => id !== tagId);
    state.filters.excludeTagIds = state.filters.excludeTagIds.filter((id) => id !== tagId);
    if (state.ui.entryDraft.tagIds.includes(tagId)) {
      state.ui.entryDraft.tagIds = state.ui.entryDraft.tagIds.filter((id) => id !== tagId);
      persistUiState();
    }
    await refreshCloudData();
  } else {
    state.tags = state.tags.filter((tag) => tag.id !== tagId);
    state.filters.includeTagIds = state.filters.includeTagIds.filter((id) => id !== tagId);
    state.filters.excludeTagIds = state.filters.excludeTagIds.filter((id) => id !== tagId);
    state.ui.entryDraft.tagIds = state.ui.entryDraft.tagIds.filter((id) => id !== tagId);
    persistLocalCache();
    persistUiState();
  }

  if (state.formMode === "create") {
    syncDraftTagsWithAvailableTags();
  }

  renderAll();
}

async function handleEntrySubmit(event) {
  event.preventDefault();

  if (state.formMode === "edit") {
    await handleUpdateEntry();
    return;
  }

  await handleCreateEntry();
}

async function handleCreateEntry() {
  if (!state.tags.length) {
    window.alert("Add at least one master tag before saving a pottery piece.");
    return;
  }

  const draftImage = await ensureDraftImageReady();
  if (!draftImage) {
    window.alert("Please choose a photo first.");
    return;
  }

  const selectedTagIds = getCheckedValues(entryTagPicker);

  try {
    if (state.cloud.signedIn) {
      const imagePath = `${state.cloud.user.id}/${crypto.randomUUID()}.jpg`;
      const imageBlob = dataUrlToBlob(draftImage);
      const upload = await supabaseClient.storage.from(SUPABASE_BUCKET).upload(imagePath, imageBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });

      if (upload.error) {
        window.alert(`Image upload failed: ${upload.error.message}`);
        return;
      }

      const insertEntry = await supabaseClient
        .from("entries")
        .insert({
          user_id: state.cloud.user.id,
          title: titleInput.value.trim() || "Untitled piece",
          notes: notesInput.value.trim(),
          image_path: imagePath,
        })
        .select()
        .single();

      if (insertEntry.error) {
        window.alert(`Cloud entry save failed: ${insertEntry.error.message}`);
        return;
      }

      if (selectedTagIds.length) {
        const joinRows = selectedTagIds.map((tagId) => ({
          entry_id: insertEntry.data.id,
          tag_id: tagId,
        }));

        const joinInsert = await supabaseClient.from("entry_tags").insert(joinRows);
        if (joinInsert.error) {
          window.alert(`Cloud tag assignment failed: ${joinInsert.error.message}`);
          return;
        }
      }

      await refreshCloudData();
    } else {
      state.entries.unshift({
        id: crypto.randomUUID(),
        title: titleInput.value.trim() || "Untitled piece",
        notes: notesInput.value.trim(),
        tagIds: selectedTagIds,
        imageUrl: draftImage,
        imagePath: null,
        createdAt: new Date().toISOString(),
      });

      persistLocalCache();
    }

    resetEntryDraft();
    entryForm.reset();
    renderAll();
  } catch (error) {
    window.alert(error.message || "The image could not be processed.");
  }
}

async function handleUpdateEntry() {
  const entryId = state.editingEntryId;
  const entry = state.entries.find((item) => item.id === entryId);

  if (!entry) {
    window.alert("That pottery piece could not be found.");
    cancelEditMode();
    return;
  }

  const updatedTitle = titleInput.value.trim() || "Untitled piece";
  const updatedNotes = notesInput.value.trim();
  const updatedTagIds = getCheckedValues(entryTagPicker);

  if (state.cloud.signedIn) {
    const entryUpdate = await supabaseClient
      .from("entries")
      .update({
        title: updatedTitle,
        notes: updatedNotes,
      })
      .eq("id", entryId)
      .eq("user_id", state.cloud.user.id);

    if (entryUpdate.error) {
      window.alert(`Cloud entry update failed: ${entryUpdate.error.message}`);
      return;
    }

    const removeTags = await supabaseClient.from("entry_tags").delete().eq("entry_id", entryId);
    if (removeTags.error) {
      window.alert(`Cloud tag update failed: ${removeTags.error.message}`);
      return;
    }

    if (updatedTagIds.length) {
      const joinRows = updatedTagIds.map((tagId) => ({
        entry_id: entryId,
        tag_id: tagId,
      }));

      const addTags = await supabaseClient.from("entry_tags").insert(joinRows);
      if (addTags.error) {
        window.alert(`Cloud tag update failed: ${addTags.error.message}`);
        return;
      }
    }

    await refreshCloudData();
  } else {
    state.entries = state.entries.map((item) =>
      item.id === entryId
        ? {
            ...item,
            title: updatedTitle,
            notes: updatedNotes,
            tagIds: updatedTagIds,
          }
        : item
    );

    persistLocalCache();
  }

  cancelEditMode();
  renderAll();
}

async function handleDeleteEntry(entryId) {
  const confirmed = window.confirm("Delete this pottery piece from the library?");
  if (!confirmed) {
    return;
  }

  if (state.cloud.signedIn) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    const deleteEntry = await supabaseClient.from("entries").delete().eq("id", entryId).eq("user_id", state.cloud.user.id);
    if (deleteEntry.error) {
      window.alert(`Cloud entry delete failed: ${deleteEntry.error.message}`);
      return;
    }

    if (entry.imagePath) {
      await supabaseClient.storage.from(SUPABASE_BUCKET).remove([entry.imagePath]);
    }

    await refreshCloudData();
  } else {
    state.entries = state.entries.filter((entry) => entry.id !== entryId);
    persistLocalCache();
  }

  if (state.editingEntryId === entryId) {
    cancelEditMode();
  }

  renderAll();
}

function handleClearFilters() {
  state.filters.includeTagIds = [];
  state.filters.excludeTagIds = [];
  state.filters.matchMode = "all";
  persistFilters();
  renderAll();
}

async function handleGoogleSignIn() {
  if (!supabaseClient) {
    renderCloudStatus("Cloud sync is unavailable right now. Check your Supabase connection settings and try again.");
    return;
  }

  const redirectTo = window.location.href.split("#")[0];
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    authStatusText.textContent = `Google sign-in failed: ${error.message}`;
    return;
  }

  authStatusText.textContent = "Opening Google sign-in. Finish authentication there, then you will return here automatically.";
}

async function handleSignOut() {
  if (!supabaseClient) {
    return;
  }

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    authStatusText.textContent = `Sign-out failed: ${error.message}`;
  }
}

async function handleManualSync() {
  if (!state.cloud.signedIn) {
    return;
  }

  await refreshCloudData();
  renderAll();
}

async function onSignedIn(user) {
  state.cloud.signedIn = true;
  state.cloud.user = user;
  state.cloud.syncReady = true;
  await refreshCloudData();
  renderAll();
  renderCloudStatus(`Signed in as ${user.email || "your Google account"}. Your tags and pottery pieces now sync through Supabase.`);
}

async function refreshCloudData() {
  if (!state.cloud.signedIn) {
    return;
  }

  const [tagsResult, entriesResult, entryTagsResult] = await Promise.all([
    supabaseClient.from("tags").select("id, name").eq("user_id", state.cloud.user.id).order("name", { ascending: true }),
    supabaseClient.from("entries").select("id, title, notes, image_path, created_at").eq("user_id", state.cloud.user.id).order("created_at", { ascending: false }),
    supabaseClient
      .from("entry_tags")
      .select("entry_id, tag_id, entries!inner(user_id)")
      .eq("entries.user_id", state.cloud.user.id),
  ]);

  if (tagsResult.error || entriesResult.error || entryTagsResult.error) {
    const message = tagsResult.error?.message || entriesResult.error?.message || entryTagsResult.error?.message;
    renderCloudStatus(`Cloud refresh failed: ${message}`);
    return;
  }

  state.tags = tagsResult.data.map((tag) => ({
    id: tag.id,
    name: tag.name,
  }));

  state.entries = entriesResult.data.map((entry) => ({
    id: entry.id,
    title: entry.title,
    notes: entry.notes,
    tagIds: entryTagsResult.data.filter((item) => item.entry_id === entry.id).map((item) => item.tag_id),
    imageUrl: buildStoragePublicUrl(entry.image_path),
    imagePath: entry.image_path,
    createdAt: entry.created_at,
  }));

  state.filters.includeTagIds = state.filters.includeTagIds.filter((tagId) => state.tags.some((tag) => tag.id === tagId));
  state.filters.excludeTagIds = state.filters.excludeTagIds.filter((tagId) => state.tags.some((tag) => tag.id === tagId));
  syncDraftTagsWithAvailableTags();
}

function buildStoragePublicUrl(imagePath) {
  if (!imagePath || !cloudConfig.supabaseUrl) {
    return "";
  }

  return `${cloudConfig.supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${imagePath}`;
}

function renderAll() {
  renderMasterTags();
  renderTagPicker(entryTagPicker, getEntryFormSelectedTags(), "entry-tags");
  renderTagPicker(includeTagPicker, state.filters.includeTagIds, "include-tags");
  renderTagPicker(excludeTagPicker, state.filters.excludeTagIds, "exclude-tags");
  renderMatchMode();
  renderResults();
  renderCloudUi();
  renderCollapseState();
  renderEntryFormState();
  entryCount.textContent = String(state.entries.length);
}

function renderMasterTags() {
  if (!state.tags.length) {
    tagList.innerHTML = '<p class="empty-state-inline">No tags yet. Add your first controlled tag above.</p>';
    return;
  }

  tagList.innerHTML = "";
  state.tags.forEach((tag) => {
    const chip = document.createElement("div");
    chip.className = "tag-pill";

    const label = document.createElement("span");
    label.textContent = tag.name;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", () => handleDeleteTag(tag.id));

    chip.append(label, deleteButton);
    tagList.appendChild(chip);
  });
}

function renderTagPicker(container, selectedIds, groupName) {
  if (!state.tags.length) {
    container.innerHTML = '<p class="empty-state-inline">Add master tags first, then you can select them here.</p>';
    return;
  }

  container.innerHTML = "";
  state.tags.forEach((tag) => {
    const label = document.createElement("label");
    label.className = "selectable-tag";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = groupName;
    input.value = tag.id;
    input.checked = selectedIds.includes(tag.id);

    if (container === includeTagPicker || container === excludeTagPicker) {
      input.addEventListener("change", () => {
        syncFiltersFromDom();
        persistFilters();
        renderResults();
      });
    }

    if (container === entryTagPicker) {
      input.addEventListener("change", () => {
        if (state.formMode === "create") {
          state.ui.entryDraft.tagIds = getCheckedValues(entryTagPicker);
          persistUiState();
        }
      });
    }

    const text = document.createElement("span");
    text.textContent = tag.name;

    label.append(input, text);
    container.appendChild(label);
  });
}

function renderMatchMode() {
  document.querySelectorAll('input[name="matchMode"]').forEach((input) => {
    input.checked = input.value === state.filters.matchMode;
  });
}

function renderCloudUi() {
  const localMode = !state.cloud.signedIn;
  storageModeLabel.textContent = localMode
    ? "Your library is currently stored on this device."
    : "Your tags and pottery pieces are syncing through the cloud.";
  syncModeBadge.textContent = localMode ? "Local only" : "Cloud sync on";
  googleSignInButton.hidden = !localMode;
  signOutButton.hidden = !state.cloud.signedIn;
  syncNowButton.hidden = !state.cloud.signedIn;
}

function renderEntryFormState() {
  const editing = state.formMode === "edit";
  entrySubmitButton.textContent = editing ? "Save changes" : "Save pottery piece";
  cancelEditButton.hidden = !editing;
  imageInput.disabled = editing;
  imageInput.required = !editing && !state.ui.entryDraft.imageDataUrl;
  imageDraftStatus.textContent = getImageStatusText();
}

function renderCollapseState() {
  document.querySelectorAll(".collapse-toggle").forEach((button) => {
    const section = button.dataset.section;
    const collapsed = !!state.ui.collapsedSections[section];
    button.setAttribute("aria-expanded", String(!collapsed));
    button.classList.toggle("is-collapsed", collapsed);
    const panel = collapsiblePanels[section];
    if (panel) {
      panel.hidden = collapsed;
    }
  });
}

function syncFiltersFromDom() {
  state.filters.includeTagIds = getCheckedValues(includeTagPicker);
  state.filters.excludeTagIds = getCheckedValues(excludeTagPicker);
}

function renderResults() {
  const visibleEntries = getFilteredEntries();
  resultsSummary.textContent = `${visibleEntries.length} piece${visibleEntries.length === 1 ? "" : "s"} shown`;

  if (!visibleEntries.length) {
    resultsGrid.innerHTML = '<div class="empty-results">No pieces match this search yet. Try removing a filter or save more fired results.</div>';
    return;
  }

  resultsGrid.innerHTML = "";
  visibleEntries.forEach((entry) => {
    const card = entryCardTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector(".entry-image");
    const title = card.querySelector(".entry-title");
    const date = card.querySelector(".entry-date");
    const notes = card.querySelector(".entry-notes");
    const tags = card.querySelector(".entry-tags");
    const deleteButton = card.querySelector(".delete-entry");
    const editButton = card.querySelector(".edit-entry");

    image.src = entry.imageUrl;
    image.alt = entry.title;
    title.textContent = entry.title;
    date.textContent = new Date(entry.createdAt).toLocaleDateString();
    notes.textContent = entry.notes || "No notes added.";
    deleteButton.addEventListener("click", () => handleDeleteEntry(entry.id));
    editButton.addEventListener("click", () => startEditEntry(entry.id));

    const entryTags = state.tags.filter((tag) => entry.tagIds.includes(tag.id));
    entryTags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-pill";
      chip.textContent = tag.name;
      tags.appendChild(chip);
    });

    resultsGrid.appendChild(card);
  });
}

function getFilteredEntries() {
  const { includeTagIds, excludeTagIds, matchMode } = state.filters;

  return state.entries.filter((entry) => {
    const hasExcludedTag = excludeTagIds.some((tagId) => entry.tagIds.includes(tagId));
    if (hasExcludedTag) {
      return false;
    }

    if (!includeTagIds.length) {
      return true;
    }

    if (matchMode === "all") {
      return includeTagIds.every((tagId) => entry.tagIds.includes(tagId));
    }

    return includeTagIds.some((tagId) => entry.tagIds.includes(tagId));
  });
}

function getCheckedValues(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function normalizeTagName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, MAX_IMAGE_WIDTH / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      image.onerror = () => reject(new Error("Image could not be loaded."));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("Image file could not be read."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, content] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

function renderCloudStatus(message) {
  authStatusText.textContent = message;
  syncStatusText.textContent = message;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      renderCloudStatus("The app loaded, but offline install support could not be enabled in this browser.");
    });
  });
}

function toggleSection(section) {
  state.ui.collapsedSections[section] = !state.ui.collapsedSections[section];
  persistUiState();
  renderCollapseState();
}

function persistEntryDraftFromForm() {
  if (state.formMode !== "create") {
    return;
  }

  state.ui.entryDraft.title = titleInput.value;
  state.ui.entryDraft.notes = notesInput.value;
  state.ui.entryDraft.tagIds = getCheckedValues(entryTagPicker);
  persistUiState();
  renderEntryFormState();
}

async function handleImageSelection() {
  if (state.formMode !== "create") {
    imageInput.value = "";
    imageDraftStatus.textContent = "Images stay fixed while editing. Create a new piece if you need a different photo.";
    return;
  }

  const imageFile = imageInput.files?.[0];
  if (!imageFile) {
    return;
  }

  try {
    const compressedImage = await compressImage(imageFile);
    state.ui.entryDraft.imageDataUrl = compressedImage;
    state.ui.entryDraft.imageName = imageFile.name || "Selected photo";
    persistUiState();
    renderEntryFormState();
  } catch (error) {
    window.alert(error.message || "The image could not be processed.");
  }
}

async function ensureDraftImageReady() {
  if (state.ui.entryDraft.imageDataUrl) {
    return state.ui.entryDraft.imageDataUrl;
  }

  const imageFile = imageInput.files?.[0];
  if (!imageFile) {
    return "";
  }

  const compressedImage = await compressImage(imageFile);
  state.ui.entryDraft.imageDataUrl = compressedImage;
  state.ui.entryDraft.imageName = imageFile.name || "Selected photo";
  persistUiState();
  renderEntryFormState();
  return compressedImage;
}

function resetEntryDraft() {
  state.ui.entryDraft = {
    title: "",
    notes: "",
    tagIds: [],
    imageDataUrl: "",
    imageName: "",
  };
  persistUiState();
  state.formMode = "create";
  state.editingEntryId = null;
  hydrateEntryFormFromDraft();
}

function hydrateEntryFormFromDraft() {
  if (state.formMode === "edit") {
    return;
  }

  titleInput.value = state.ui.entryDraft.title || "";
  notesInput.value = state.ui.entryDraft.notes || "";
  imageInput.value = "";
}

function getEntryFormSelectedTags() {
  if (state.formMode === "edit") {
    const entry = state.entries.find((item) => item.id === state.editingEntryId);
    return entry ? entry.tagIds : [];
  }

  return state.ui.entryDraft.tagIds;
}

function startEditEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  state.formMode = "edit";
  state.editingEntryId = entryId;
  titleInput.value = entry.title;
  notesInput.value = entry.notes;
  imageInput.value = "";
  imageDraftStatus.textContent = "Editing keeps the current image. Create a new piece if you want to replace the photo.";
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleCancelEdit() {
  cancelEditMode();
  renderAll();
}

function cancelEditMode() {
  state.formMode = "create";
  state.editingEntryId = null;
  hydrateEntryFormFromDraft();
}

function getImageStatusText() {
  if (state.formMode === "edit") {
    return "Editing keeps the current image. Create a new piece if you want to replace the photo.";
  }

  if (state.ui.entryDraft.imageDataUrl) {
    const imageName = state.ui.entryDraft.imageName || "Selected photo";
    return `${imageName} is attached and ready to save, even if you leave the app and come back.`;
  }

  return "Choose a photo to attach it to this piece.";
}

function syncDraftTagsWithAvailableTags() {
  state.ui.entryDraft.tagIds = state.ui.entryDraft.tagIds.filter((tagId) => state.tags.some((tag) => tag.id === tagId));
  persistUiState();
}
