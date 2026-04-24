const STORAGE_KEY = "pottery-tag-library-v2";
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

const includeTagPicker = document.querySelector("#includeTagPicker");
const excludeTagPicker = document.querySelector("#excludeTagPicker");
const clearFiltersButton = document.querySelector("#clearFiltersButton");

const resultsGrid = document.querySelector("#resultsGrid");
const resultsSummary = document.querySelector("#resultsSummary");
const entryCount = document.querySelector("#entryCount");
const entryCardTemplate = document.querySelector("#entryCardTemplate");
const storageModeLabel = document.querySelector("#storageModeLabel");

const authForm = document.querySelector("#authForm");
const googleSignInButton = document.querySelector("#googleSignInButton");
const authStatusText = document.querySelector("#authStatusText");
const syncStatusText = document.querySelector("#syncStatusText");
const syncModeBadge = document.querySelector("#syncModeBadge");
const signOutButton = document.querySelector("#signOutButton");
const syncNowButton = document.querySelector("#syncNowButton");

tagForm.addEventListener("submit", handleCreateTag);
entryForm.addEventListener("submit", handleCreateEntry);
clearFiltersButton.addEventListener("click", handleClearFilters);
googleSignInButton.addEventListener("click", handleGoogleSignIn);
signOutButton.addEventListener("click", handleSignOut);
syncNowButton.addEventListener("click", handleManualSync);

document.querySelectorAll('input[name="matchMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.filters.matchMode = input.value;
    persistFilters();
    renderResults();
  });
});

initializeApp();

async function initializeApp() {
  state.tags = [...state.localCache.tags];
  state.entries = [...state.localCache.entries];
  state.filters = { ...state.localCache.filters };

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

function persistLocalCache() {
  state.localCache = {
    tags: [...state.tags],
    entries: [...state.entries],
    filters: { ...state.filters },
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.localCache));
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
    await refreshCloudData();
  } else {
    state.tags = state.tags.filter((tag) => tag.id !== tagId);
    state.filters.includeTagIds = state.filters.includeTagIds.filter((id) => id !== tagId);
    state.filters.excludeTagIds = state.filters.excludeTagIds.filter((id) => id !== tagId);
    persistLocalCache();
  }

  renderAll();
}

async function handleCreateEntry(event) {
  event.preventDefault();

  if (!state.tags.length) {
    window.alert("Add at least one master tag before saving a pottery piece.");
    return;
  }

  const imageFile = imageInput.files?.[0];
  if (!imageFile) {
    window.alert("Please choose a photo first.");
    return;
  }

  const selectedTagIds = getCheckedValues(entryTagPicker);

  try {
    const compressedImage = await compressImage(imageFile);

    if (state.cloud.signedIn) {
      const imagePath = `${state.cloud.user.id}/${crypto.randomUUID()}.jpg`;
      const imageBlob = dataUrlToBlob(compressedImage);
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
        imageUrl: compressedImage,
        imagePath: null,
        createdAt: new Date().toISOString(),
      });

      persistLocalCache();
    }

    entryForm.reset();
    renderAll();
  } catch (error) {
    window.alert(error.message || "The image could not be processed.");
  }
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
}

function buildStoragePublicUrl(imagePath) {
  if (!imagePath || !cloudConfig.supabaseUrl) {
    return "";
  }

  return `${cloudConfig.supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${imagePath}`;
}

function renderAll() {
  renderMasterTags();
  renderTagPicker(entryTagPicker, [], "entry-tags");
  renderTagPicker(includeTagPicker, state.filters.includeTagIds, "include-tags");
  renderTagPicker(excludeTagPicker, state.filters.excludeTagIds, "exclude-tags");
  renderMatchMode();
  renderResults();
  renderCloudUi();
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
  signOutButton.hidden = !state.cloud.signedIn;
  syncNowButton.hidden = !state.cloud.signedIn;
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

    image.src = entry.imageUrl;
    image.alt = entry.title;
    title.textContent = entry.title;
    date.textContent = new Date(entry.createdAt).toLocaleDateString();
    notes.textContent = entry.notes || "No notes added.";
    deleteButton.addEventListener("click", () => handleDeleteEntry(entry.id));

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
