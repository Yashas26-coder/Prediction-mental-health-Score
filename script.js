// ============================================================
// MindPulse — frontend logic
// Talks to a locally running FastAPI backend at:
//   http://127.0.0.1:8000/predict
// ============================================================

const API_BASE = "https://prediction-mental-health-score.onrender.com";
const PREDICT_URL = `${API_BASE}/predict`;

const form = document.getElementById("predictForm");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const resultCard = document.getElementById("resultCard");
const closeResultBtn = document.getElementById("closeResult");

const scoreValueEl = document.getElementById("scoreValue");
const gaugeFill = document.getElementById("gaugeFill");
const gaugeNeedleDot = document.getElementById("gaugeNeedleDot");
const resultLabel = document.getElementById("resultLabel");
const resultDesc = document.getElementById("resultDesc");

const apiDot = document.getElementById("apiDot");
const apiStatus = document.getElementById("apiStatus");

// The arc path (semicircle) is ~314 units long (computed for r=100 in the SVG).
const GAUGE_ARC_LENGTH = 314;
const GAUGE_MIN = 0;
const GAUGE_MAX = 10; // model's predicted score is assumed to fall on a 0–10 scale

// ------------------------------------------------------------
// Ambient pulse line in the header — purely decorative heartbeat
// ------------------------------------------------------------
(function animatePulseLine() {
  const line = document.getElementById("pulseLine");
  if (!line) return;

  const width = 1600;
  const midY = 60;
  let points = [];
  const segments = 160;
  for (let i = 0; i <= segments; i++) {
    points.push([Math.round((i / segments) * width), midY]);
  }

  function buildFlatline(offset) {
    return points
      .map(([x, y]) => `${x},${(y + Math.sin((x + offset) / 90) * 2).toFixed(1)}`)
      .join(" ");
  }

  let offset = 0;
  function tick() {
    offset += 6;
    line.setAttribute("points", buildFlatline(offset));
    requestAnimationFrame(tick);
  }
  tick();
})();

// ------------------------------------------------------------
// Ping the API root on load, just to reflect connection state
// ------------------------------------------------------------
async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE}/`, { method: "GET" });
    if (res.ok) {
      apiDot.classList.add("ok");
      apiStatus.textContent = "Model connection live";
    } else {
      throw new Error("bad status");
    }
  } catch {
    apiDot.classList.add("bad");
    apiStatus.textContent = "Model server not reachable";
  }
}
checkApiHealth();

// ------------------------------------------------------------
// Field config: id -> { key, type, min, max, label }
// Mirrors the StudentData pydantic model exactly.
// ------------------------------------------------------------
const NUMERIC_FIELDS = [
  { id: "age", key: "Age", min: 10, max: 100, isInt: true },
  { id: "dailyUsage", key: "Avg_Daily_Usage_Hours", min: 0, max: 24 },
  { id: "unlocks", key: "Daily_Unlocks", min: 0, max: null, isInt: true },
  { id: "studyHours", key: "Study_Hours", min: 0, max: null },
  { id: "activityHours", key: "Physical_Activity_Hours", min: 0, max: 24 },
  { id: "sleepHours", key: "Sleep_Hours_Per_Night", min: 0, max: 24 },
];

const SELECT_FIELDS = [
  { id: "gender", key: "Gender" },
  { id: "academicLevel", key: "Academic_Level" },
  { id: "platform", key: "Most_Used_Platform" },
  { id: "purpose", key: "Purpose_Of_Use" },
  { id: "stress", key: "Stress_Level" },
];

const TEXT_FIELDS = [{ id: "country", key: "Country" }];

function setFieldError(id, message) {
  const field = document.getElementById(id).closest(".field");
  const errEl = field.querySelector(".err");
  if (message) {
    field.classList.add("invalid");
    errEl.textContent = message;
  } else {
    field.classList.remove("invalid");
    errEl.textContent = "";
  }
}

function clearAllFieldErrors() {
  document.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
  document.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
}

// ------------------------------------------------------------
// Validate the form client-side, mirroring backend constraints
// so people get instant, specific feedback.
// ------------------------------------------------------------
function validateForm() {
  let isValid = true;
  const payload = {};

  NUMERIC_FIELDS.forEach(({ id, key, min, max, isInt }) => {
    const el = document.getElementById(id);
    const raw = el.value.trim();

    if (raw === "") {
      setFieldError(id, "Required");
      isValid = false;
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      setFieldError(id, "Must be a number");
      isValid = false;
      return;
    }
    if (isInt && !Number.isInteger(num)) {
      setFieldError(id, "Whole numbers only");
      isValid = false;
      return;
    }
    if (min !== null && num < min) {
      setFieldError(id, `Must be ≥ ${min}`);
      isValid = false;
      return;
    }
    if (max !== null && num > max) {
      setFieldError(id, `Must be ≤ ${max}`);
      isValid = false;
      return;
    }
    setFieldError(id, null);
    payload[key] = num;
  });

  SELECT_FIELDS.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el.value) {
      setFieldError(id, "Please choose one");
      isValid = false;
      return;
    }
    setFieldError(id, null);
    payload[key] = el.value;
  });

  TEXT_FIELDS.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    const val = el.value.trim();
    if (!val) {
      setFieldError(id, "Required");
      isValid = false;
      return;
    }
    setFieldError(id, null);
    payload[key] = val;
  });

  return { isValid, payload };
}

// ------------------------------------------------------------
// Result presentation
// ------------------------------------------------------------
function bandForScore(score) {
  // Higher score = better wellbeing, in line with a typical
  // 0 (struggling) – 10 (thriving) mental health score.
  if (score >= 7.5) {
    return {
      label: "Thriving",
      color: "var(--sage)",
      desc: "Signals point to a healthy balance between screen time, sleep, and study rhythm right now.",
    };
  }
  if (score >= 5) {
    return {
      label: "Holding steady",
      color: "var(--amber)",
      desc: "Mostly balanced, with some habits worth watching — usage, sleep, or activity may be drifting.",
    };
  }
  if (score >= 2.5) {
    return {
      label: "Under strain",
      color: "var(--clay)",
      desc: "Several signals — usage, sleep, or stress — are pulling in a difficult direction. Worth a closer look.",
    };
  }
  return {
    label: "At risk",
    color: "var(--danger)",
    desc: "The combined signals suggest real strain. Consider reaching out to a counselor or trusted adult.",
  };
}

function showResult(score) {
  const clamped = Math.max(GAUGE_MIN, Math.min(GAUGE_MAX, score));
  const fraction = (clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  const { label, color, desc } = bandForScore(clamped);

  resultCard.hidden = false;
  scoreValueEl.textContent = score.toFixed(2);
  resultLabel.textContent = label;
  resultLabel.style.color = color;
  resultDesc.textContent = desc;

  gaugeFill.style.stroke = color;
  gaugeNeedleDot.style.fill = color;

  // Reset then animate the arc fill on next frame for a clean transition.
  gaugeFill.style.transition = "none";
  gaugeFill.style.strokeDashoffset = GAUGE_ARC_LENGTH;
  // Force reflow so the reset takes effect before re-enabling transition.
  void gaugeFill.getBoundingClientRect();
  gaugeFill.style.transition = "";
  requestAnimationFrame(() => {
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH * (1 - fraction));
  });

  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

closeResultBtn.addEventListener("click", () => {
  resultCard.hidden = true;
});

// ------------------------------------------------------------
// Submit handler
// ------------------------------------------------------------
function showFormError(message) {
  formError.hidden = false;
  formError.textContent = message;
}
function hideFormError() {
  formError.hidden = true;
  formError.textContent = "";
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("loading", isLoading);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideFormError();
  clearAllFieldErrors();

  const { isValid, payload } = validateForm();
  if (!isValid) {
    showFormError("A few fields need a second look before this can be sent — check the highlighted fields above.");
    return;
  }

  setLoading(true);
  resultCard.hidden = true;

  try {
    const res = await fetch(PREDICT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let detailMsg = `The model server responded with an error (status ${res.status}).`;
      try {
        const errBody = await res.json();
        if (errBody?.detail) {
          if (Array.isArray(errBody.detail)) {
            // FastAPI/Pydantic validation error array
            detailMsg = errBody.detail
              .map((d) => `${(d.loc || []).slice(-1)[0] || "field"}: ${d.msg}`)
              .join(" · ");
          } else {
            detailMsg = String(errBody.detail);
          }
        }
      } catch {
        // response wasn't JSON — keep the generic message
      }
      throw new Error(detailMsg);
    }

    const data = await res.json();
    const score = Number(data.predicted_mental_Health_score);

    if (Number.isNaN(score)) {
      throw new Error("The model server responded, but the score couldn't be read from it.");
    }

    showResult(score);
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch network failure — server unreachable, CORS block, etc.
      showFormError(
        "Couldn't reach the prediction server at 127.0.0.1:8000. Make sure the FastAPI backend is running, then try again."
      );
    } else {
      showFormError(err.message || "Something went wrong while getting the readout.");
    }
  } finally {
    setLoading(false);
  }
});