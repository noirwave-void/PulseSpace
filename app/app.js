const state = {
  view: "home",
  feedScope: "for-you",
  postTypeTab: "media",
  discoverIndex: 0,
  createType: "text",
  mediaData: "",
  mediaName: "",
  searchQuery: "",
  openComments: "",
  data: {
    currentUser: null,
    posts: [],
    communities: [],
    creators: [],
    messages: []
  }
};

const viewMeta = {
  home: ["Personalized", "Home"],
  discover: ["Media and threads", "Discover"],
  create: ["Text, photo, video", "Create"],
  search: ["Explore PulseSpace", "Search"],
  communities: ["Topic spaces", "Communities"],
  messages: ["Preview only", "Messages"],
  profile: ["Public identity", "Profile"]
};

const viewRoot = document.querySelector("#viewRoot");
const viewTitle = document.querySelector("#viewTitle");
const viewEyebrow = document.querySelector("#viewEyebrow");
const navList = document.querySelector("#navList");
const toast = document.querySelector("#toast");
const topbarStatus = document.querySelector("#topbarStatus");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

function mediaPosts(posts = state.data.posts) {
  return posts.filter((post) => post.type === "photo" || post.type === "video");
}

function threadPosts(posts = state.data.posts) {
  return posts.filter((post) => post.type === "text");
}

function postsForType(posts = state.data.posts) {
  return state.postTypeTab === "media" ? mediaPosts(posts) : threadPosts(posts);
}

function followingPosts() {
  const following = new Set(state.data.currentUser?.following || []);
  const ownHandle = state.data.currentUser?.handle;
  return state.data.posts.filter((post) => following.has(post.handle) || post.handle === ownHandle);
}

function forYouPosts() {
  return [...state.data.posts].sort(
    (a, b) => b.likes + b.shares + b.commentsCount - (a.likes + a.shares + a.commentsCount)
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function loadBootstrap() {
  topbarStatus.textContent = "Connecting...";
  const data = await api("/api/bootstrap");
  state.data = data;
  topbarStatus.textContent = "Backend connected";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function updatePost(updatedPost) {
  const index = state.data.posts.findIndex((post) => post.id === updatedPost.id);
  if (index >= 0) {
    state.data.posts[index] = updatedPost;
  } else {
    state.data.posts.unshift(updatedPost);
  }
}

function setHeader() {
  const [eyebrow, title] = viewMeta[state.view];
  viewEyebrow.textContent = eyebrow;
  viewTitle.textContent = title;
}

function renderShell() {
  setHeader();
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === state.view);
  });
  renderView();
}

function renderView() {
  if (state.view === "home") renderHome();
  if (state.view === "discover") renderDiscover();
  if (state.view === "create") renderCreate();
  if (state.view === "search") renderSearch();
  if (state.view === "communities") renderCommunities();
  if (state.view === "messages") renderMessages();
  if (state.view === "profile") renderProfile();
}

function renderHome() {
  const posts = state.feedScope === "following" ? followingPosts() : forYouPosts();
  viewRoot.innerHTML = `
    <div class="home-layout stack">
      <section class="story-strip" aria-label="Community stories">
        ${state.data.communities.map(renderStory).join("")}
      </section>
      <div class="segmented-control" aria-label="Feed tabs">
        <button class="segment ${state.feedScope === "for-you" ? "is-active" : ""}" data-feed-scope="for-you" type="button">For You</button>
        <button class="segment ${state.feedScope === "following" ? "is-active" : ""}" data-feed-scope="following" type="button">Following</button>
      </div>
      ${
        posts.length
          ? posts.map(renderPost).join("")
          : `<div class="empty-state"><strong>No posts yet</strong><p>Follow creators or publish your first post to fill this feed.</p></div>`
      }
    </div>
  `;
}

function renderStory(community) {
  return `
    <article class="story-item">
      <div class="story-ring"><span>${community.initials}</span></div>
      <strong>${community.name}</strong>
    </article>
  `;
}

function renderPost(post) {
  const mediaMarkup = renderPostMedia(post);
  const caption =
    post.type === "text"
      ? `<p class="post-caption"><strong>${escapeHtml(post.author)}</strong> posted a thread.</p>`
      : `<p class="post-caption"><strong>${escapeHtml(post.author)}</strong> ${escapeHtml(post.text)}</p>`;

  return `
    <article class="post-card" id="post-${post.id}">
      <div class="post-header">
        <div class="identity">
          <div class="avatar">${escapeHtml(post.initials)}</div>
          <div>
            <strong>${escapeHtml(post.author)}</strong>
            <span>${escapeHtml(post.handle)} - ${escapeHtml(post.community)}</span>
          </div>
        </div>
        <span class="post-type-label">${post.type === "text" ? "Thread" : post.type}</span>
      </div>
      ${mediaMarkup}
      <div class="post-content">
        ${caption}
        <div class="post-meta">#${escapeHtml(post.tag)} - ${new Date(post.createdAt).toLocaleDateString()}</div>
        <div class="post-actions">
          <button class="action-button ${post.liked ? "is-active" : ""}" data-action="like" data-post-id="${post.id}" type="button">Like ${formatNumber(post.likes)}</button>
          <button class="action-button ${state.openComments === post.id ? "is-active" : ""}" data-action="comments" data-post-id="${post.id}" type="button">Comments ${post.commentsCount}</button>
          <button class="action-button" data-action="share" data-post-id="${post.id}" type="button">Share ${post.shares}</button>
          <button class="action-button ${post.saved ? "is-active" : ""}" data-action="save" data-post-id="${post.id}" type="button">${post.saved ? "Saved" : "Save"}</button>
        </div>
        ${state.openComments === post.id ? renderComments(post) : ""}
      </div>
    </article>
  `;
}

function renderPostMedia(post) {
  if (post.type === "text") {
    return `<div class="thread-body"><p>${escapeHtml(post.text)}</p></div>`;
  }

  const badge = post.type === "video" ? "Video" : "Photo";
  const media =
    post.type === "video" && post.mediaUrl.startsWith("data:")
      ? `<video src="${post.mediaUrl}" controls></video>`
      : `<img src="${post.mediaUrl}" alt="${escapeHtml(post.type)} post by ${escapeHtml(post.author)}" loading="lazy" />`;

  return `
    <div class="post-media">
      ${media}
      <span class="media-badge">${badge}</span>
    </div>
  `;
}

function renderComments(post) {
  return `
    <section class="comments-panel">
      <div class="comments-list">
        ${
          post.comments?.length
            ? post.comments
                .map(
                  (comment) => `
                    <div class="comment-row">
                      <div class="avatar tiny-avatar">${escapeHtml(comment.initials)}</div>
                      <p><strong>${escapeHtml(comment.author)}</strong> ${escapeHtml(comment.text)}</p>
                    </div>
                  `
                )
                .join("")
            : `<p class="muted">No comments yet. Start the conversation.</p>`
        }
      </div>
      <form class="comment-form" data-comment-form="${post.id}">
        <input name="comment" maxlength="280" placeholder="Add a comment" required />
        <button class="secondary-button" type="submit">Post</button>
      </form>
    </section>
  `;
}

function renderDiscover() {
  const posts = postsForType();
  const post = posts[state.discoverIndex % Math.max(posts.length, 1)];
  viewRoot.innerHTML = `
    <section class="discover-layout">
      ${renderTypeTabs("discover")}
      ${
        post
          ? `<article class="focus-card">
              ${renderFocusMedia(post)}
              <div class="focus-caption">
                <strong>${escapeHtml(post.author)} <span>${escapeHtml(post.handle)}</span></strong>
                <p>${escapeHtml(post.text)}</p>
                <span>#${escapeHtml(post.tag)} - ${escapeHtml(post.community)}</span>
              </div>
              <div class="focus-actions">
                <button class="${post.liked ? "is-active" : ""}" data-action="like" data-post-id="${post.id}" type="button" aria-label="Like">L</button>
                <button data-action="comments" data-post-id="${post.id}" type="button" aria-label="Comments">C</button>
                <button data-action="share" data-post-id="${post.id}" type="button" aria-label="Share">S</button>
                <button class="${post.saved ? "is-active" : ""}" data-action="save" data-post-id="${post.id}" type="button" aria-label="Save">B</button>
              </div>
            </article>
            <div class="discover-controls">
              <button class="secondary-button" data-discover-step="-1" type="button">Previous</button>
              <span>${state.discoverIndex + 1} of ${posts.length}</span>
              <button class="secondary-button" data-discover-step="1" type="button">Next</button>
            </div>
            ${state.openComments === post.id ? `<div class="home-layout">${renderPost(post)}</div>` : ""}`
          : `<div class="empty-state"><strong>No ${state.postTypeTab === "media" ? "media posts" : "threads"} yet</strong><p>Create one and it will appear here.</p></div>`
      }
    </section>
  `;
}

function renderFocusMedia(post) {
  if (post.type === "text") {
    return `<div class="focus-thread"><p>${escapeHtml(post.text)}</p></div>`;
  }
  if (post.type === "video" && post.mediaUrl.startsWith("data:")) {
    return `<video src="${post.mediaUrl}" controls autoplay muted loop></video>`;
  }
  return `<img src="${post.mediaUrl}" alt="${escapeHtml(post.type)} by ${escapeHtml(post.author)}" />`;
}

function renderTypeTabs(scope) {
  return `
    <div class="content-tabs" aria-label="${scope} post type tabs">
      <button class="content-tab ${state.postTypeTab === "media" ? "is-active" : ""}" data-post-type-tab="media" type="button">Media</button>
      <button class="content-tab ${state.postTypeTab === "threads" ? "is-active" : ""}" data-post-type-tab="threads" type="button">Threads</button>
    </div>
  `;
}

function renderCreate() {
  const accept = state.createType === "photo" ? "image/*" : "video/*";
  viewRoot.innerHTML = `
    <div class="create-layout">
      <section class="create-card">
        <div>
          <p class="eyebrow">One publishing flow</p>
          <h2>Publish to PulseSpace</h2>
        </div>
        <div class="type-switcher" role="tablist" aria-label="Post type">
          <button class="type-button ${state.createType === "text" ? "is-active" : ""}" data-create-type="text" type="button">Thread</button>
          <button class="type-button ${state.createType === "photo" ? "is-active" : ""}" data-create-type="photo" type="button">Photo</button>
          <button class="type-button ${state.createType === "video" ? "is-active" : ""}" data-create-type="video" type="button">Video</button>
        </div>
        <form id="createForm" class="composer-form">
          <label>
            ${state.createType === "text" ? "Thread text" : "Caption"}
            <textarea id="composerText" required maxlength="500" placeholder="${state.createType === "text" ? "Start a thread..." : "Write a caption..."}"></textarea>
          </label>
          <div class="upload-area ${state.createType === "text" ? "" : "is-visible"}">
            <label>
              ${state.createType === "photo" ? "Photo upload" : "Video upload"}
              <input class="file-control" id="mediaInput" type="file" accept="${accept}" />
            </label>
            <div class="upload-preview ${state.mediaData ? "is-visible" : ""}">
              ${renderUploadPreview()}
            </div>
          </div>
          <div class="form-row">
            <label>
              Community
              <select id="composerCommunity">
                ${state.data.communities.map((community) => `<option>${escapeHtml(community.name)}</option>`).join("")}
              </select>
            </label>
            <button class="primary-button" type="submit">Publish</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderUploadPreview() {
  if (!state.mediaData) return "";
  if (state.createType === "video") {
    return `<video src="${state.mediaData}" controls></video>`;
  }
  return `<img src="${state.mediaData}" alt="${escapeHtml(state.mediaName || "Upload preview")}" />`;
}

function renderSearch() {
  const query = state.searchQuery.trim();
  const results = query ? getLocalSearchResults(query) : { posts: [], creators: [], communities: [] };
  const hasResults = results.posts.length || results.creators.length || results.communities.length;

  viewRoot.innerHTML = `
    <section class="search-page">
      <label class="search-input-label">
        <span>Search</span>
        <input id="searchPageInput" type="search" value="${escapeHtml(state.searchQuery)}" placeholder="Search posts, creators, communities" autofocus />
      </label>
      ${
        query
          ? hasResults
            ? `<div class="search-results">
                ${results.creators.map(renderCreatorResult).join("")}
                ${results.communities.map(renderCommunityResult).join("")}
                ${results.posts.map(renderPostResult).join("")}
              </div>`
            : `<div class="empty-state"><strong>No results</strong><p>Try a creator name, topic, post type, or community.</p></div>`
          : `<div class="search-hero"><strong>Find creators, communities, and posts.</strong><p>Search is now its own dedicated tab instead of competing with the feed.</p></div>`
      }
    </section>
  `;

  const input = document.querySelector("#searchPageInput");
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
}

function getLocalSearchResults(query) {
  const needle = query.toLowerCase();
  const includes = (...values) => values.join(" ").toLowerCase().includes(needle);
  return {
    creators: state.data.creators.filter((creator) =>
      includes(creator.name, creator.handle, creator.niche, creator.followers)
    ),
    communities: state.data.communities.filter((community) =>
      includes(community.name, community.members, community.focus)
    ),
    posts: state.data.posts.filter((post) =>
      includes(post.author, post.handle, post.community, post.type, post.text, post.tag)
    )
  };
}

function renderCreatorResult(creator) {
  return `
    <article class="result-card">
      <span class="chip">Creator</span>
      <div class="identity">
        <div class="avatar">${escapeHtml(creator.initials)}</div>
        <div>
          <strong>${escapeHtml(creator.name)}</strong>
          <span>${escapeHtml(creator.handle)} - ${escapeHtml(creator.niche)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderCommunityResult(community) {
  return `
    <article class="result-card">
      <span class="chip">Community</span>
      <h3>${escapeHtml(community.name)}</h3>
      <p>${escapeHtml(community.members)} members - ${escapeHtml(community.focus)}</p>
    </article>
  `;
}

function renderPostResult(post) {
  return `
    <article class="result-card">
      <span class="chip">${post.type === "text" ? "Thread" : post.type}</span>
      <h3>${escapeHtml(post.author)} in ${escapeHtml(post.community)}</h3>
      <p>${escapeHtml(post.text)}</p>
    </article>
  `;
}

function renderCommunities() {
  viewRoot.innerHTML = `
    <section class="community-grid">
      ${state.data.communities
        .map(
          (community) => `
            <article class="community-card">
              <div class="community-glow"></div>
              <div class="identity">
                <div class="avatar">${escapeHtml(community.initials)}</div>
                <div>
                  <h3>${escapeHtml(community.name)}</h3>
                  <span>${escapeHtml(community.members)} members</span>
                </div>
              </div>
              <p>${escapeHtml(community.focus)}</p>
              <div class="chip-row">
                <span class="chip">Open</span>
                <span class="chip">Active today</span>
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderMessages() {
  viewRoot.innerHTML = `
    <section class="messages-layout">
      <div class="dm-note">
        <strong>Messages are display-only in this slice.</strong>
        <p>The UI is ready for conversations, but live send/receive will be connected after auth and realtime transport.</p>
      </div>
      <div class="message-grid">
        ${state.data.messages
          .map(
            (message) => `
              <article class="message-card">
                <div class="avatar">${escapeHtml(message.initials)}</div>
                <div>
                  <h3>${escapeHtml(message.from)}</h3>
                  <p>${escapeHtml(message.text)}</p>
                </div>
                <span class="post-meta">${escapeHtml(message.time)}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProfile() {
  const user = state.data.currentUser;
  const ownPosts = state.data.posts.filter((post) => post.handle === user.handle);
  const posts = postsForType(ownPosts);

  viewRoot.innerHTML = `
    <section class="profile-header">
      <div class="avatar large-avatar">${escapeHtml(user.initials)}</div>
      <div class="profile-copy">
        <div>
          <h2>${escapeHtml(user.name)}</h2>
          <span>${escapeHtml(user.handle)}</span>
        </div>
        <p>${escapeHtml(user.bio)}</p>
        <div class="profile-stats">
          <span><strong>${ownPosts.length}</strong> posts</span>
          <span><strong>12.8K</strong> followers</span>
          <span><strong>${user.following.length}</strong> following</span>
        </div>
      </div>
    </section>
    ${renderTypeTabs("profile")}
    <section class="profile-post-grid">
      ${
        posts.length
          ? posts.map(renderProfileTile).join("")
          : `<div class="empty-state"><strong>No ${state.postTypeTab === "media" ? "media posts" : "threads"} yet</strong><p>Publish one from Create.</p></div>`
      }
    </section>
  `;
}

function renderProfileTile(post) {
  if (post.type === "text") {
    return `<article class="profile-grid-card"><div class="text-tile">${escapeHtml(post.text)}</div></article>`;
  }
  if (post.type === "video" && post.mediaUrl.startsWith("data:")) {
    return `<article class="profile-grid-card"><video src="${post.mediaUrl}" controls></video></article>`;
  }
  return `<article class="profile-grid-card"><img src="${post.mediaUrl}" alt="${escapeHtml(post.type)} post" loading="lazy" /></article>`;
}

async function handlePostAction(action, postId) {
  if (action === "comments") {
    state.openComments = state.openComments === postId ? "" : postId;
    renderShell();
    return;
  }

  const endpoint = `/api/posts/${postId}/${action}`;
  const payload = await api(endpoint, { method: "POST", body: "{}" });
  updatePost(payload.post);

  if (action === "share") {
    await copyShareUrl(payload.shareUrl);
    showToast("Share link copied");
  }
  renderShell();
}

async function copyShareUrl(url) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function createPost(form) {
  const text = form.querySelector("#composerText").value.trim();
  const community = form.querySelector("#composerCommunity").value;

  if ((state.createType === "photo" || state.createType === "video") && !state.mediaData) {
    showToast(`Upload a ${state.createType} first`);
    return;
  }

  const payload = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      type: state.createType,
      text,
      community,
      mediaUrl: state.createType === "text" ? "" : state.mediaData
    })
  });

  updatePost(payload.post);
  state.mediaData = "";
  state.mediaName = "";
  state.view = "home";
  showToast("Post published");
  renderShell();
}

navList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  state.view = button.dataset.view;
  state.openComments = "";
  state.discoverIndex = 0;
  renderShell();
});

document.addEventListener("click", async (event) => {
  const feedTab = event.target.closest("[data-feed-scope]");
  const typeTab = event.target.closest("[data-post-type-tab]");
  const createType = event.target.closest("[data-create-type]");
  const actionButton = event.target.closest("[data-action]");
  const discoverStep = event.target.closest("[data-discover-step]");

  try {
    if (feedTab) {
      state.feedScope = feedTab.dataset.feedScope;
      renderHome();
    }

    if (typeTab) {
      state.postTypeTab = typeTab.dataset.postTypeTab;
      state.discoverIndex = 0;
      renderShell();
    }

    if (createType) {
      state.createType = createType.dataset.createType;
      state.mediaData = "";
      state.mediaName = "";
      renderCreate();
    }

    if (discoverStep) {
      const posts = postsForType();
      const next = state.discoverIndex + Number(discoverStep.dataset.discoverStep);
      state.discoverIndex = (next + posts.length) % posts.length;
      renderDiscover();
    }

    if (actionButton) {
      await handlePostAction(actionButton.dataset.action, actionButton.dataset.postId);
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("input", async (event) => {
  if (event.target.id === "searchPageInput") {
    state.searchQuery = event.target.value;
    renderSearch();
  }

  if (event.target.id === "mediaInput") {
    const file = event.target.files?.[0];
    if (!file) return;
    const isValidPhoto = state.createType === "photo" && file.type.startsWith("image/");
    const isValidVideo = state.createType === "video" && file.type.startsWith("video/");
    if (!isValidPhoto && !isValidVideo) {
      showToast(`Choose a valid ${state.createType} file`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("Use a file under 10MB for this local MVP");
      return;
    }
    state.mediaData = await fileToDataUrl(file);
    state.mediaName = file.name;
    renderCreate();
  }
});

document.addEventListener("submit", async (event) => {
  const createForm = event.target.closest("#createForm");
  const commentForm = event.target.closest("[data-comment-form]");

  try {
    if (createForm) {
      event.preventDefault();
      await createPost(createForm);
    }

    if (commentForm) {
      event.preventDefault();
      const input = commentForm.elements.comment;
      const postId = commentForm.dataset.commentForm;
      const payload = await api(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: input.value.trim() })
      });
      updatePost(payload.post);
      input.value = "";
      showToast("Comment posted");
      renderShell();
    }
  } catch (error) {
    showToast(error.message);
  }
});

async function init() {
  try {
    await loadBootstrap();
    renderShell();
  } catch (error) {
    topbarStatus.textContent = "Backend unavailable";
    viewRoot.innerHTML = `<div class="empty-state"><strong>Could not load app data</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

init();
