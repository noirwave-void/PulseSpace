const state = {
  view: "home",
  feedScope: "for-you",
  postTypeTab: "media",
  profileTab: "media",
  profileHandle: "",
  discoverIndex: 0,
  createType: "text",
  mediaData: "",
  mediaName: "",
  searchQuery: "",
  searchResults: null,
  isSearching: false,
  openComments: "",
  authMode: "login",
  data: {
    currentUser: null,
    users: [],
    posts: [],
    communities: [],
    creators: [],
    messages: []
  }
};

const viewMeta = {
  home: ["Personalized", "Home"],
  discover: ["Focused discovery", "Discover"],
  create: ["Text, photo, video", "Create"],
  search: ["Explore PulseSpace", "Search"],
  communities: ["Topic spaces", "Communities"],
  messages: ["Display only", "Messages"],
  profile: ["Public identity", "Profile"]
};

const viewRoot = document.querySelector("#viewRoot");
const viewTitle = document.querySelector("#viewTitle");
const viewEyebrow = document.querySelector("#viewEyebrow");
const navList = document.querySelector("#navList");
const toast = document.querySelector("#toast");
const topbarStatus = document.querySelector("#topbarStatus");
const sidebarProfile = document.querySelector("#sidebarProfile");

let searchTimer = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (Number.isNaN(number)) return String(value || "0");
  return number >= 1000 ? `${(number / 1000).toFixed(1)}K` : String(number);
}

function normalizeHandle(value) {
  const handle = String(value || "").trim().toLowerCase();
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function currentUser() {
  return state.data.currentUser;
}

function mediaPosts(posts = state.data.posts) {
  return posts.filter((post) => post.type === "photo" || post.type === "video");
}

function threadPosts(posts = state.data.posts) {
  return posts.filter((post) => post.type === "text");
}

function postsForTab(posts = state.data.posts, tab = state.postTypeTab) {
  if (tab === "threads") return threadPosts(posts);
  if (tab === "tagged") return [];
  return mediaPosts(posts);
}

function followingPosts() {
  const user = currentUser();
  const following = new Set(user?.following || []);
  return state.data.posts.filter((post) => following.has(post.authorId) || post.authorId === user?.id);
}

function forYouPosts() {
  return [...state.data.posts].sort(
    (a, b) => b.likes + b.shares + b.commentsCount - (a.likes + a.shares + a.commentsCount)
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function loadBootstrap() {
  topbarStatus.textContent = "Connecting...";
  const data = await api("/api/bootstrap");
  state.data = {
    currentUser: data.currentUser || null,
    users: data.users || data.creators || [],
    creators: data.creators || data.users || [],
    posts: data.posts || [],
    communities: data.communities || [],
    messages: data.messages || []
  };
  if (!state.profileHandle && state.data.currentUser) {
    state.profileHandle = state.data.currentUser.handle;
  }
  topbarStatus.textContent = state.data.currentUser ? "Backend connected" : "Sign in required";
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

function setSignedInUi(isSignedIn) {
  document.body.classList.toggle("auth-mode", !isSignedIn);
}

function renderShell() {
  const user = currentUser();
  setSignedInUi(Boolean(user));

  if (!user) {
    renderAuth();
    return;
  }

  setHeader();
  renderSidebarProfile();
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === state.view);
  });
  renderView();
}

function renderSidebarProfile() {
  const user = currentUser();
  sidebarProfile.innerHTML = `
    <button class="sidebar-profile-button" data-profile-handle="${escapeAttr(user.handle)}" type="button">
      <div class="avatar">${escapeHtml(user.initials)}</div>
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.handle)}</span>
      </div>
    </button>
  `;
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

function renderAuth() {
  topbarStatus.textContent = "Sign in required";
  viewRoot.innerHTML = `
    <section class="auth-shell">
      <div class="auth-brand">
        <div class="brand-mark">P</div>
        <div>
          <p class="eyebrow">PulseSpace</p>
          <h1>Sign in to your creator feed.</h1>
          <p>One clean social surface for visual posts, text threads, profiles, search, and communities.</p>
        </div>
      </div>
      <article class="auth-card">
        <div class="auth-tabs" role="tablist" aria-label="Authentication tabs">
          <button class="${state.authMode === "login" ? "is-active" : ""}" data-auth-mode="login" type="button">Log in</button>
          <button class="${state.authMode === "signup" ? "is-active" : ""}" data-auth-mode="signup" type="button">Sign up</button>
        </div>
        ${
          state.authMode === "login"
            ? `<form class="auth-form" id="loginForm">
                <label>Email or handle<input name="identifier" autocomplete="username" value="founder@pulsespace.local" required /></label>
                <label>Password<input name="password" type="password" autocomplete="current-password" value="password123" required /></label>
                <button class="primary-button" type="submit">Log in</button>
                <p class="demo-credentials">Demo: founder@pulsespace.local / password123</p>
              </form>`
            : `<form class="auth-form" id="signupForm">
                <label>Name<input name="name" autocomplete="name" required maxlength="60" placeholder="Your name" /></label>
                <label>Email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label>
                <label>Handle<input name="handle" required minlength="3" maxlength="24" placeholder="yourhandle" /></label>
                <label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="At least 8 characters" /></label>
                <button class="primary-button" type="submit">Create account</button>
              </form>`
        }
      </article>
    </section>
  `;
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
      <div class="story-ring"><span>${escapeHtml(community.initials)}</span></div>
      <strong>${escapeHtml(community.name)}</strong>
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
    <article class="post-card" id="post-${escapeAttr(post.id)}">
      <div class="post-header">
        <button class="identity identity-button" data-profile-handle="${escapeAttr(post.handle)}" type="button">
          <div class="avatar">${escapeHtml(post.initials)}</div>
          <div>
            <strong>${escapeHtml(post.author)}</strong>
            <span>${escapeHtml(post.handle)} - ${escapeHtml(post.community)}</span>
          </div>
        </button>
        <span class="post-type-label">${post.type === "text" ? "Thread" : post.type}</span>
      </div>
      ${mediaMarkup}
      <div class="post-content">
        ${caption}
        <div class="post-meta">#${escapeHtml(post.tag)} - ${new Date(post.createdAt).toLocaleDateString()}</div>
        <div class="post-actions">
          <button class="action-button ${post.liked ? "is-active" : ""}" data-action="like" data-post-id="${escapeAttr(post.id)}" type="button">Like ${formatNumber(post.likes)}</button>
          <button class="action-button ${state.openComments === post.id ? "is-active" : ""}" data-action="comments" data-post-id="${escapeAttr(post.id)}" type="button">Comments ${post.commentsCount}</button>
          <button class="action-button" data-action="share" data-post-id="${escapeAttr(post.id)}" type="button">Share ${post.shares}</button>
          <button class="action-button ${post.saved ? "is-active" : ""}" data-action="save" data-post-id="${escapeAttr(post.id)}" type="button">${post.saved ? "Saved" : "Save"}</button>
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
            ? post.comments.map(renderComment).join("")
            : `<p class="muted">No comments yet. Start the conversation.</p>`
        }
      </div>
      <form class="comment-form" data-comment-form="${escapeAttr(post.id)}">
        <input name="comment" maxlength="280" placeholder="Add a comment" required />
        <button class="secondary-button" type="submit">Post</button>
      </form>
    </section>
  `;
}

function renderComment(comment) {
  return `
    <div class="comment-row">
      <div class="avatar tiny-avatar">${escapeHtml(comment.initials)}</div>
      <p><strong>${escapeHtml(comment.author)}</strong> ${escapeHtml(comment.text)}</p>
    </div>
  `;
}

function renderDiscover() {
  const posts = postsForTab(state.data.posts, state.postTypeTab);
  if (state.discoverIndex >= posts.length) state.discoverIndex = 0;
  const post = posts.length ? posts[state.discoverIndex] : null;

  viewRoot.innerHTML = `
    <section class="discover-layout">
      ${renderTypeTabs("discover", state.postTypeTab)}
      ${
        post
          ? `<article class="focus-card">
              ${renderFocusMedia(post)}
              <div class="focus-caption">
                <button class="focus-author" data-profile-handle="${escapeAttr(post.handle)}" type="button">
                  <strong>${escapeHtml(post.author)}</strong>
                  <span>${escapeHtml(post.handle)}</span>
                </button>
                <p>${escapeHtml(post.text)}</p>
                <span>#${escapeHtml(post.tag)} - ${escapeHtml(post.community)}</span>
              </div>
              <div class="focus-actions">
                <button class="${post.liked ? "is-active" : ""}" data-action="like" data-post-id="${escapeAttr(post.id)}" type="button" aria-label="Like">L</button>
                <button data-action="comments" data-post-id="${escapeAttr(post.id)}" type="button" aria-label="Comments">C</button>
                <button data-action="share" data-post-id="${escapeAttr(post.id)}" type="button" aria-label="Share">S</button>
                <button class="${post.saved ? "is-active" : ""}" data-action="save" data-post-id="${escapeAttr(post.id)}" type="button" aria-label="Save">B</button>
              </div>
            </article>
            <div class="discover-controls">
              <button class="secondary-button" data-discover-step="-1" type="button">Previous</button>
              <span>${state.discoverIndex + 1} of ${posts.length}</span>
              <button class="secondary-button" data-discover-step="1" type="button">Next</button>
            </div>
            ${state.openComments === post.id ? `<div class="home-layout focus-comments">${renderPost(post)}</div>` : ""}`
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

function renderTypeTabs(scope, activeTab) {
  const tabs = scope === "profile" ? ["media", "threads", "tagged"] : ["media", "threads"];
  const labels = { media: "Posts", threads: "Threads", tagged: "Tagged" };
  return `
    <div class="content-tabs" aria-label="${scope} post type tabs">
      ${tabs
        .map(
          (tab) =>
            `<button class="content-tab ${activeTab === tab ? "is-active" : ""}" data-${scope}-tab="${tab}" type="button">${labels[tab]}</button>`
        )
        .join("")}
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
  const results = state.searchResults || { posts: [], users: [], creators: [], communities: [] };
  const users = results.users || results.creators || [];
  const hasResults = results.posts.length || users.length || results.communities.length;

  viewRoot.innerHTML = `
    <section class="search-page">
      <label class="search-input-label">
        <span>Search</span>
        <input id="searchPageInput" type="search" value="${escapeAttr(state.searchQuery)}" placeholder="Search posts, people, communities" autocomplete="off" />
      </label>
      ${
        query
          ? state.isSearching
            ? `<div class="loading-card">Searching...</div>`
            : hasResults
              ? `<div class="search-results">
                  ${users.map(renderUserResult).join("")}
                  ${results.communities.map(renderCommunityResult).join("")}
                  ${results.posts.map(renderPostResult).join("")}
                </div>`
              : `<div class="empty-state"><strong>No results</strong><p>Try a creator name, topic, post type, or community.</p></div>`
          : `<div class="search-hero"><strong>Find creators, communities, and posts.</strong><p>Search has its own dedicated tab so it never competes with the feed.</p></div>`
      }
    </section>
  `;

  const input = document.querySelector("#searchPageInput");
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
}

function renderUserResult(user) {
  return `
    <article class="result-card">
      <span class="chip">Profile</span>
      <button class="identity identity-button" data-profile-handle="${escapeAttr(user.handle)}" type="button">
        <div class="avatar">${escapeHtml(user.initials)}</div>
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <span>${escapeHtml(user.handle)} - ${escapeHtml(user.bio || "Creator")}</span>
        </div>
      </button>
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
      <button class="result-link" data-profile-handle="${escapeAttr(post.handle)}" type="button">
        <h3>${escapeHtml(post.author)} in ${escapeHtml(post.community)}</h3>
      </button>
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
        <p>The inbox layout is ready, but realtime sending should be connected after a database and websocket provider are selected.</p>
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

function profileUser() {
  const handle = state.profileHandle || currentUser()?.handle || "";
  return (
    state.data.users.find((user) => user.handle === handle) ||
    state.data.creators.find((user) => user.handle === handle) ||
    currentUser()
  );
}

function renderProfile() {
  const user = profileUser();
  if (!user) {
    viewRoot.innerHTML = `<div class="empty-state"><strong>Profile unavailable</strong><p>Sign in or open a valid profile.</p></div>`;
    return;
  }

  const ownProfile = user.id === currentUser()?.id;
  const allPosts = state.data.posts.filter((post) => post.authorId === user.id || post.handle === user.handle);
  const posts = postsForTab(allPosts, state.profileTab);

  viewRoot.innerHTML = `
    <section class="instagram-profile">
      <div class="profile-avatar-shell">
        <div class="avatar large-avatar">${escapeHtml(user.initials)}</div>
      </div>
      <div class="profile-main">
        <div class="profile-title-row">
          <div>
            <h2>${escapeHtml(user.handle.replace("@", ""))}</h2>
            <span>${escapeHtml(user.name)}</span>
          </div>
          <div class="profile-actions">
            ${
              ownProfile
                ? `<button class="secondary-button" type="button">Edit profile</button>
                   <button class="ghost-button" data-logout type="button">Log out</button>`
                : `<button class="primary-button" data-follow-handle="${escapeAttr(user.handle)}" type="button">${user.isFollowing ? "Following" : "Follow"}</button>
                   <button class="secondary-button" data-view="messages" type="button">Message</button>`
            }
          </div>
        </div>
        <div class="profile-meta-row">
          <span><strong>${allPosts.length}</strong> posts</span>
          <span><strong>${user.followers || formatNumber(user.followersCount)}</strong> followers</span>
          <span><strong>${user.followingCount ?? user.following?.length ?? 0}</strong> following</span>
        </div>
        <div class="profile-bio">
          <strong>${escapeHtml(user.name)}</strong>
          <p>${escapeHtml(user.bio || "New to PulseSpace.")}</p>
          ${user.website ? `<a href="#" aria-label="Profile website">${escapeHtml(user.website)}</a>` : ""}
        </div>
      </div>
    </section>
    <section class="highlight-row" aria-label="Profile highlights">
      <article class="highlight"><span>Posts</span></article>
      <article class="highlight"><span>Threads</span></article>
      <article class="highlight"><span>Saved</span></article>
    </section>
    ${renderTypeTabs("profile", state.profileTab)}
    <section class="profile-grid">
      ${
        posts.length
          ? posts.map(renderProfileTile).join("")
          : `<div class="empty-state"><strong>No ${state.profileTab === "threads" ? "threads" : state.profileTab === "tagged" ? "tagged posts" : "media posts"} yet</strong><p>${ownProfile ? "Publish one from Create." : "This profile has not posted here yet."}</p></div>`
      }
    </section>
  `;
}

function renderProfileTile(post) {
  if (post.type === "text") {
    return `<article class="profile-tile thread-tile"><p>${escapeHtml(post.text)}</p></article>`;
  }
  if (post.type === "video" && post.mediaUrl.startsWith("data:")) {
    return `<article class="profile-tile"><video src="${post.mediaUrl}" controls></video><span>Video</span></article>`;
  }
  return `<article class="profile-tile"><img src="${post.mediaUrl}" alt="${escapeHtml(post.type)} post" loading="lazy" /><span>${post.type === "video" ? "Video" : "Photo"}</span></article>`;
}

async function handleAuth(mode, form) {
  const payload =
    mode === "login"
      ? {
          identifier: form.elements.identifier.value.trim(),
          password: form.elements.password.value
        }
      : {
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          handle: form.elements.handle.value.trim(),
          password: form.elements.password.value
        };

  await api(`/api/auth/${mode}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadBootstrap();
  state.view = "home";
  state.profileHandle = currentUser()?.handle || "";
  showToast(mode === "login" ? "Welcome back" : "Account created");
  renderShell();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  state.data.currentUser = null;
  state.view = "home";
  state.profileHandle = "";
  showToast("Logged out");
  renderShell();
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
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    showToast("Share counted. Copy is unavailable in this browser.");
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
  state.postTypeTab = state.createType === "text" ? "threads" : "media";
  state.profileTab = state.postTypeTab;
  state.view = "home";
  showToast("Post published");
  renderShell();
}

async function submitComment(form) {
  const input = form.elements.comment;
  const postId = form.dataset.commentForm;
  const payload = await api(`/api/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ text: input.value.trim() })
  });
  updatePost(payload.post);
  input.value = "";
  showToast("Comment posted");
  renderShell();
}

async function followProfile(handle) {
  const apiHandle = normalizeHandle(handle).replace(/^@/, "");
  const payload = await api(`/api/users/${apiHandle}/follow`, {
    method: "POST",
    body: "{}"
  });
  state.data.currentUser = payload.currentUser;
  const updateUser = (list) => {
    const index = list.findIndex((user) => user.id === payload.user.id);
    if (index >= 0) list[index] = payload.user;
  };
  updateUser(state.data.users);
  updateUser(state.data.creators);
  showToast(payload.user.isFollowing ? "Following" : "Unfollowed");
  renderShell();
}

async function runSearch(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    state.searchResults = null;
    state.isSearching = false;
    renderSearch();
    return;
  }

  state.isSearching = true;
  renderSearch();
  try {
    state.searchResults = await api(`/api/search?q=${encodeURIComponent(trimmed)}`);
  } finally {
    state.isSearching = false;
    renderSearch();
  }
}

function openProfile(handle) {
  state.profileHandle = normalizeHandle(handle);
  state.profileTab = "media";
  state.view = "profile";
  state.openComments = "";
  renderShell();
}

navList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  if (!currentUser()) return;
  state.view = button.dataset.view;
  if (state.view === "profile") {
    state.profileHandle = currentUser().handle;
  }
  state.openComments = "";
  state.discoverIndex = 0;
  renderShell();
});

document.addEventListener("click", async (event) => {
  const authMode = event.target.closest("[data-auth-mode]");
  const feedTab = event.target.closest("[data-feed-scope]");
  const discoverTab = event.target.closest("[data-discover-tab]");
  const profileTab = event.target.closest("[data-profile-tab]");
  const createType = event.target.closest("[data-create-type]");
  const actionButton = event.target.closest("[data-action]");
  const discoverStep = event.target.closest("[data-discover-step]");
  const profileButton = event.target.closest("[data-profile-handle]");
  const followButton = event.target.closest("[data-follow-handle]");
  const logoutButton = event.target.closest("[data-logout]");
  const viewButton = event.target.closest("[data-view]");

  try {
    if (authMode) {
      state.authMode = authMode.dataset.authMode;
      renderAuth();
      return;
    }

    if (profileButton && !actionButton && !followButton) {
      openProfile(profileButton.dataset.profileHandle);
      return;
    }

    if (feedTab) {
      state.feedScope = feedTab.dataset.feedScope;
      renderHome();
      return;
    }

    if (discoverTab) {
      state.postTypeTab = discoverTab.dataset.discoverTab;
      state.discoverIndex = 0;
      renderDiscover();
      return;
    }

    if (profileTab) {
      state.profileTab = profileTab.dataset.profileTab;
      renderProfile();
      return;
    }

    if (createType) {
      state.createType = createType.dataset.createType;
      state.mediaData = "";
      state.mediaName = "";
      renderCreate();
      return;
    }

    if (discoverStep) {
      const posts = postsForTab(state.data.posts, state.postTypeTab);
      if (posts.length) {
        const next = state.discoverIndex + Number(discoverStep.dataset.discoverStep);
        state.discoverIndex = (next + posts.length) % posts.length;
      }
      renderDiscover();
      return;
    }

    if (followButton) {
      await followProfile(followButton.dataset.followHandle);
      return;
    }

    if (logoutButton) {
      await logout();
      return;
    }

    if (viewButton && viewButton.dataset.view === "messages") {
      state.view = "messages";
      renderShell();
      return;
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
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      runSearch(state.searchQuery).catch((error) => showToast(error.message));
    }, 220);
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
  const loginForm = event.target.closest("#loginForm");
  const signupForm = event.target.closest("#signupForm");
  const createForm = event.target.closest("#createForm");
  const commentForm = event.target.closest("[data-comment-form]");

  try {
    if (loginForm) {
      event.preventDefault();
      await handleAuth("login", loginForm);
    }

    if (signupForm) {
      event.preventDefault();
      await handleAuth("signup", signupForm);
    }

    if (createForm) {
      event.preventDefault();
      await createPost(createForm);
    }

    if (commentForm) {
      event.preventDefault();
      await submitComment(commentForm);
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


