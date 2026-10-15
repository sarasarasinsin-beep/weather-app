// 日本語版ウィキペディアから、都市の紹介文・名産品・周辺の観光スポットを取得して表示する
const WIKI_API_URL = "https://ja.wikipedia.org/w/api.php";
const WIKI_PAGE_URL = "https://ja.wikipedia.org/wiki/";

// 名産品が書かれていることが多い節の見出し
const PRODUCT_SECTION_PATTERN = /名産|特産|名物|郷土料理|伝統工芸/;
// 観光スポットとしては扱わない記事(駅・学校・役所・道路・行政区画など)
const NON_SPOT_PATTERN = /駅$|停留場$|学校|大学|高校|中学|小学|幼稚園|病院|役所|役場|郵便局|警察署|消防署|インターチェンジ|ジャンクション|交差点|^国道|号線|線$|[区市町村郡]$|地区$|団地$/;
const MAX_PRODUCTS = 12;
const MAX_SPOTS = 8;

let wikiRequestId = 0;

function wikiUrl(title) {
  return WIKI_PAGE_URL + encodeURIComponent(title.replace(/ /g, "_"));
}

async function wikiQuery(params) {
  const query = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const res = await fetch(`${WIKI_API_URL}?${query}`);
  if (!res.ok) {
    throw new Error(`ウィキペディアの取得に失敗しました(HTTP ${res.status})`);
  }
  return res.json();
}

// 2地点間の距離(km)
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// 都市の記事を探す。同名の地名が多いため「府中市 (東京都)」のような記事名を先に試し、
// 曖昧さ回避ページや、検索地点から遠く離れた場所の記事は除外する
async function findCityArticle(place) {
  const titles = [...new Set([
    place.admin1 ? `${place.name} (${place.admin1})` : null,
    place.name,
  ].filter(Boolean))];

  for (const title of titles) {
    const data = await wikiQuery({
      action: "query",
      titles: title,
      redirects: "1",
      prop: "pageprops|coordinates|extracts",
      exintro: "1",
      explaintext: "1",
    });
    const page = data.query.pages[0];
    if (!page || page.missing || (page.pageprops && "disambiguation" in page.pageprops)) {
      continue;
    }
    const coord = page.coordinates && page.coordinates[0];
    if (coord && distanceKm(place.latitude, place.longitude, coord.lat, coord.lon) > 50) {
      continue;
    }
    return { title: page.title, extract: page.extract || "" };
  }
  return null;
}

// 紹介文は最初の3文までにする
function shortenExtract(text) {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^。]+。?/g) || [];
  return sentences.slice(0, 3).join("");
}

// 「八ツ橋 - 京都の銘菓」「宇治茶(うじちゃ)」「京漬物、京菓子」のような項目から名前の部分だけを取り出す
function productNames(text) {
  const head = text
    .replace(/\[[^\]]*\]/g, "")
    .split(/\s*[-–—－:：。]|\s*[（(]/)[0];
  return head.split("、").map((name) => name.trim()).filter(Boolean);
}

async function fetchProducts(title) {
  const data = await wikiQuery({ action: "parse", page: title, prop: "sections", redirects: "1" });
  const sections = (data.parse && data.parse.sections || [])
    // 「T-1」のようにテンプレートから来た節は記事本体ではないので除く
    .filter((section) => /^\d+$/.test(section.index) && PRODUCT_SECTION_PATTERN.test(section.line))
    .slice(0, 3);

  const products = [];
  for (const section of sections) {
    const sectionData = await wikiQuery({
      action: "parse",
      page: title,
      section: section.index,
      prop: "text",
      redirects: "1",
      disableeditsection: "1",
    });
    const doc = new DOMParser().parseFromString(sectionData.parse.text, "text/html");
    doc.querySelectorAll("sup, .reference, .mw-references-wrap, .navbox, table").forEach((el) => el.remove());
    for (const item of doc.querySelectorAll("li")) {
      // 中に一覧を持つ項目(「伝統工芸」など)は分類の見出しなので、中の項目だけを使う
      if (item.querySelector("ul, ol")) {
        continue;
      }
      products.push(...productNames(item.textContent).filter((name) => name.length <= 30));
    }
  }
  return [...new Set(products)].slice(0, MAX_PRODUCTS);
}

async function fetchSpots(place) {
  const data = await wikiQuery({
    action: "query",
    generator: "geosearch",
    ggscoord: `${place.latitude}|${place.longitude}`,
    ggsradius: "10000",
    ggslimit: "50",
    prop: "coordinates|pageviews",
    colimit: "max",
    pvipdays: "30",
  });
  const pages = (data.query && data.query.pages) || [];
  return pages
    .filter((page) => !NON_SPOT_PATTERN.test(page.title) && page.coordinates)
    .map((page) => ({
      title: page.title,
      views: Object.values(page.pageviews || {}).reduce((sum, n) => sum + (n || 0), 0),
      distance: distanceKm(place.latitude, place.longitude, page.coordinates[0].lat, page.coordinates[0].lon),
    }))
    // よく読まれている記事ほど有名な場所とみなして上位に並べる
    .sort((a, b) => b.views - a.views);
}

function createLink(title, text = title) {
  const link = document.createElement("a");
  link.href = wikiUrl(title);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

function setWikiMessage(el, message) {
  const note = document.createElement("p");
  note.className = "detail";
  note.textContent = message;
  el.replaceChildren(note);
}

function renderSummary(article) {
  const el = document.getElementById("wiki-summary");
  if (!article) {
    setWikiMessage(el, "ウィキペディアにこの地点の記事が見つかりませんでした。");
    return;
  }
  const text = document.createElement("p");
  text.textContent = shortenExtract(article.extract);
  const more = document.createElement("p");
  more.className = "detail";
  more.append(createLink(article.title, `ウィキペディア「${article.title}」で続きを読む`));
  el.replaceChildren(text, more);
}

function renderProducts(products) {
  const el = document.getElementById("wiki-products");
  if (products.length === 0) {
    setWikiMessage(el, "ウィキペディアに名産品の記載が見つかりませんでした。");
    return;
  }
  const list = document.createElement("ul");
  list.className = "tag-list";
  list.replaceChildren(...products.map((name) => {
    const item = document.createElement("li");
    item.textContent = name;
    return item;
  }));
  el.replaceChildren(list);
}

function renderSpots(allSpots, cityTitle) {
  const el = document.getElementById("wiki-spots");
  const spots = allSpots.filter((spot) => spot.title !== cityTitle).slice(0, MAX_SPOTS);
  if (spots.length === 0) {
    setWikiMessage(el, "周辺10km以内に観光スポットが見つかりませんでした。");
    return;
  }
  const list = document.createElement("ol");
  list.className = "spot-list";
  list.replaceChildren(...spots.map((spot) => {
    const item = document.createElement("li");
    const distance = document.createElement("span");
    distance.className = "spot-distance";
    distance.textContent = `${spot.distance.toFixed(1)}km`;
    item.append(createLink(spot.title), distance);
    return item;
  }));
  el.replaceChildren(list);
}

// 天気の表示を待たせないよう、天気とは別に読み込む。
// 途中で別の地点が選ばれたら、古い地点の結果は表示しない
async function showWikiInfo(place) {
  const requestId = ++wikiRequestId;
  const isCurrent = () => requestId === wikiRequestId;
  const ids = ["wiki-summary", "wiki-products", "wiki-spots"];
  ids.forEach((id) => setWikiMessage(document.getElementById(id), "読み込み中…"));

  try {
    const [article, spotsResult] = await Promise.all([
      findCityArticle(place),
      fetchSpots(place).catch(() => null),
    ]);
    if (!isCurrent()) return;
    renderSummary(article);

    if (spotsResult) {
      renderSpots(spotsResult, article && article.title);
    } else {
      setWikiMessage(document.getElementById("wiki-spots"), "観光スポットを取得できませんでした。");
    }

    const products = article ? await fetchProducts(article.title) : [];
    if (!isCurrent()) return;
    renderProducts(products);
  } catch {
    if (!isCurrent()) return;
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el.textContent === "読み込み中…") {
        setWikiMessage(el, "ウィキペディアから情報を取得できませんでした。");
      }
    });
  }
}
