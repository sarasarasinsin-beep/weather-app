const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_CITY = "京都";

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

let chart = null;

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
    hourly: "temperature_2m",
    forecast_hours: "48",
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
}

function renderChart(forecast) {
  const times = forecast.hourly.time;
  const temps = forecast.hourly.temperature_2m;
  const unit = forecast.hourly_units.temperature_2m;

  const valid = temps.filter((t) => t !== null);
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  document.getElementById("minmax").textContent =
    `48時間の最高 ${max.toFixed(1)}${unit} / 最低 ${min.toFixed(1)}${unit}`;

  if (chart) {
    chart.destroy();
  }

  const ctx = document.getElementById("temp-chart").getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(47, 128, 237, 0.35)");
  gradient.addColorStop(1, "rgba(47, 128, 237, 0.02)");

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: times.map(formatChartLabel),
      datasets: [
        {
          label: `気温(${unit})`,
          data: temps,
          borderColor: "#2f80ed",
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const { month, day, time } = parseLocalTime(times[items[0].dataIndex]);
              return `${month}月${day}日 ${time}`;
            },
            label: (item) => `気温: ${item.parsed.y.toFixed(1)}${unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9 },
        },
        y: {
          ticks: { callback: (value) => `${value}${unit}` },
        },
      },
    },
  });
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
  setStatus("");
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});

if (typeof Chart === "undefined") {
  setStatus("グラフ用ライブラリ(Chart.js)を読み込めませんでした。インターネット接続を確認してください。", true);
} else {
  search(DEFAULT_CITY, { autoSelect: true });
}
