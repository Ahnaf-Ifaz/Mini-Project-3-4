/* Showbox – TV Show Explorer
   MP3: DOM rendering, events, array methods
   MP4: fetch + async/await, loading/error/empty states, localStorage */

const API = "https://api.tvmaze.com";
const WATCHLIST_KEY = "showbox:watchlist";
const QUERY_KEY = "showbox:lastQuery";

// ---------- Application state ----------
const state = {
  shows: [],            // results from the API
  watchlist: loadWatchlist(),
  view: "browse",       // "browse" | "watchlist"
  genre: "All",
  sort: "rating",
  query: "",
  requestId: 0,         // ignores outdated responses
};

// ---------- DOM references ----------
const $ = (selector) => document.querySelector(selector);
const grid = $("#grid");
const stateBox = $("#state");
const chipsBox = $("#chips");
const resultInfo = $("#result-info");
const searchForm = $("#search-form");
const searchInput = $("#search-input");
const sortSelect = $("#sort");
const watchCount = $("#watch-count");
const modal = $("#modal");
const modalBody = $("#modal-body");

// ---------- localStorage ----------
function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state.watchlist));
  } catch (err) {
    console.warn("Could not save watchlist:", err);
  }
}

function isSaved(id) {
  return state.watchlist.some((show) => show.id === id);
}

function toggleSaved(id) {
  const existing = state.watchlist.find((show) => show.id === id);
  if (existing) {
    state.watchlist = state.watchlist.filter((show) => show.id !== id);
  } else {
    const show = state.shows.find((s) => s.id === id);
    if (show) state.watchlist.push(show);
  }
  saveWatchlist();
  render();
}

// ---------- Data helpers ----------
function stripHtml(html) {
  if (!html) return "";
  return new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
}

// Turn an API show into a small, predictable object
function normalize(show) {
  return {
    id: show.id,
    name: show.name,
    image: show.image ? show.image.medium.replace("http://", "https://") : null,
    imageLarge: show.image ? (show.image.original || show.image.medium).replace("http://", "https://") : null,
    genres: show.genres || [],
    rating: show.rating && show.rating.average ? show.rating.average : null,
    year: show.premiered ? Number(show.premiered.slice(0, 4)) : null,
    summary: stripHtml(show.summary),
    network: (show.network && show.network.name) || (show.webChannel && show.webChannel.name) || null,
    status: show.status || "Unknown",
    language: show.language || null,
    url: show.url,
  };
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// ---------- API (fetch + async/await) ----------
async function loadShows(query = "") {
  const requestId = ++state.requestId;
  showLoading();

  try {
    const url = query
      ? `${API}/search/shows?q=${encodeURIComponent(query)}`
      : `${API}/shows?page=0`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The server replied with status ${response.status}.`);

    const data = await response.json();
    if (requestId !== state.requestId) return; // a newer request replaced this one

    state.shows = query
      ? data.map((item) => normalize(item.show))
      : data.map(normalize);
    state.genre = "All";
    render();
  } catch (error) {
    if (requestId !== state.requestId) return;
    showError(error);
  }
}

// ---------- UI states ----------
function showLoading() {
  stateBox.hidden = true;
  chipsBox.innerHTML = "";
  resultInfo.textContent = "Loading shows…";
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = Array.from({ length: 10 }, () => `
    <div class="skeleton" aria-hidden="true">
      <div class="sk-img"></div><div class="sk-line"></div><div class="sk-line short"></div>
    </div>`).join("");
}

function showError(error) {
  grid.innerHTML = "";
  grid.setAttribute("aria-busy", "false");
  resultInfo.textContent = "";
  const offline = !navigator.onLine;
  showState({
    type: "error",
    title: "Couldn’t load shows",
    text: offline
      ? "You appear to be offline. Check your connection and try again."
      : `Something went wrong: ${error.message} Try again in a moment.`,
    action: { label: "Try again", handler: () => loadShows(state.query) },
  });
}

function showState({ type = "", title, text, action }) {
  stateBox.hidden = false;
  stateBox.className = `state ${type}`;
  stateBox.innerHTML = `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>`;
  if (action) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", action.handler);
    stateBox.appendChild(btn);
  }
}

// ---------- Rendering ----------
function currentList() {
  return state.view === "watchlist" ? state.watchlist : state.shows;
}

function applyFilters(list) {
  const filtered = state.genre === "All"
    ? [...list]
    : list.filter((show) => show.genres.includes(state.genre));

  const sorters = {
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    newest: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return filtered.sort(sorters[state.sort]);
}

function renderChips(list) {
  const genres = [...new Set(list.flatMap((show) => show.genres))].sort();
  const all = ["All", ...genres];
  chipsBox.innerHTML = all.map((genre) => `
    <button type="button" class="chip ${genre === state.genre ? "is-active" : ""}"
      data-genre="${escapeHtml(genre)}" aria-pressed="${genre === state.genre}">
      ${escapeHtml(genre)}
    </button>`).join("");
}

function cardHtml(show) {
  const saved = isSaved(show.id);
  const poster = show.image
    ? `<img class="poster" src="${show.image}" alt="Poster of ${escapeHtml(show.name)}" loading="lazy">`
    : `<div class="poster none" aria-hidden="true">${escapeHtml(show.name.charAt(0))}</div>`;
  const meta = [show.year, show.genres[0]].filter(Boolean).join(" • ");
  return `
    <article class="card-wrap" style="position:relative">
      <button class="card" type="button" data-id="${show.id}" aria-label="View details for ${escapeHtml(show.name)}">
        ${show.rating ? `<span class="badge">★ ${show.rating.toFixed(1)}</span>` : ""}
        ${poster}
        <span class="card-body">
          <span class="card-title">${escapeHtml(show.name)}</span><br>
          <span class="card-meta">${escapeHtml(meta || "No details yet")}</span>
        </span>
      </button>
      <button class="save" type="button" data-save="${show.id}" aria-pressed="${saved}"
        aria-label="${saved ? "Remove from" : "Add to"} watchlist: ${escapeHtml(show.name)}">
        <svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/></svg>
      </button>
    </article>`;
}

function render() {
  watchCount.textContent = state.watchlist.length;
  grid.setAttribute("aria-busy", "false");
  stateBox.hidden = true;

  const list = currentList();
  renderChips(list);
  const visible = applyFilters(list);

  // Empty states
  if (visible.length === 0) {
    grid.innerHTML = "";
    resultInfo.textContent = "";
    if (state.view === "watchlist" && state.watchlist.length === 0) {
      showState({
        title: "Your watchlist is empty",
        text: "Tap the bookmark on any show to save it here. It stays after you refresh the page.",
        action: { label: "Browse shows", handler: () => switchView("browse") },
      });
    } else if (state.genre !== "All") {
      showState({
        title: `No ${state.genre} shows here`,
        text: "Try a different genre or clear the filter.",
        action: { label: "Show all genres", handler: () => { state.genre = "All"; render(); } },
      });
    } else {
      showState({
        title: `No shows found for “${state.query}”`,
        text: "Check the spelling or try a shorter title.",
        action: { label: "Back to popular shows", handler: () => { searchInput.value = ""; runSearch(""); } },
      });
    }
    return;
  }

  grid.innerHTML = visible.map(cardHtml).join("");

  const label = state.view === "watchlist"
    ? "in your watchlist"
    : state.query ? `for “${state.query}”` : "to start with";
  resultInfo.textContent = `${visible.length} ${visible.length === 1 ? "show" : "shows"} ${label}`;
}

// ---------- Details modal ----------
function openDetails(id) {
  const show = [...state.shows, ...state.watchlist].find((s) => s.id === id);
  if (!show) return;

  const saved = isSaved(id);
  const poster = show.imageLarge
    ? `<img src="${show.imageLarge}" alt="Poster of ${escapeHtml(show.name)}">`
    : `<div class="poster none" aria-hidden="true">${escapeHtml(show.name.charAt(0))}</div>`;
  const facts = [
    show.rating ? `<span class="fact rate">★ ${show.rating.toFixed(1)}</span>` : "",
    show.year ? `<span class="fact">${show.year}</span>` : "",
    `<span class="fact">${escapeHtml(show.status)}</span>`,
    show.network ? `<span class="fact">${escapeHtml(show.network)}</span>` : "",
    ...show.genres.map((g) => `<span class="fact">${escapeHtml(g)}</span>`),
  ].join("");

  modalBody.innerHTML = `
    <div class="detail">
      ${poster}
      <div class="detail-info">
        <h2 id="modal-title">${escapeHtml(show.name)}</h2>
        <div class="facts">${facts}</div>
        <p class="summary">${escapeHtml(show.summary || "No summary available for this show.")}</p>
        <div class="detail-actions">
          <button class="btn ${saved ? "saved" : ""}" type="button" data-modal-save="${show.id}">
            ${saved ? "Remove from watchlist" : "Add to watchlist"}
          </button>
          <a class="btn ghost" href="${show.url}" target="_blank" rel="noopener" style="text-decoration:none">More on TVmaze</a>
        </div>
      </div>
    </div>`;
  if (!modal.open) modal.showModal();
}

// ---------- Search / view switching ----------
function runSearch(query) {
  state.query = query.trim();
  state.view = "browse";
  updateTabs();
  try { localStorage.setItem(QUERY_KEY, state.query); } catch {}
  loadShows(state.query);
}

function switchView(view) {
  state.view = view;
  state.genre = "All";
  updateTabs();
  render();
}

function updateTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === state.view);
  });
}

// ---------- Event listeners ----------
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(searchInput.value);
});

// Search while typing, after a short pause
let typingTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    if (searchInput.value.trim().length >= 3 || searchInput.value.trim() === "") {
      runSearch(searchInput.value);
    }
  }, 500);
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  render();
});

chipsBox.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  state.genre = chip.dataset.genre;
  render();
});

document.querySelector(".tabs").addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (tab) switchView(tab.dataset.view);
});

grid.addEventListener("click", (event) => {
  const saveBtn = event.target.closest("[data-save]");
  if (saveBtn) return toggleSaved(Number(saveBtn.dataset.save));
  const card = event.target.closest(".card");
  if (card) openDetails(Number(card.dataset.id));
});

modalBody.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-modal-save]");
  if (!btn) return;
  const id = Number(btn.dataset.modalSave);
  toggleSaved(id);
  openDetails(id); // refresh button label
});

$("#modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close(); // click on backdrop
});

// ---------- Start ----------
(function init() {
  let lastQuery = "";
  try { lastQuery = localStorage.getItem(QUERY_KEY) || ""; } catch {}
  searchInput.value = lastQuery;
  state.query = lastQuery;
  watchCount.textContent = state.watchlist.length;
  loadShows(lastQuery);
})();
