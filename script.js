const API_BASE = "https://prediction-mental-health-score-1.onrender.com";
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
const GAUGE_MAX = 10;


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
    points.push([
      Math.round((i / segments) * width),
      midY
    ]);
  }

  function buildFlatline(offset) {
    return points
      .map(
        ([x, y]) =>
          `${x},${(
            y + Math.sin((x + offset) / 90) * 2
          ).toFixed(1)}`
      )
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
// Ping the API root on load
// ------------------------------------------------------------
async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE}/`, {
      method: "GET"
    });

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
// Field configuration
// ------------------------------------------------------------
const NUMERIC_FIELDS = [
  {
    id: "age",
    key: "Age",
    min: 10,
    max: 100,
    isInt: true
  },

  {
    id: "dailyUsage",
    key: "Avg_Daily_Usage_Hours",
    min: 0,
    max: 24
  },

  {
    id: "unlocks",
    key: "Daily_Unlocks",
    min: 0,
    max: null,
    isInt: true
  },

  {
    id: "studyHours",
    key: "Study_Hours",
    min: 0,
    max: null
  },

  {
    id: "activityHours",
    key: "Physical_Activity_Hours",
    min: 0,
    max: 24
  },

  {
    id: "sleepHours",
    key: "Sleep_Hours_Per_Night",
    min: 0,
    max: 24
  }
];


const SELECT_FIELDS = [
  {
    id: "gender",
    key: "Gender"
  },

  {
    id: "academicLevel",
    key: "Academic_Level"
  },

  {
    id: "platform",
    key: "Most_Used_Platform"
  },

  {
    id: "purpose",
    key: "Purpose_Of_Use"
  },

  {
    id: "stress",
    key: "Stress_Level"
  }
];


const TEXT_FIELDS = [
  {
    id: "country",
    key: "Country"
  }
];


// ------------------------------------------------------------
// Field errors
// ------------------------------------------------------------
function setFieldError(id, message) {
  const element = document.getElementById(id);

  if (!element) return;

  const field = element.closest(".field");

  if (!field) return;

  const errEl = field.querySelector(".err");

  if (message) {
    field.classList.add("invalid");

    if (errEl) {
      errEl.textContent = message;
    }

  } else {
    field.classList.remove("invalid");

    if (errEl) {
      errEl.textContent = "";
    }
  }
}


function clearAllFieldErrors() {
  document
    .querySelectorAll(".field")
    .forEach((f) => f.classList.remove("invalid"));

  document
    .querySelectorAll(".err")
    .forEach((e) => (e.textContent = ""));
}


// ------------------------------------------------------------
// Validate form
// ------------------------------------------------------------
function validateForm() {
  let isValid = true;
  const payload = {};

  NUMERIC_FIELDS.forEach(
    ({ id, key, min, max, isInt }) => {

      const el = document.getElementById(id);

      if (!el) return;

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
    }
  );


  SELECT_FIELDS.forEach(({ id, key }) => {

    const el = document.getElementById(id);

    if (!el) return;

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

    if (!el) return;

    const val = el.value.trim();

    if (!val) {
      setFieldError(id, "Required");
      isValid = false;
      return;
    }

    setFieldError(id, null);

    payload[key] = val;
  });


  return {
    isValid,
    payload
  };
}


// ------------------------------------------------------------
// Result presentation
// ------------------------------------------------------------
function bandForScore(score) {

  if (score >= 7.5) {

    return {
      label: "Thriving",
      color: "var(--sage)",
      desc: "Signals point to a healthy balance between screen time, sleep, and study rhythm right now."
    };

  }


  if (score >= 5) {

    return {
      label: "Holding steady",
      color: "var(--amber)",
      desc: "Mostly balanced, with some habits worth watching — usage, sleep, or activity may be drifting."
    };

  }


  if (score >= 2.5) {

    return {
      label: "Under strain",
      color: "var(--clay)",
      desc: "Several signals — usage, sleep, or stress — are pulling in a difficult direction. Worth a closer look."
    };

  }


  return {
    label: "At risk",
    color: "var(--danger)",
    desc: "The combined signals suggest real strain. Consider reaching out to a counselor or trusted adult."
  };
}


// ------------------------------------------------------------
// Show result
// ------------------------------------------------------------
function showResult(score) {

  const clamped = Math.max(
    GAUGE_MIN,
    Math.min(GAUGE_MAX, score)
  );

  const fraction =
    (clamped - GAUGE_MIN) /
    (GAUGE_MAX - GAUGE_MIN);

  const {
    label,
    color,
    desc
  } = bandForScore(clamped);


  resultCard.hidden = false;

  scoreValueEl.textContent = score.toFixed(2);

  resultLabel.textContent = label;

  resultLabel.style.color = color;

  resultDesc.textContent = desc;


  gaugeFill.style.stroke = color;

  gaugeNeedleDot.style.fill = color;


  // Reset gauge
  gaugeFill.style.transition = "none";

  gaugeFill.style.strokeDashoffset =
    GAUGE_ARC_LENGTH;


  // Force reflow
  void gaugeFill.getBoundingClientRect();


  gaugeFill.style.transition = "";


  requestAnimationFrame(() => {

    gaugeFill.style.strokeDashoffset =
      String(
        GAUGE_ARC_LENGTH *
        (1 - fraction)
      );

  });


  resultCard.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}


// ------------------------------------------------------------
// Close result
// ------------------------------------------------------------
closeResultBtn.addEventListener(
  "click",
  () => {
    resultCard.hidden = true;
  }
);


// ------------------------------------------------------------
// Form error
// ------------------------------------------------------------
function showFormError(message) {
  formError.hidden = false;
  formError.textContent = message;
}


function hideFormError() {
  formError.hidden = true;
  formError.textContent = "";
}


// ------------------------------------------------------------
// Loading state
// ------------------------------------------------------------
function setLoading(isLoading) {

  submitBtn.disabled = isLoading;

  submitBtn.classList.toggle(
    "loading",
    isLoading
  );
}


// ------------------------------------------------------------
// Submit handler
// ------------------------------------------------------------
form.addEventListener(
  "submit",
  async (e) => {

    e.preventDefault();

    hideFormError();

    clearAllFieldErrors();


    // Validate form
    const {
      isValid,
      payload
    } = validateForm();


    if (!isValid) {

      showFormError(
        "A few fields need a second look before this can be sent — check the highlighted fields above."
      );

      return;
    }


    setLoading(true);

    resultCard.hidden = true;


    // --------------------------------------------------------
    // Send request to FastAPI
    // --------------------------------------------------------
    try {

      console.log(
        "Sending prediction request to:",
        PREDICT_URL
      );

      console.log(
        "Payload:",
        payload
      );


      const res = await fetch(
        PREDICT_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(payload)
        }
      );


      // ------------------------------------------------------
      // IMPORTANT:
      // Read response as TEXT first.
      // This prevents "Unexpected end of JSON input".
      // ------------------------------------------------------
      const responseText =
        await res.text();


      console.log(
        "Backend status:",
        res.status
      );

      console.log(
        "Backend response:",
        responseText
      );


      // ------------------------------------------------------
      // Backend returned an error
      // ------------------------------------------------------
      if (!res.ok) {

        let detailMsg =
          `The model server responded with an error (status ${res.status}).`;


        if (responseText) {

          try {

            const errBody =
              JSON.parse(responseText);


            if (errBody?.detail) {

              if (
                Array.isArray(
                  errBody.detail
                )
              ) {

                detailMsg =
                  errBody.detail
                    .map(
                      (d) =>
                        `${(d.loc || []).slice(-1)[0] || "field"}: ${d.msg}`
                    )
                    .join(" · ");

              } else {

                detailMsg =
                  String(
                    errBody.detail
                  );

              }
            }

          } catch {

            detailMsg =
              `${detailMsg} Response: ${responseText}`;

          }
        }


        throw new Error(detailMsg);
      }


      // ------------------------------------------------------
      // Empty response
      // ------------------------------------------------------
      if (!responseText) {

        throw new Error(
          `Backend returned an empty response. Status: ${res.status}`
        );

      }


      // ------------------------------------------------------
      // Convert response to JSON
      // ------------------------------------------------------
      let data;


      try {

        data =
          JSON.parse(responseText);

      } catch (error) {

        console.error(
          "JSON parsing error:",
          error
        );

        throw new Error(
          `Backend returned invalid JSON: ${responseText}`
        );

      }


      // ------------------------------------------------------
      // Get prediction score
      // ------------------------------------------------------
      const score =
        Number(
          data.predicted_mental_Health_score
        );


      if (Number.isNaN(score)) {

        throw new Error(
          "The model server responded, but the score couldn't be read from it."
        );

      }


      console.log(
        "Predicted mental health score:",
        score
      );


      // ------------------------------------------------------
      // Display result
      // ------------------------------------------------------
      showResult(score);


    } catch (err) {

      console.error(
        "Prediction error:",
        err
      );


      if (
        err instanceof TypeError
      ) {

        showFormError(
          "Couldn't reach the deployed prediction server. Please try again."
        );

      } else {

        showFormError(
          err.message ||
          "Something went wrong while getting the readout."
        );

      }


    } finally {

      setLoading(false);

    }

  }
);