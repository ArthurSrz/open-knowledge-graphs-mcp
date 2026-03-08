(function () {
  "use strict";

  const DATA_PATHS = {
    ontologies: ["./data/ontologies.json", "../data/ontologies.json"],
    software: ["./data/software.json", "../data/software.json"],
  };

  const DEFAULT_STATE = {
    tab: "ontologies",
    q: "",
  };

  const TAB_DEFAULT_SORT = {
    ontologies: { sort: "hasHomepage", order: "desc" },
    software: { sort: "releaseDate", order: "desc" },
  };

  const SORT_FIELDS = {
    ontologies: new Set(["title", "types", "licenses", "partOf", "hasHomepage"]),
    software: new Set(["title", "licenses", "latestVersion", "releaseDate"]),
  };

  const TABLE_BODY_IDS = {
    ontologies: "ontologies-table-body",
    software: "software-table-body",
  };

  const CARD_CONTAINER_IDS = {
    ontologies: "ontologies-cards",
    software: "software-cards",
  };

  const PANEL_IDS = {
    ontologies: "panel-ontologies",
    software: "panel-software",
  };

  const TAB_IDS = {
    ontologies: "tab-ontologies",
    software: "tab-software",
  };

  const TAB_ORDER = ["ontologies", "software"];
  const SEARCH_DEBOUNCE_MS = 180;

  const dom = {
    searchInput: document.getElementById("catalog-search"),
    resultsMeta: document.getElementById("results-meta"),
    lastUpdated: document.getElementById("last-updated"),
    tabs: Array.from(document.querySelectorAll('[role="tab"]')),
    panels: Array.from(document.querySelectorAll('[role="tabpanel"]')),
    sortButtons: Array.from(document.querySelectorAll(".sort-button")),
    ontologiesTtlLink: document.querySelector('a[href$="ontologies.ttl"]'),
    softwareTtlLink: document.querySelector('a[href$="software.ttl"]'),
  };

  const store = {
    ontologies: [],
    software: [],
    generatedAt: {
      ontologies: null,
      software: null,
    },
  };

  let state = normalizeState(parseStateFromUrl());

  function debounce(fn, waitMs) {
    let timeoutId;
    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn(...args), waitMs);
    };
  }

  function isValidTab(tab) {
    return tab === "ontologies" || tab === "software";
  }

  function isValidOrder(order) {
    return order === "asc" || order === "desc";
  }

  function isSortAllowed(tab, sort) {
    const allowed = SORT_FIELDS[tab];
    return allowed ? allowed.has(sort) : false;
  }

  function parseStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
      tab: params.get("tab"),
      q: params.get("q"),
      sort: params.get("sort"),
      order: params.get("order"),
    };
  }

  function normalizeState(rawState) {
    const normalizedTab = isValidTab(rawState.tab) ? rawState.tab : DEFAULT_STATE.tab;
    const tabDefaults = TAB_DEFAULT_SORT[normalizedTab];
    const requestedSort = typeof rawState.sort === "string" ? rawState.sort : "";
    const requestedOrder = typeof rawState.order === "string" ? rawState.order : "";

    const normalized = {
      tab: normalizedTab,
      q: String(rawState.q || "").trim(),
      sort: requestedSort,
      order: requestedOrder,
    };

    if (!normalized.sort || !isSortAllowed(normalized.tab, normalized.sort)) {
      normalized.sort = tabDefaults.sort;
      normalized.order = tabDefaults.order;
    } else if (!isValidOrder(normalized.order)) {
      normalized.order = "asc";
    }

    return normalized;
  }

  function updateUrlFromState() {
    const params = new URLSearchParams();
    const tabDefaults = TAB_DEFAULT_SORT[state.tab];
    if (state.tab !== DEFAULT_STATE.tab) {
      params.set("tab", state.tab);
    }
    if (state.sort !== tabDefaults.sort) {
      params.set("sort", state.sort);
    }
    if (state.order !== tabDefaults.order) {
      params.set("order", state.order);
    }
    if (state.q) {
      params.set("q", state.q);
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }

  async function fetchJsonWithFallback(paths) {
    let lastError = null;

    for (const path of paths) {
      try {
        const response = await window.fetch(path, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          lastError = new Error(`Request failed (${response.status}) for ${path}`);
          continue;
        }
        return { path, payload: await response.json() };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Unable to fetch JSON payload");
  }

  function updateTtlLinksFromJsonPath(jsonPath) {
    const fromSiteFolder = jsonPath.startsWith("../");
    const prefix = fromSiteFolder ? "../data/" : "./data/";
    if (dom.ontologiesTtlLink) {
      dom.ontologiesTtlLink.setAttribute("href", `${prefix}ontologies.ttl`);
    }
    if (dom.softwareTtlLink) {
      dom.softwareTtlLink.setAttribute("href", `${prefix}software.ttl`);
    }
  }

  function normalizeItem(item) {
    const safeItem = { ...item };
    safeItem.types = Array.isArray(item.types) ? item.types : [];
    safeItem.licenses = Array.isArray(item.licenses) ? item.licenses : [];
    safeItem._searchText = buildSearchText(safeItem);
    return safeItem;
  }

  function buildSearchText(item) {
    const parts = [
      item.title,
      item.description,
      item.wikidataId,
      item.homepage,
      item.partOf,
      item.latestVersion,
      item.releaseDate,
      ...(Array.isArray(item.types) ? item.types : []),
      ...(Array.isArray(item.licenses) ? item.licenses : []),
    ];
    return parts
      .filter((value) => typeof value === "string" && value.trim())
      .join(" ")
      .toLowerCase();
  }

  function parseGeneratedAt(value) {
    if (typeof value !== "string") {
      return null;
    }
    const time = Date.parse(value);
    if (Number.isNaN(time)) {
      return null;
    }
    return new Date(time);
  }

  function chooseNewestDate(a, b) {
    if (!a && !b) {
      return null;
    }
    if (!a) {
      return b;
    }
    if (!b) {
      return a;
    }
    return a.getTime() >= b.getTime() ? a : b;
  }

  function formatDate(dateInput) {
    if (!dateInput) {
      return "";
    }
    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) {
      return String(dateInput);
    }
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(dateInput) {
    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) {
      return String(dateInput);
    }
    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setFooterTimestamp() {
    const newest = chooseNewestDate(
      store.generatedAt.ontologies,
      store.generatedAt.software
    );
    if (!newest) {
      dom.lastUpdated.textContent = "Not available";
      return;
    }
    dom.lastUpdated.textContent = formatDateTime(newest);
  }

  function itemSortValue(item, key) {
    if (key === "hasHomepage") {
      return item.homepage ? 1 : 0;
    }
    if (key === "types") {
      return Array.isArray(item.types) && item.types.length ? item.types.join(", ") : "";
    }
    if (key === "licenses") {
      return Array.isArray(item.licenses) && item.licenses.length ? item.licenses.join(", ") : "";
    }
    return item[key] || "";
  }

  function isMissingSortValue(value) {
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return value === null || value === undefined || String(value).trim() === "";
  }

  function compareValues(aValue, bValue, key) {
    if (key === "hasHomepage") {
      return Number(aValue) - Number(bValue);
    }
    if (key === "releaseDate") {
      const aTime = Date.parse(String(aValue));
      const bTime = Date.parse(String(bValue));
      return aTime - bTime;
    }

    return String(aValue).localeCompare(String(bValue), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function sortItems(items) {
    const sorted = [...items];
    const { sort, order } = state;

    sorted.sort((a, b) => {
      const aValue = itemSortValue(a, sort);
      const bValue = itemSortValue(b, sort);
      const aMissing = isMissingSortValue(aValue);
      const bMissing = isMissingSortValue(bValue);

      if (aMissing && bMissing) {
        return String(a.title).localeCompare(String(b.title), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      if (aMissing) {
        return 1;
      }
      if (bMissing) {
        return -1;
      }

      const compared = compareValues(aValue, bValue, sort);
      if (compared === 0) {
        return String(a.title).localeCompare(String(b.title), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return order === "desc" ? -compared : compared;
    });

    return sorted;
  }

  function filterItems(items) {
    if (!state.q) {
      return items;
    }
    const query = state.q.toLowerCase();
    return items.filter((item) => item._searchText.includes(query));
  }

  function getActiveItems() {
    const active = store[state.tab] || [];
    return sortItems(filterItems(active));
  }

  function clearChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function createLink(href, text) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    return link;
  }

  function renderNoResultsTableRow(columnCount, message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "placeholder-cell";
    cell.colSpan = columnCount;
    cell.textContent = message;
    row.appendChild(cell);
    return row;
  }

  function renderOntologyRow(item) {
    const row = document.createElement("tr");

    const titleCell = document.createElement("td");
    titleCell.textContent = item.title;
    row.appendChild(titleCell);

    const descriptionCell = document.createElement("td");
    descriptionCell.className = "description-cell";
    descriptionCell.textContent = item.description || "—";
    row.appendChild(descriptionCell);

    const typeCell = document.createElement("td");
    typeCell.textContent = item.types.join(", ");
    row.appendChild(typeCell);

    const licenseCell = document.createElement("td");
    licenseCell.textContent = item.licenses.length ? item.licenses.join(", ") : "—";
    row.appendChild(licenseCell);

    const partOfCell = document.createElement("td");
    partOfCell.textContent = item.partOf || "—";
    row.appendChild(partOfCell);

    const linksCell = document.createElement("td");
    linksCell.className = "link-cell";
    linksCell.appendChild(createLink(item.wikidataId, "Wikidata"));
    if (item.homepage) {
      const separator = document.createElement("span");
      separator.textContent = " | ";
      linksCell.appendChild(separator);
      linksCell.appendChild(createLink(item.homepage, "Website"));
    }
    row.appendChild(linksCell);

    return row;
  }

  function renderSoftwareRow(item) {
    const row = document.createElement("tr");

    const titleCell = document.createElement("td");
    titleCell.textContent = item.title;
    row.appendChild(titleCell);

    const descriptionCell = document.createElement("td");
    descriptionCell.className = "description-cell";
    descriptionCell.textContent = item.description || "—";
    row.appendChild(descriptionCell);

    const licenseCell = document.createElement("td");
    licenseCell.textContent = item.licenses.length ? item.licenses.join(", ") : "—";
    row.appendChild(licenseCell);

    const versionCell = document.createElement("td");
    versionCell.textContent = item.latestVersion || "—";
    row.appendChild(versionCell);

    const dateCell = document.createElement("td");
    dateCell.textContent = item.releaseDate ? formatDate(item.releaseDate) : "—";
    row.appendChild(dateCell);

    const linksCell = document.createElement("td");
    linksCell.className = "link-cell";
    linksCell.appendChild(createLink(item.wikidataId, "Wikidata"));
    if (item.homepage) {
      const separator = document.createElement("span");
      separator.textContent = " | ";
      linksCell.appendChild(separator);
      linksCell.appendChild(createLink(item.homepage, "Website"));
    }
    row.appendChild(linksCell);

    return row;
  }

  function appendCardMetaLine(card, label, value) {
    if (!value) {
      return;
    }
    const line = document.createElement("p");
    line.className = "card-row";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    line.appendChild(strong);
    line.appendChild(document.createTextNode(value));
    card.appendChild(line);
  }

  function appendCardDescription(card, value) {
    if (!value) {
      return;
    }
    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = value;
    card.appendChild(description);
  }

  function renderOntologyCard(item) {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = item.title;
    card.appendChild(title);
    appendCardDescription(card, item.description || "");

    appendCardMetaLine(card, "Type", item.types.join(", "));
    appendCardMetaLine(
      card,
      "License",
      item.licenses.length ? item.licenses.join(", ") : ""
    );
    appendCardMetaLine(card, "Part Of", item.partOf || "");

    const links = document.createElement("p");
    links.className = "card-links";
    links.appendChild(createLink(item.wikidataId, "Wikidata"));
    if (item.homepage) {
      links.appendChild(document.createTextNode(" | "));
      links.appendChild(createLink(item.homepage, "Website"));
    }
    card.appendChild(links);

    return card;
  }

  function renderSoftwareCard(item) {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = item.title;
    card.appendChild(title);
    appendCardDescription(card, item.description || "");

    appendCardMetaLine(
      card,
      "License",
      item.licenses.length ? item.licenses.join(", ") : ""
    );
    appendCardMetaLine(card, "Version", item.latestVersion || "");
    appendCardMetaLine(
      card,
      "Release Date",
      item.releaseDate ? formatDate(item.releaseDate) : ""
    );

    const links = document.createElement("p");
    links.className = "card-links";
    links.appendChild(createLink(item.wikidataId, "Wikidata"));
    if (item.homepage) {
      links.appendChild(document.createTextNode(" | "));
      links.appendChild(createLink(item.homepage, "Website"));
    }
    card.appendChild(links);

    return card;
  }

  function renderTable(items) {
    const tableBody = document.getElementById(TABLE_BODY_IDS[state.tab]);
    if (!tableBody) {
      return;
    }
    clearChildren(tableBody);

    if (items.length === 0) {
      tableBody.appendChild(
        renderNoResultsTableRow(
          6,
          state.q ? "No matching resources for the current search." : "No resources available."
        )
      );
      return;
    }

    const rowRenderer = state.tab === "ontologies" ? renderOntologyRow : renderSoftwareRow;
    items.forEach((item) => {
      tableBody.appendChild(rowRenderer(item));
    });
  }

  function renderCards(items) {
    const cardContainer = document.getElementById(CARD_CONTAINER_IDS[state.tab]);
    if (!cardContainer) {
      return;
    }

    clearChildren(cardContainer);

    if (items.length === 0) {
      const placeholder = document.createElement("article");
      placeholder.className = "card card-placeholder";
      const heading = document.createElement("h3");
      heading.textContent = state.q
        ? "No matching resources for the current search."
        : "No resources available.";
      placeholder.appendChild(heading);
      cardContainer.appendChild(placeholder);
      return;
    }

    const cardRenderer = state.tab === "ontologies" ? renderOntologyCard : renderSoftwareCard;
    items.forEach((item) => {
      cardContainer.appendChild(cardRenderer(item));
    });
  }

  function updateResultsMeta(shownCount, totalCount) {
    const label = state.tab === "ontologies" ? "resources" : "software entries";
    const shownText = shownCount.toLocaleString();
    const totalText = totalCount.toLocaleString();
    const queryText = state.q ? ` for "${state.q}"` : "";
    dom.resultsMeta.textContent = `Showing ${shownText} of ${totalText} ${label}${queryText}.`;
  }

  function updateTabUi() {
    TAB_ORDER.forEach((tabName) => {
      const tabButton = document.getElementById(TAB_IDS[tabName]);
      const panel = document.getElementById(PANEL_IDS[tabName]);
      const isActive = tabName === state.tab;

      if (!tabButton || !panel) {
        return;
      }

      tabButton.classList.toggle("is-active", isActive);
      tabButton.setAttribute("aria-selected", isActive ? "true" : "false");
      tabButton.setAttribute("tabindex", isActive ? "0" : "-1");
      panel.hidden = !isActive;
    });
  }

  function updateSortUi() {
    dom.sortButtons.forEach((button) => {
      const panel = button.closest("[data-panel]");
      if (!panel) {
        return;
      }
      const isPanelActive = panel.getAttribute("data-panel") === state.tab;
      const isActiveSort = isPanelActive && button.dataset.sort === state.sort;
      const header = button.closest("th");

      button.classList.toggle("is-active", isActiveSort);

      if (isActiveSort) {
        button.dataset.order = state.order;
        if (header) {
          header.setAttribute(
            "aria-sort",
            state.order === "asc" ? "ascending" : "descending"
          );
        }
      } else {
        button.removeAttribute("data-order");
        if (header) {
          header.setAttribute("aria-sort", "none");
        }
      }
    });
  }

  function render() {
    updateTabUi();
    updateSortUi();

    const allItems = store[state.tab] || [];
    const visibleItems = getActiveItems();
    renderTable(visibleItems);
    renderCards(visibleItems);
    updateResultsMeta(visibleItems.length, allItems.length);
  }

  function setLoadingState() {
    dom.resultsMeta.textContent = "Loading catalog data...";
  }

  function setErrorState(message) {
    dom.resultsMeta.textContent = message;
    dom.lastUpdated.textContent = "Not available";

    ["ontologies", "software"].forEach((tabName) => {
      const tableBody = document.getElementById(TABLE_BODY_IDS[tabName]);
      const cardContainer = document.getElementById(CARD_CONTAINER_IDS[tabName]);

      if (tableBody) {
        clearChildren(tableBody);
        tableBody.appendChild(renderNoResultsTableRow(6, "Unable to load data."));
      }
      if (cardContainer) {
        clearChildren(cardContainer);
        const card = document.createElement("article");
        card.className = "card card-placeholder";
        const heading = document.createElement("h3");
        heading.textContent = "Unable to load data.";
        card.appendChild(heading);
        cardContainer.appendChild(card);
      }
    });
  }

  function syncSearchInput() {
    if (dom.searchInput) {
      dom.searchInput.value = state.q;
    }
  }

  function applyState(nextState) {
    state = normalizeState(nextState);
    syncSearchInput();
    updateUrlFromState();
    render();
  }

  function toggleSort(sortKey) {
    const nextState = { ...state };
    if (nextState.sort === sortKey) {
      nextState.order = nextState.order === "asc" ? "desc" : "asc";
    } else {
      nextState.sort = sortKey;
      nextState.order = "asc";
    }
    applyState(nextState);
  }

  function switchTab(nextTab) {
    if (!isValidTab(nextTab) || nextTab === state.tab) {
      return;
    }
    const nextState = { ...state, tab: nextTab };
    if (!isSortAllowed(nextState.tab, nextState.sort)) {
      nextState.sort = TAB_DEFAULT_SORT[nextState.tab].sort;
      nextState.order = TAB_DEFAULT_SORT[nextState.tab].order;
    }
    applyState(nextState);
  }

  function moveTabFocus(currentTab, direction) {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex = (currentIndex + direction + TAB_ORDER.length) % TAB_ORDER.length;
    const nextTab = TAB_ORDER[nextIndex];
    switchTab(nextTab);
    const targetButton = document.getElementById(TAB_IDS[nextTab]);
    if (targetButton) {
      targetButton.focus();
    }
  }

  function bindEvents() {
    dom.tabs.forEach((tabButton) => {
      tabButton.addEventListener("click", () => {
        const nextTab = tabButton.dataset.tab;
        if (nextTab) {
          switchTab(nextTab);
        }
      });

      tabButton.addEventListener("keydown", (event) => {
        const currentTab = tabButton.dataset.tab;
        if (!currentTab) {
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveTabFocus(currentTab, 1);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveTabFocus(currentTab, -1);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          switchTab(TAB_ORDER[0]);
          const first = document.getElementById(TAB_IDS[TAB_ORDER[0]]);
          if (first) {
            first.focus();
          }
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          const lastTab = TAB_ORDER[TAB_ORDER.length - 1];
          switchTab(lastTab);
          const last = document.getElementById(TAB_IDS[lastTab]);
          if (last) {
            last.focus();
          }
        }
      });
    });

    dom.sortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const sortKey = button.dataset.sort;
        const panel = button.closest("[data-panel]");
        if (!sortKey || !panel) {
          return;
        }
        const panelTab = panel.getAttribute("data-panel");
        if (panelTab !== state.tab) {
          return;
        }
        if (!isSortAllowed(state.tab, sortKey)) {
          return;
        }
        toggleSort(sortKey);
      });
    });

    if (dom.searchInput) {
      const debounced = debounce((rawValue) => {
        applyState({ ...state, q: rawValue });
      }, SEARCH_DEBOUNCE_MS);

      dom.searchInput.addEventListener("input", (event) => {
        const target = event.target;
        debounced(target.value);
      });
    }

    window.addEventListener("popstate", () => {
      applyState(parseStateFromUrl());
    });
  }

  async function init() {
    setLoadingState();
    updateTabUi();
    syncSearchInput();
    bindEvents();

    try {
      const [ontologyResult, softwareResult] = await Promise.all([
        fetchJsonWithFallback(DATA_PATHS.ontologies),
        fetchJsonWithFallback(DATA_PATHS.software),
      ]);

      const ontologyPayload = ontologyResult.payload;
      const softwarePayload = softwareResult.payload;
      updateTtlLinksFromJsonPath(ontologyResult.path);

      store.ontologies = Array.isArray(ontologyPayload.items)
        ? ontologyPayload.items.map(normalizeItem)
        : [];
      store.software = Array.isArray(softwarePayload.items)
        ? softwarePayload.items.map(normalizeItem)
        : [];

      store.generatedAt.ontologies = parseGeneratedAt(ontologyPayload.generatedAt);
      store.generatedAt.software = parseGeneratedAt(softwarePayload.generatedAt);
      setFooterTimestamp();

      applyState(state);
    } catch (error) {
      console.error("Failed to initialize app", error);
      setErrorState("Unable to load catalog data.");
    }
  }

  init();
})();
