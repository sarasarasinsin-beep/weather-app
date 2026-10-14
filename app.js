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

async function geocode(name) {
  const params = new URLSearchParams({
    name,
    count: "1",
    language: "ja",
    format: "json",
  });
  const data = await fetchJson(`${GEOCODING_URL}?${params}`);
  if (!data.results || data.results.length === 0) {
    throw new Error(`「${name}」が見つかりませんでした。別の都市名で試してください。`);
  }
  return data.results[0];
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
  document.getElementById("city-detail").textContent =
    [place.admin1, place.country].filter(Boolean).join("・");
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

async function showWeather(cityName) {
  const name = cityName.trim();
  if (!name) {
    setStatus("都市名を入力してください。", true);
    return;
  }

  button.disabled = true;
  setStatus(`「${name}」の天気を取得しています…`);

  try {
    const place = await geocode(name);
    const forecast = await fetchForecast(place.latitude, place.longitude);
    renderCurrent(place, forecast);
    renderChart(forecast);
    resultEl.hidden = false;
    setStatus("");
  } catch (err) {
    const message = err instanceof TypeError
      ? "通信に失敗しました。インターネット接続を確認してください。"
      : err.message;
    setStatus(message, true);
  } finally {
    button.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  showWeather(input.value);
});

if (typeof Chart === "undefined") {
  setStatus("グラフ用ライブラリ(Chart.js)を読み込めませんでした。インターネット接続を確認してください。", true);
} else {
  showWeather(DEFAULT_CITY);
}
