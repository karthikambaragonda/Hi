let co2Chart, strengthChart, recycleChart, radarChart;

const API_BASE = "https://ecopack-ai.azurewebsites.net";

/* ============ SIDEBAR ============ */
let sidebarCollapsed = false;

function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    document.getElementById("sidebar").classList.toggle("collapsed", sidebarCollapsed);
    document.getElementById("main").classList.toggle("expanded", sidebarCollapsed);
    const icon = document.getElementById("toggleIcon");
    if (icon) icon.className = sidebarCollapsed ? "bi bi-chevron-right" : "bi bi-chevron-left";
}

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportExcel() {
    window.open(`${API_BASE}/export_excel`);
}

/* ============ ANIMATED COUNTERS ============ */
function animateValue(id, value) {
    const obj = document.getElementById(id);
    if (!obj) return;
    const end = parseFloat(value);
    const steps = 50;
    const stepVal = end / steps;
    let current = 0;
    let count = 0;

    const counter = setInterval(() => {
        count++;
        current += stepVal;
        obj.textContent = current.toFixed(2);
        if (count >= steps) {
            obj.textContent = typeof value === 'string' ? value : end;
            clearInterval(counter);
        }
    }, 900 / steps);
}

/* ============ FIELD DEFINITIONS ============ */
const FIELD_RULES = [
    { id: 'weight_capacity_score', label: 'Weight Capacity',  min: 1, max: 10, step: 1 },
    { id: 'product_strength_req',  label: 'Strength Score',   min: 1, max: 10, step: 1 },
    { id: 'barrier_score',         label: 'Barrier Score',    min: 1, max: 10, step: 1 },
    { id: 'reuse_potential_score', label: 'Reuse Potential',  min: 1, max: 10, step: 1 },
];

/* ── Per-field validation ── */
function validateField(rule) {
    const el  = document.getElementById(rule.id);
    const err = document.getElementById('err_' + rule.id);
    if (!el || !err) return true;

    const raw = el.value.trim();

    if (raw === '') {
        setFieldState(el, err, 'error', `${rule.label} is required`);
        return false;
    }

    const val = parseFloat(raw);

    if (isNaN(val)) {
        setFieldState(el, err, 'error', 'Must be a number');
        return false;
    }
    if (val < rule.min) {
        setFieldState(el, err, 'error', `Minimum is ${rule.min}`);
        return false;
    }
    if (val > rule.max) {
        setFieldState(el, err, 'error', `Maximum is ${rule.max}`);
        return false;
    }
    if (rule.step === 1 && !Number.isInteger(val)) {
        setFieldState(el, err, 'error', 'Whole numbers only');
        return false;
    }

    setFieldState(el, err, 'ok', '');
    return true;
}

function setFieldState(el, errEl, state, msg) {
    el.classList.toggle('input-error', state === 'error');
    el.classList.toggle('input-ok',    state === 'ok');
    errEl.textContent = msg;
}

/* Attach live listeners once DOM is ready */
document.addEventListener('DOMContentLoaded', () => {
    FIELD_RULES.forEach(rule => {
        const el = document.getElementById(rule.id);
        if (!el) return;

        el.addEventListener('blur', () => {
            if (el.value.trim() === '') return;
            let val = parseFloat(el.value);
            if (!isNaN(val)) {
                val = Math.min(rule.max, Math.max(rule.min, val));
                if (rule.step === 1) val = Math.round(val);
                el.value = val;
            }
            validateField(rule);
        });

        el.addEventListener('input', () => {
            if (el.classList.contains('input-error') || el.classList.contains('input-ok')) {
                validateField(rule);
            }
        });
    });
});

/* ============ ERROR BANNER ============ */
function showError(message) {
    let banner = document.getElementById('api-error-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'api-error-banner';
        banner.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(255,77,109,0.15); border: 1px solid rgba(255,77,109,0.5);
            color: #ff4d6d; padding: 14px 24px; border-radius: 10px; z-index: 9999;
            font-size: 0.88rem; font-weight: 600; display: flex; align-items: center;
            gap: 10px; backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 90vw; text-align: center;
        `;
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> ${message}`;
    banner.style.display = 'flex';
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => { banner.style.display = 'none'; }, 6000);
}

/* ============ MANUAL PREDICTION ============ */
function predict() {
    let allValid = true;
    FIELD_RULES.forEach(rule => { if (!validateField(rule)) allValid = false; });

    if (!allValid) {
        const firstErr = document.querySelector('.form-control.input-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const data = {};
    FIELD_RULES.forEach(rule => {
        data[rule.id] = parseFloat(document.getElementById(rule.id).value);
    });

    const btn = document.querySelector('#dashboard .btn-primary-eco');
    if (btn) {
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Analysing…';
        btn.disabled = true;
    }

    fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(res => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        return res.json();
    })
    .then(result => {
        // API returns a flat array of materials
        const data = Array.isArray(result) ? { materials: result } : result;
        updateDashboard(data);
        scrollToSection('analyticsSection');
    })
    .catch(err => {
        console.error("Predict error:", err);
        showError("Could not reach the API. Please check the server and try again.");
    })
    .finally(() => {
        if (btn) {
            btn.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> Run AI Analysis';
            btn.disabled = false;
        }
    });
}

/* ============ UPDATE DASHBOARD ============ */
function updateDashboard(result) {
    // API returns a flat array — normalise it
    const materials = Array.isArray(result) ? result : (
        result.recommended_materials ||
        result.recommendations        ||
        result.materials              ||
        result.top_materials          ||
        []
    );

    if (!Array.isArray(materials) || materials.length === 0) {
        showError("API returned no materials. Check the server response.");
        return;
    }

    // Top-level metrics: use first item values since API embeds them per-material
    const first = materials[0];
    animateValue("predicted_cost", first.predicted_cost);
    animateValue("predicted_co2",  first.predicted_co2);

    // Compute avg cost saving vs highest-cost material as a simple indicator
    const costs = materials.map(m => m.predicted_cost);
    const maxCost = Math.max(...costs);
    const co2s = materials.map(m => m.predicted_co2);
    const maxCo2 = Math.max(...co2s);

    const co2El  = document.getElementById("co2_reduction");
    const costEl = document.getElementById("cost_savings");
    if (co2El)  co2El.textContent = maxCo2 > 0
        ? (((maxCo2 - first.predicted_co2) / maxCo2) * 100).toFixed(1) + "%"
        : "—";
    if (costEl) costEl.textContent = maxCost > 0
        ? (((maxCost - first.predicted_cost) / maxCost) * 100).toFixed(1) + "%"
        : "—";

    const container = document.getElementById("materials");
    if (!container) return;
    container.innerHTML = "";

    // Show top 5 only
    const top5 = materials.slice(0, 5);
    const rankClasses = ["", "r2", "r3", "r4", "r5"];
    const names = [], co2vals = [], costvals = [], scorevals = [];

    top5.forEach((item, index) => {
        const name  = item.material || item.material_name || "Unknown";
        const co2   = item.predicted_co2  !== undefined ? parseFloat(item.predicted_co2).toFixed(2)  : "—";
        const cost  = item.predicted_cost !== undefined ? parseFloat(item.predicted_cost).toFixed(2)  : "—";
        const score = item.suitability_score !== undefined ? parseFloat(item.suitability_score).toFixed(3) : "—";

        container.innerHTML += `
        <div class="material-card" style="animation-delay:${index * 60}ms">
            <span class="material-rank ${rankClasses[index] || "r5"}">0${index + 1}</span>
            <span class="material-name">${name}</span>
            <div class="material-stats">
                <div class="material-stat">
                    <span>CO&#8322; Score</span>
                    <strong>${co2}</strong>
                </div>
                <div class="material-stat">
                    <span>Cost</span>
                    <strong>$${cost}</strong>
                </div>
                <div class="material-stat">
                    <span>Suitability</span>
                    <strong>${score}</strong>
                </div>
            </div>
        </div>`;

        names.push(name);
        co2vals.push(parseFloat(item.predicted_co2)  || 0);
        costvals.push(parseFloat(item.predicted_cost) || 0);
        scorevals.push(parseFloat(item.suitability_score) || 0);
    });

    renderCharts(names, co2vals, costvals, scorevals);
}

/* ============ CHARTS ============ */
const chartDefaults = {
    plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'DM Sans', size: 12 } } }
    },
    scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { family: 'DM Sans' } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { family: 'DM Sans' } } }
    }
};

function renderCharts(names, co2vals, costvals, scorevals) {
    [co2Chart, strengthChart, recycleChart, radarChart].forEach(c => c && c.destroy());

    // Chart 1 — CO₂ score (horizontal bar)
    co2Chart = new Chart(document.getElementById("co2Chart"), {
        type: "bar",
        data: {
            labels: names,
            datasets: [{ label: "Predicted CO₂", data: co2vals, backgroundColor: "rgba(255,77,109,0.8)", borderRadius: 6 }]
        },
        options: { ...chartDefaults, indexAxis: "y" }
    });

    // Chart 2 — Predicted cost
    strengthChart = new Chart(document.getElementById("strengthChart"), {
        type: "bar",
        data: {
            labels: names,
            datasets: [{ label: "Predicted Cost ($)", data: costvals, backgroundColor: "rgba(76,201,240,0.8)", borderRadius: 6 }]
        },
        options: {
            ...chartDefaults,
            scales: {
                ...chartDefaults.scales,
                y: { ...chartDefaults.scales.y, beginAtZero: false }
            }
        }
    });

    // Chart 3 — Suitability score (line)
    recycleChart = new Chart(document.getElementById("recycleChart"), {
        type: "line",
        data: {
            labels: names,
            datasets: [{
                label: "Suitability Score", data: scorevals,
                borderColor: "#00ffd5", backgroundColor: "rgba(0,255,213,0.08)",
                pointBackgroundColor: "#00ffd5", tension: 0.4, fill: true, pointRadius: 5
            }]
        },
        options: {
            ...chartDefaults,
            scales: {
                ...chartDefaults.scales,
                y: { ...chartDefaults.scales.y, beginAtZero: false }
            }
        }
    });

    // Chart 4 — Radar: CO₂ vs Cost vs Suitability normalised
    const maxCo2   = Math.max(...co2vals)   || 1;
    const maxCost  = Math.max(...costvals)  || 1;
    const maxScore = Math.max(...scorevals) || 1;

    radarChart = new Chart(document.getElementById("radarChart"), {
        type: "radar",
        data: {
            labels: names,
            datasets: [
                {
                    label: "CO₂ (norm)", data: co2vals.map(v => +(v / maxCo2 * 10).toFixed(2)),
                    backgroundColor: "rgba(255,77,109,0.1)", borderColor: "#ff4d6d",
                    pointBackgroundColor: "#ff4d6d", borderWidth: 2, pointRadius: 3
                },
                {
                    label: "Suitability (norm)", data: scorevals.map(v => +(v / maxScore * 10).toFixed(2)),
                    backgroundColor: "rgba(0,255,213,0.1)", borderColor: "#00ffd5",
                    pointBackgroundColor: "#00ffd5", borderWidth: 2, pointRadius: 3
                }
            ]
        },
        options: {
            plugins: { legend: chartDefaults.plugins.legend },
            scales: {
                r: {
                    grid: { color: "rgba(255,255,255,0.08)" },
                    angleLines: { color: "rgba(255,255,255,0.08)" },
                    pointLabels: { color: "#94a3b8", font: { family: "DM Sans", size: 11 } },
                    ticks: { display: false }
                }
            }
        }
    });
}
/* ============ MODE SWITCHING ============ */
function showManual() {
    document.getElementById("dashboard").style.display = "block";
    document.getElementById("aiWizard").style.display = "none";
    document.getElementById("manualModeCard").classList.add("active");
    document.getElementById("wizardModeCard").classList.remove("active");
}

function openAIWizard() {
    document.getElementById("dashboard").style.display = "none";
    document.getElementById("aiWizard").style.display = "block";
    document.getElementById("wizardModeCard").classList.add("active");
    document.getElementById("manualModeCard").classList.remove("active");

    wizardStep = 0;
    wizardData = { product: null, fragility: null, weight: null, eco: null, reuse: null };
    document.getElementById("chatBox").innerHTML = "";
    document.getElementById("options").innerHTML = "";

    setTimeout(nextWizardStep, 300);
}

/* ============ AI WIZARD ============ */
let wizardStep = 0;
let wizardData = { product: null, fragility: null, weight: null, eco: null, reuse: null };

function addBotMessage(text) {
    const box = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = "chat-message bot-msg";
    div.innerHTML = `<span class="bot">${text}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addUserMessage(text) {
    const box = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = "chat-message user-msg";
    div.innerHTML = `<span class="user">${text}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function showOptions(options) {
    const container = document.getElementById("options");
    container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = opt;
        btn.onclick = () => selectOption(opt);
        container.appendChild(btn);
    });
}

function selectOption(value) {
    addUserMessage(value);
    document.getElementById("options").innerHTML = "";

    if (wizardStep === 0)      wizardData.product   = value;
    else if (wizardStep === 1) wizardData.fragility  = value;
    else if (wizardStep === 2) wizardData.weight     = value;
    else if (wizardStep === 3) wizardData.eco        = value;
    else if (wizardStep === 4) wizardData.reuse      = value;

    wizardStep++;
    setTimeout(nextWizardStep, 400);
}

function nextWizardStep() {
    const steps = [
        { msg: "What type of product are you packaging?",  opts: ["Food", "Electronics", "Fragile Item", "General Product"] },
        { msg: "How fragile is the product?",              opts: ["Low", "Medium", "High"] },
        { msg: "What is the weight category?",             opts: ["Light (<1kg)", "Medium (1–5kg)", "Heavy (>5kg)"] },
        { msg: "How important is sustainability?",         opts: ["Low Priority", "Balanced", "Maximum Sustainability"] },
        { msg: "Should the packaging be reusable?",        opts: ["Not Required", "Reusable", "Highly Reusable"] }
    ];

    if (wizardStep < steps.length) {
        addBotMessage(steps[wizardStep].msg);
        setTimeout(() => showOptions(steps[wizardStep].opts), 200);
    } else {
        addBotMessage("⏳ Analysing your packaging requirements…");
        document.getElementById("options").innerHTML = "";
        setTimeout(runAIWizardPrediction, 600);
    }
}

function runAIWizardPrediction() {
    const strength         = wizardData.fragility === "High" ? 9 : wizardData.fragility === "Medium" ? 6 : 4;
    const weightCapacity   = wizardData.weight?.includes("Heavy") ? 9 : wizardData.weight?.includes("Medium") ? 6 : 4;
    const barrier          = wizardData.product === "Food" ? 8 : 5;
    const reuseScore       = wizardData.reuse === "Highly Reusable" ? 9 : wizardData.reuse === "Reusable" ? 6 : 3;
    const biodegradability = wizardData.eco === "Maximum Sustainability" ? 0.9 : wizardData.eco === "Balanced" ? 0.6 : 0.3;
    const recyclability    = wizardData.eco === "Maximum Sustainability" ? 90  : wizardData.eco === "Balanced" ? 70  : 50;

    const data = {
        weight_capacity_score: weightCapacity,
        product_strength_req:  strength,
        barrier_score:         barrier,
        reuse_potential_score: reuseScore,
        biodegradability,
        recyclability_percent: recyclability
    };

    fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(res => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        return res.json();
    })
    .then(result => {
        const data = Array.isArray(result) ? { materials: result } : result;
        addBotMessage("✅ Analysis complete! Scroll down to see the best sustainable packaging materials.");
        updateDashboard(data);
        scrollToSection('analyticsSection');
    })
    .catch(err => {
        console.error("Wizard predict error:", err);
        addBotMessage("❌ Could not reach the API. Please check the server and try again.");
    });
}
