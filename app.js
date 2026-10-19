const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_CITY = "京都";
const GSI_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";

// WMO天気コード → 日本語表記とアイコン
const WEATHER_CODES = {
  0: ["快晴", "☀️"],
  1: ["晴れ", "🌤️"],
  2: ["一部くもり", "⛅"],
  3: ["くもり", "☁️"],
  45: ["霧", "🌫️"],
  48: ["霧(着氷)", "🌫️"],
  51: ["弱い霧雨", "🌦️"],
  53: ["霧雨", "🌦️"],
  55: ["強い霧雨", "🌧️"],
  56: ["着氷性の霧雨", "🌧️"],
  57: ["強い着氷性の霧雨", "🌧️"],
  61: ["弱い雨", "🌦️"],
  63: ["雨", "🌧️"],
  65: ["強い雨", "🌧️"],
  66: ["着氷性の雨", "🌧️"],
  67: ["強い着氷性の雨", "🌧️"],
  71: ["弱い雪", "🌨️"],
  73: ["雪", "🌨️"],
  75: ["強い雪", "❄️"],
  77: ["霧雪", "🌨️"],
  80: ["弱いにわか雨", "🌦️"],
  81: ["にわか雨", "🌧️"],
  82: ["激しいにわか雨", "⛈️"],
  85: ["弱いにわか雪", "🌨️"],
  86: ["強いにわか雪", "❄️"],
  95: ["雷雨", "⛈️"],
  96: ["雷雨(ひょう)", "⛈️"],
  99: ["激しい雷雨(ひょう)", "⛈️"],
};

const form = document.getElementById("search-form");
const input = document.getElementById("city-input");
const button = form.querySelector("button");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const candidatesEl = document.getElementById("candidates");
const candidatesTitleEl = document.getElementById("candidates-title");
const candidateListEl = document.getElementById("candidate-list");
const detailHoursEl = document.getElementById("detail-hours");

let chart = null;
let detailChart = null;
let lastForecast = null;
let map = null;
let marker = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`通信エラーが発生しました(HTTP ${res.status})`);
  }
  return res.json();
}

// Open-Meteo Geocoding APIは日本語の都市名ではヒットしないことが多いため、
// よく使われる都市名は英語名と国コードに置き換えて検索する
const CITY_ALIASES = {
  JP: {
    札幌: "Sapporo", 函館: "Hakodate", 旭川: "Asahikawa", 小樽: "Otaru", 釧路: "Kushiro",
    帯広: "Obihiro", 青森: "Aomori", 八戸: "Hachinohe", 盛岡: "Morioka", 仙台: "Sendai",
    秋田: "Akita", 山形: "Yamagata", 福島: "Fukushima", 郡山: "Koriyama", いわき: "Iwaki",
    水戸: "Mito", つくば: "Tsukuba", 宇都宮: "Utsunomiya", 日光: "Nikko", 前橋: "Maebashi",
    高崎: "Takasaki", さいたま: "Saitama", 川越: "Kawagoe", 千葉: "Chiba", 船橋: "Funabashi",
    東京: "Tokyo", 新宿: "Shinjuku", 渋谷: "Shibuya", 八王子: "Hachioji", 横浜: "Yokohama",
    川崎: "Kawasaki", 相模原: "Sagamihara", 鎌倉: "Kamakura", 横須賀: "Yokosuka", 箱根: "Hakone",
    新潟: "Niigata", 長岡: "Nagaoka", 富山: "Toyama", 金沢: "Kanazawa", 福井: "Fukui",
    甲府: "Kofu", 長野: "Nagano", 松本: "Matsumoto", 軽井沢: "Karuizawa", 岐阜: "Gifu",
    高山: "Takayama", 静岡: "Shizuoka", 浜松: "Hamamatsu", 熱海: "Atami", 名古屋: "Nagoya",
    豊橋: "Toyohashi", 豊田: "Toyota", 岡崎: "Okazaki", 津: "Tsu", 四日市: "Yokkaichi",
    伊勢: "Ise", 大津: "Otsu", 京都: "Kyoto", 大阪: "Osaka", 堺: "Sakai",
    神戸: "Kobe", 姫路: "Himeji", 西宮: "Nishinomiya", 奈良: "Nara", 和歌山: "Wakayama",
    鳥取: "Tottori", 松江: "Matsue", 岡山: "Okayama", 倉敷: "Kurashiki", 広島: "Hiroshima",
    福山: "Fukuyama", 呉: "Kure", 山口: "Yamaguchi", 下関: "Shimonoseki", 徳島: "Tokushima",
    高松: "Takamatsu", 松山: "Matsuyama", 高知: "Kochi", 福岡: "Fukuoka", 北九州: "Kitakyushu",
    久留米: "Kurume", 佐賀: "Saga", 長崎: "Nagasaki", 佐世保: "Sasebo", 熊本: "Kumamoto",
    大分: "Oita", 別府: "Beppu", 宮崎: "Miyazaki", 鹿児島: "Kagoshima", 那覇: "Naha",
    沖縄: "Okinawa", 石垣: "Ishigaki",
  },
  US: { ニューヨーク: "New York", ロサンゼルス: "Los Angeles", サンフランシスコ: "San Francisco", ホノルル: "Honolulu" },
  GB: { ロンドン: "London" },
  FR: { パリ: "Paris" },
  KR: { ソウル: "Seoul" },
  CN: { 北京: "Beijing", 上海: "Shanghai" },
  TW: { 台北: "Taipei" },
  TH: { バンコク: "Bangkok" },
  SG: { シンガポール: "Singapore" },
  AU: { シドニー: "Sydney" },
};

function findAlias(name) {
  // 「京都市」「東京都」のような末尾の「市・都・府・県」は取り除いて照合する
  const candidates = [name, name.replace(/[市都府県]$/, "")];
  for (const [countryCode, cities] of Object.entries(CITY_ALIASES)) {
    for (const candidate of candidates) {
      if (cities[candidate]) {
        return { query: cities[candidate], countryCode };
      }
    }
  }
  return null;
}

async function searchPlaces(query, countryCode) {
  const params = new URLSearchParams({
    name: query,
    count: "10",
    language: "ja",
    format: "json",
  });
  if (countryCode) {
    params.set("countryCode", countryCode);
  }
  const data = await fetchJson(`${GEOCODING_URL}?${params}`);
  return data.results || [];
}

async function geocode(name) {
  const alias = findAlias(name);
  let places = alias ? await searchPlaces(alias.query, alias.countryCode) : [];
  if (places.length === 0) {
    places = await searchPlaces(name);
  }
  if (places.length === 0) {
    throw new Error(`「${name}」が見つかりませんでした。ローマ字や英語(例:Kyoto、Paris)で入力してみてください。`);
  }
  return places;
}

// 候補一覧と現在の気温カードに表示する地域名(例:「東京都・日本」)
function placeRegion(place) {
  const parts = [place.admin1, place.admin2, place.country]
    .filter((part) => part && part !== place.name);
  return [...new Set(parts)].join("・");
}

async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,weather_code",
    hourly: "temperature_2m,precipitation_probability,precipitation",
    forecast_hours: "48",
    minutely_15: "temperature_2m,precipitation",
    forecast_minutely_15: "24",
    timezone: "auto",
  });
  return fetchJson(`${FORECAST_URL}?${params}`);
}

// "2026-10-14T15:00" のような現地時刻の文字列を表示用に整形する
function parseLocalTime(iso) {
  const [date, time] = iso.split("T");
  const [, month, day] = date.split("-").map(Number);
  const hour = Number(time.split(":")[0]);
  return { month, day, hour, time };
}

function formatChartLabel(iso) {
  const { month, day, hour } = parseLocalTime(iso);
  return hour === 0 ? [`${hour}時`, `${month}/${day}`] : `${hour}時`;
}

function renderCurrent(place, forecast) {
  const temp = forecast.current.temperature_2m;
  const unit = forecast.current_units.temperature_2m;
  const [text, icon] = WEATHER_CODES[forecast.current.weather_code] || ["不明", "❔"];
  const { month, day, time } = parseLocalTime(forecast.current.time);

  document.getElementById("city-name").textContent = place.name;
  document.getElementById("city-detail").textContent = placeRegion(place);
  document.getElementById("weather-icon").textContent = icon;
  document.getElementById("current-temp").textContent = `${temp.toFixed(1)}${unit}`;
  document.getElementById("weather-text").textContent = text;
  document.getElementById("updated-at").textContent =
    `${month}月${day}日 ${time} 時点(現地時刻)`;

  // 降水確率は現在値がないため、時間ごとの予報の先頭(現在の時間帯)を使う
  const precipEl = document.getElementById("current-precip");
  const precip = forecast.hourly.precipitation_probability[0];
  precipEl.replaceChildren("降水確率 ");
  const precipValue = document.createElement("strong");
  precipValue.textContent = precip === null ? "—" : `${precip}%`;
  precipEl.append(precipValue);

  // 降水量も同じく、現在の時間帯(1時間あたり)の予報を使う
  const rainEl = document.getElementById("current-rain");
  const rain = forecast.hourly.precipitation[0];
  rainEl.replaceChildren("降水量 ");
  const rainValue = document.createElement("strong");
  rainValue.textContent = rain === null ? "—" : `${rain.toFixed(1)}${forecast.hourly_units.precipitation}`;
  rainEl.append(rainValue, "(1時間あたり)");
}

// 降水確率の帯に、区切り(48時間は6時間ごと、直近は1時間ごと)の最大値を%で書き込む。
// labelGroups には各マスがどの区切りに入るかを表す値が入っていて、同じ値が続くマスを1つの区切りとする
const probabilityLabels = {
  id: "probabilityLabels",
  afterDatasetsDraw(strip) {
    const { probabilities: probs, labelGroups } = strip.data.datasets[0];
    const bars = strip.getDatasetMeta(0).data;
    const { ctx } = strip;
    ctx.save();
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let start = 0;
    for (let i = 1; i <= bars.length; i++) {
      if (i < bars.length && labelGroups[i] === labelGroups[start]) continue;
      const block = probs.slice(start, i).filter((p) => p !== null);
      // 狭すぎる区切りには数字が入りきらないので書かない
      const width = bars[i - 1].x - bars[start].x + bars[start].width;
      if (block.length > 0 && width >= 28) {
        const value = Math.max(...block);
        ctx.fillStyle = value >= 60 ? "#fff" : "#1f2933";
        ctx.fillText(`${value}%`, (bars[start].x + bars[i - 1].x) / 2, (bars[start].y + bars[start].base) / 2);
      }
      start = i;
    }
    ctx.restore();
  },
};

function probabilityColor(p) {
  return p === null ? "#f0f3f6" : `rgba(47, 128, 237, ${0.08 + (p / 100) * 0.85})`;
}

function formatTooltipTime(iso) {
  const { month, day, time } = parseLocalTime(iso);
  return `${month}月${day}日 ${time}`;
}

// 気温の折れ線・降水量の棒グラフと、その下の降水確率の帯を描く
function createWeatherChart({ chartId, stripId, times, labels, temps, rains, probs, unit, rainUnit, rainLabel, labelGroups }) {
  const ctx = document.getElementById(chartId).getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(232, 89, 12, 0.25)");
  gradient.addColorStop(1, "rgba(232, 89, 12, 0.02)");

  let strip = null;
  const main = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: "line",
          label: "気温",
          data: temps,
          yAxisID: "y",
          borderColor: "#e8590c",
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2,
          order: 0,
        },
        {
          type: "bar",
          label: rainLabel,
          data: rains,
          yAxisID: "rain",
          backgroundColor: "rgba(28, 100, 200, 0.8)",
          barPercentage: 1,
          categoryPercentage: 0.9,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      // 下の帯の左右の余白をグラフの描画範囲に合わせ直す
      onResize: () => requestAnimationFrame(() => strip && strip.update("none")),
      plugins: {
        legend: {
          labels: { boxWidth: 12, boxHeight: 12 },
        },
        tooltip: {
          callbacks: {
            title: (items) => formatTooltipTime(times[items[0].dataIndex]),
            label: (item) => (item.dataset.yAxisID === "rain"
              ? `${rainLabel}: ${item.parsed.y.toFixed(1)}${rainUnit}`
              : `気温: ${item.parsed.y.toFixed(1)}${unit}`),
            footer: (items) => {
              const p = probs[items[0].dataIndex];
              return p === null ? "" : `降水確率: ${p}%`;
            },
          },
        },
      },
      scales: {
        // 時刻の目盛りは下の降水確率の帯に表示する
        x: {
          grid: { display: false },
          ticks: { display: false },
        },
        y: {
          position: "left",
          ticks: { callback: (value) => `${value}${unit}` },
        },
        rain: {
          position: "right",
          min: 0,
          // 雨がほとんど降らない日に、わずかな量が大雨のように見えないようにする
          suggestedMax: 5,
          grid: { drawOnChartArea: false },
          ticks: { callback: (value) => `${value}${rainUnit}` },
        },
      },
    },
  });

  strip = new Chart(document.getElementById(stripId), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: probs.map(() => 1),
          probabilities: probs,
          labelGroups,
          backgroundColor: probs.map(probabilityColor),
          barPercentage: 1,
          categoryPercentage: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: {
        padding: () => ({
          left: main.chartArea ? main.chartArea.left : 0,
          right: main.chartArea ? main.width - main.chartArea.right : 0,
        }),
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => formatTooltipTime(times[items[0].dataIndex]),
            label: (item) => {
              const p = probs[item.dataIndex];
              return `降水確率: ${p === null ? "—" : `${p}%`}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9 },
        },
        y: { display: false, min: 0, max: 1 },
      },
    },
    plugins: [probabilityLabels],
  });

  return {
    destroy() {
      main.destroy();
      strip.destroy();
    },
  };
}

function renderChart(forecast) {
  const times = forecast.hourly.time;
  const temps = forecast.hourly.temperature_2m;
  const probs = forecast.hourly.precipitation_probability;
  const rains = forecast.hourly.precipitation;
  const unit = forecast.hourly_units.temperature_2m;
  const rainUnit = forecast.hourly_units.precipitation;

  const valid = temps.filter((t) => t !== null);
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const validProbs = probs.filter((p) => p !== null);
  const maxProb = validProbs.length > 0 ? `${Math.max(...validProbs)}%` : "—";
  const totalRain = rains.reduce((sum, r) => sum + (r || 0), 0);
  const rainText = totalRain > 0
    ? `合計降水量 ${totalRain.toFixed(1)}${rainUnit}`
    : "雨の予報はありません";
  document.getElementById("minmax").textContent =
    `48時間の最高 ${max.toFixed(1)}${unit} / 最低 ${min.toFixed(1)}${unit} / 最大降水確率 ${maxProb} / ${rainText}`;

  if (chart) {
    chart.destroy();
  }
  chart = createWeatherChart({
    chartId: "temp-chart",
    stripId: "probability-strip",
    times,
    labels: times.map(formatChartLabel),
    temps,
    rains,
    probs,
    unit,
    rainUnit,
    rainLabel: "降水量",
    labelGroups: times.map((t, i) => Math.floor(i / 6)),
  });
}

// 直近◯時間の拡大表示。15分ごとのデータを使い、降水確率は同じ時間帯の1時間ごとの値を使う
function renderDetailChart() {
  if (!lastForecast) return;
  const forecast = lastForecast;
  const hours = Number(detailHoursEl.value);
  const noteEl = document.getElementById("detail-summary");

  if (detailChart) {
    detailChart.destroy();
    detailChart = null;
  }

  const minutely = forecast.minutely_15;
  if (!minutely || !minutely.time) {
    noteEl.textContent = "この地点の15分ごとの予報を取得できませんでした。";
    return;
  }

  // 現在時刻(15分単位)以降の、指定した時間分のデータを取り出す
  const startIndex = Math.max(0, minutely.time.findIndex((t) => t >= forecast.current.time));
  const end = startIndex + hours * 4 + 1;
  const times = minutely.time.slice(startIndex, end);
  const temps = minutely.temperature_2m.slice(startIndex, end);
  const rains = minutely.precipitation.slice(startIndex, end);
  const probs = times.map((t) => {
    const index = forecast.hourly.time.indexOf(`${t.slice(0, 13)}:00`);
    return index === -1 ? null : forecast.hourly.precipitation_probability[index];
  });
  const unit = forecast.minutely_15_units.temperature_2m;
  const rainUnit = forecast.minutely_15_units.precipitation;

  const totalRain = rains.reduce((sum, r) => sum + (r || 0), 0);
  noteEl.textContent = totalRain > 0
    ? `直近${hours}時間の合計降水量 ${totalRain.toFixed(1)}${rainUnit}`
    : `直近${hours}時間は雨の予報はありません`;

  detailChart = createWeatherChart({
    chartId: "detail-chart",
    stripId: "detail-strip",
    times,
    labels: times.map((t) => parseLocalTime(t).time),
    temps,
    rains,
    probs,
    unit,
    rainUnit,
    rainLabel: "降水量(15分ごと)",
    labelGroups: times.map((t) => t.slice(0, 13)),
  });
}

function renderMap(place) {
  // 地図ライブラリを読み込めなかった場合は、地図なしで天気だけ表示する
  if (typeof L === "undefined") {
    document.getElementById("map-card").hidden = true;
    return;
  }

  const center = [place.latitude, place.longitude];
  // 地理院タイルは国内は詳細だが、海外は大まかな地図しかないため広めの縮尺にする
  const zoom = place.country_code === "JP" ? 12 : 8;

  if (!map) {
    map = L.map("map").setView(center, zoom);
    L.tileLayer(GSI_TILE_URL, {
      maxZoom: 18,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    }).addTo(map);
    marker = L.marker(center).addTo(map);
  } else {
    // 非表示から戻ったときに地図の大きさを計算し直す
    map.invalidateSize();
    map.setView(center, zoom);
    marker.setLatLng(center);
  }
  marker.bindPopup(place.name);
}

function handleError(err) {
  const message = err instanceof TypeError
    ? "通信に失敗しました。インターネット接続を確認してください。"
    : err.message;
  setStatus(message, true);
}

async function showPlaceWeather(place) {
  setStatus(`${place.name}の天気を取得しています…`);
  const forecast = await fetchForecast(place.latitude, place.longitude);
  renderCurrent(place, forecast);
  // 非表示のままだとグラフの大きさが正しく計算されないため、先に表示する
  resultEl.hidden = false;
  renderChart(forecast);
  lastForecast = forecast;
  renderDetailChart();
  renderMap(place);
  setStatus("");
  showWikiInfo(place);
}

function renderCandidates(name, places) {
  candidatesTitleEl.textContent =
    `「${name}」の候補が${places.length}件見つかりました。地域を選んでください。`;
  candidateListEl.replaceChildren(...places.map((place) => {
    const item = document.createElement("li");
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "candidate";
    choice.setAttribute("aria-pressed", "false");

    const placeName = document.createElement("span");
    placeName.className = "candidate-name";
    placeName.textContent = place.name;
    const region = document.createElement("span");
    region.className = "candidate-region";
    region.textContent = placeRegion(place);
    choice.append(placeName, region);

    choice.addEventListener("click", async () => {
      for (const other of candidateListEl.querySelectorAll(".candidate")) {
        other.setAttribute("aria-pressed", String(other === choice));
      }
      try {
        await showPlaceWeather(place);
      } catch (err) {
        handleError(err);
      }
    });

    item.append(choice);
    return item;
  }));
  candidatesEl.hidden = false;
}

// autoSelect が true のときは候補が複数あっても1件目の天気をそのまま表示する(初期表示用)
async function search(cityName, { autoSelect = false } = {}) {
  const name = cityName.trim();
  if (!name) {
    setStatus("都市名を入力してください。", true);
    return;
  }

  button.disabled = true;
  candidatesEl.hidden = true;
  setStatus(`「${name}」を検索しています…`);

  try {
    const places = await geocode(name);
    if (places.length === 1 || autoSelect) {
      await showPlaceWeather(places[0]);
    } else {
      resultEl.hidden = true;
      renderCandidates(name, places);
      setStatus("");
    }
  } catch (err) {
    resultEl.hidden = true;
    handleError(err);
  } finally {
    button.disabled = false;
  }
}

detailHoursEl.addEventListener("change", renderDetailChart);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  // スマホで検索後もキーボードが出たままにならないよう、入力欄のフォーカスを外す
  input.blur();
  search(input.value);
});

if (typeof Chart === "undefined") {
  setStatus("グラフ用ライブラリ(Chart.js)を読み込めませんでした。インターネット接続を確認してください。", true);
} else {
  search(DEFAULT_CITY, { autoSelect: true });
}
