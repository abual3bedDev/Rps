const { createClient } = window.supabase;
const AUTH_PREFS_KEY = "rps_auth_prefs";
const AUTH_COOLDOWN_KEY = "rps_auth_cooldowns";
const SIGNUP_COOLDOWN_MS = 90 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const supabaseClient = createClient(
  window.APP_CONFIG.supabaseUrl,
  window.APP_CONFIG.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
);

const STARTING_POINTS = 20;
const ROOM_ENTRY_COST = 20;
const PARTICIPATION_MIN_POINTS = 20;
const PARTICIPATION_RECOVERY_INTERVAL_MS = 60 * 1000;
const PARTICIPATION_REWARD_AMOUNT = 20;
const RECENT_MATCHES_LIMIT = 5;
const RANK_TIERS = [
  { label: "Bronze", min: 0, icon: "fa-shield" },
  { label: "Silver", min: 40, icon: "fa-shield-halved" },
  { label: "Gold", min: 90, icon: "fa-medal" },
  { label: "Platinum", min: 150, icon: "fa-crown" },
  { label: "Diamond", min: 220, icon: "fa-gem" },
  { label: "Master", min: 320, icon: "fa-chess-king" },
  { label: "Grandmaster", min: 450, icon: "fa-trophy" },
  { label: "Legend", min: 620, icon: "fa-star" },
  { label: "Champion", min: 820, icon: "fa-fire-flame-curved" }
];

const state = {
  authMode: "login",
  authSubmitting: false,
  userId: "",
  profile: null,
  friends: {},
  requests: {},
  currentRoomId: "",
  roomData: null,
  roomChannel: null,
  reactionsChannel: null,
  publicRoomsChannel: null,
  profileChannel: null,
  friendsChannel: null,
  requestsChannel: null,
  timerInterval: null,
  participationInterval: null,
  participationCountdownInterval: null,
  participationTickInFlight: false,
  participationNextTickAt: 0,
  recentMatches: [],
  localReactionEchoes: {},
  battleSignature: "",
  resolvingSignature: "",
  awardingRoomId: "",
  notifiedJoinSignature: "",
  audioContext: null
};

const THEME_KEY = "rps_theme_preference";

function applyTheme(theme, options = {}) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", resolved);
  if (document.body) {
    document.body.setAttribute("data-theme", resolved);
  }
  const icon = document.querySelector("#themeToggle i");
  if (icon) {
    icon.className = resolved === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
  if (!options.skipSave) {
    try {
      localStorage.setItem(THEME_KEY, resolved);
    } catch (error) {
      console.warn("theme save failed:", error);
    }
  }
}

function initTheme() {
  let savedTheme = "dark";
  try {
    savedTheme = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute("data-theme") || "dark";
  } catch (error) {
    savedTheme = document.documentElement.getAttribute("data-theme") || "dark";
  }

  applyTheme(savedTheme, { skipSave: true });
  const toggle = qs("themeToggle");
  if (toggle) {
    toggle.onclick = toggleTheme;
  }
  requestAnimationFrame(() => {
    document.documentElement.classList.add("theme-ready");
  });
}

function setupLandingContent() {
  const spotlightCards = document.querySelectorAll(".hero-side .spotlight-card");
  const featureCards = document.querySelectorAll(".feature-strip .feature-box");

  if (spotlightCards[2]) {
    const cardTag = spotlightCards[2].querySelector(".card-tag");
    const cardTitle = spotlightCards[2].querySelector("h3");
    const cardText = spotlightCards[2].querySelector("p");

    if (cardTag) cardTag.textContent = "Modern UI";
    if (cardTitle) cardTitle.textContent = "Visual Experience";
    if (cardText) {
      cardText.textContent = "واجهة مرتبة بحركات ناعمة، بطاقات واضحة، وانتقالات حديثة تعطي التجربة شكل منصة لعب حقيقية.";
    }
  }

  if (featureCards[2]) {
    const cardTitle = featureCards[2].querySelector("h3");
    const cardText = featureCards[2].querySelector("p");

    if (cardTitle) cardTitle.textContent = "تصاميم عصرية";
    if (cardText) {
      cardText.textContent = "واجهة حديثة بتفاصيل أنظف، ثيمات متناسقة، أنيميشن ناعمة، وتجربة بصرية أقرب لمنتج احترافي كامل.";
    }
  }

  if (featureCards[3]) {
    const cardTitle = featureCards[3].querySelector("h3");
    const cardText = featureCards[3].querySelector("p");

    if (cardTitle) cardTitle.textContent = "مميزات متجددة";
    if (cardText) {
      cardText.textContent = "رانكات، نقاط، سجل مباريات، أصدقاء، وغرف مخصصة قابلة للتطوير لاحقًا مع مزايا أكثر داخل نفس التجربة.";
    }
  }
}

function setupPasswordUi() {
  const authCard = document.querySelector(".auth-card");
  const authSubmitBtn = qs("authSubmitBtn");
  const stackColumn = document.querySelector("#dashboardView .stack-column");

  if (authCard && authSubmitBtn && !qs("forgotPasswordBtn")) {
    authSubmitBtn.insertAdjacentHTML("beforebegin", `
      <button id="forgotPasswordBtn" class="back-link forgot-link" type="button" onclick="requestPasswordReset()">
        <i class="fa-solid fa-key"></i>
        <span>نسيت كلمة المرور؟</span>
      </button>
    `);
  }

  if (authCard && authSubmitBtn && !qs("passwordRecoveryBox")) {
    authSubmitBtn.insertAdjacentHTML("afterend", `
      <div id="passwordRecoveryBox" class="auth-recovery-box" style="display:none;">
        <div class="auth-title-block compact-title-block">
          <span class="card-tag">Password Recovery</span>
          <h3>تعيين كلمة مرور جديدة</h3>
          <p>أدخل كلمة المرور الجديدة ثم أكدها لإكمال استعادة الحساب.</p>
        </div>
        <div class="field-group">
          <label for="recoveryPasswordInput">كلمة المرور الجديدة</label>
          <div class="input-frame">
            <i class="fa-solid fa-lock"></i>
            <input id="recoveryPasswordInput" type="password" placeholder="••••••••">
          </div>
        </div>
        <div class="field-group">
          <label for="recoveryPasswordConfirmInput">تأكيد كلمة المرور</label>
          <div class="input-frame">
            <i class="fa-solid fa-shield-halved"></i>
            <input id="recoveryPasswordConfirmInput" type="password" placeholder="••••••••">
          </div>
        </div>
        <button class="primary-btn wide-btn submit-btn" type="button" onclick="updatePasswordFromRecovery()">
          <i class="fa-solid fa-floppy-disk"></i>
          <span>حفظ كلمة المرور الجديدة</span>
        </button>
      </div>
    `);
  }

  if (stackColumn && !qs("newPasswordInput")) {
    stackColumn.insertAdjacentHTML("beforeend", `
      <section class="panel-card password-panel">
        <div class="panel-head">
          <div class="card-illustration tone-history"><i class="fa-solid fa-key"></i></div>
          <div>
            <span class="card-tag">Security</span>
            <h3>تغيير كلمة المرور</h3>
          </div>
          <i class="fa-solid fa-key panel-head-icon"></i>
        </div>
        <div class="settings-grid password-settings-grid">
          <label class="setting-field">
            <span class="setting-label"><i class="fa-solid fa-lock"></i><span>كلمة المرور الجديدة</span></span>
            <input id="newPasswordInput" type="password" placeholder="••••••••">
          </label>
          <label class="setting-field">
            <span class="setting-label"><i class="fa-solid fa-shield-halved"></i><span>تأكيد كلمة المرور</span></span>
            <input id="confirmPasswordInput" type="password" placeholder="••••••••">
          </label>
        </div>
        <button class="primary-btn wide-btn" type="button" onclick="changePassword()">
          <i class="fa-solid fa-key"></i>
          <span>تحديث كلمة المرور</span>
        </button>
      </section>
    `);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

function loadAuthPrefs() {
  try {
    const raw = localStorage.getItem(AUTH_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("auth prefs load failed:", error);
    return null;
  }
}

function saveAuthPrefs() {
  const rememberInput = qs("rememberSessionInput");
  const shouldRemember = !rememberInput || rememberInput.checked;

  try {
    if (!shouldRemember) {
      localStorage.removeItem(AUTH_PREFS_KEY);
      return;
    }

    localStorage.setItem(AUTH_PREFS_KEY, JSON.stringify({
      email: qs("emailInput")?.value?.trim() || "",
      mode: state.authMode
    }));
  } catch (error) {
    console.warn("auth prefs save failed:", error);
  }
}

function applyAuthPrefs() {
  const rememberInput = qs("rememberSessionInput");
  if (!rememberInput) return;

  const prefs = loadAuthPrefs();
  rememberInput.checked = true;

  if (!prefs) return;

  if (prefs.email && qs("emailInput")) {
    qs("emailInput").value = prefs.email;
  }
  if (prefs.mode === "signup" || prefs.mode === "login") {
    setAuthMode(prefs.mode);
  }
}

function loadAuthCooldowns() {
  try {
    const raw = localStorage.getItem(AUTH_COOLDOWN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("auth cooldowns load failed:", error);
    return {};
  }
}

function saveAuthCooldowns(cooldowns) {
  try {
    localStorage.setItem(AUTH_COOLDOWN_KEY, JSON.stringify(cooldowns));
  } catch (error) {
    console.warn("auth cooldowns save failed:", error);
  }
}

function getCooldownKey(action, email) {
  return `${action}:${String(email || "").trim().toLowerCase()}`;
}

function getRemainingCooldownMs(action, email) {
  const cooldowns = loadAuthCooldowns();
  const expiresAt = Number(cooldowns[getCooldownKey(action, email)] || 0);
  return Math.max(0, expiresAt - Date.now());
}

function startAuthCooldown(action, email, durationMs) {
  const cooldowns = loadAuthCooldowns();
  cooldowns[getCooldownKey(action, email)] = Date.now() + durationMs;
  saveAuthCooldowns(cooldowns);
}

function formatCooldown(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds} ثانية`;
}

function setRecoveryVisible(isVisible) {
  const recoveryBox = qs("passwordRecoveryBox");
  const forgotBtn = qs("forgotPasswordBtn");
  const authSubmitBtn = qs("authSubmitBtn");
  const tabSwitcher = document.querySelector(".tab-switcher");
  const usernameField = qs("usernameField");

  if (recoveryBox) {
    recoveryBox.style.display = isVisible ? "grid" : "none";
  }
  if (forgotBtn) {
    forgotBtn.style.display = !isVisible && state.authMode === "login" ? "inline-flex" : "none";
  }
  if (authSubmitBtn) {
    authSubmitBtn.style.display = isVisible ? "none" : "inline-flex";
  }
  if (tabSwitcher) {
    tabSwitcher.style.display = isVisible ? "none" : "grid";
  }
  if (usernameField && isVisible) {
    usernameField.style.display = "none";
  }
}

function setAuthSubmitting(isSubmitting) {
  state.authSubmitting = isSubmitting;
  const submitBtn = qs("authSubmitBtn");
  const forgotBtn = qs("forgotPasswordBtn");

  if (submitBtn) {
    submitBtn.disabled = isSubmitting;
    submitBtn.style.pointerEvents = isSubmitting ? "none" : "";
    submitBtn.style.opacity = isSubmitting ? "0.72" : "";
    const label = submitBtn.querySelector("span");
    if (label) {
      label.innerText = isSubmitting
        ? (state.authMode === "signup" ? "جاري إنشاء الحساب..." : "جاري تسجيل الدخول...")
        : (state.authMode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول");
    }
  }

  if (forgotBtn) {
    forgotBtn.disabled = isSubmitting;
    forgotBtn.style.pointerEvents = isSubmitting ? "none" : "";
    forgotBtn.style.opacity = isSubmitting ? "0.72" : "";
  }
}

function getFriendlyAuthError(error, mode = "login") {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("email rate limit")) {
    return mode === "signup"
      ? "تم إرسال محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم جرّب مرة أخرى، أو استخدم تسجيل الدخول إذا كان الحساب موجودًا."
      : "تمت محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم جرّب مرة أخرى.";
  }

  if (message.includes("user already registered")) {
    return "هذا البريد مسجل بالفعل. جرّب تسجيل الدخول أو استخدم استعادة كلمة المرور.";
  }

  return error?.message || (mode === "signup" ? "فشل إنشاء الحساب" : "فشل تسجيل الدخول");
}

function qs(id) {
  return document.getElementById(id);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function generateCode(length = 6) {
  return Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(0, length).toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function randomChoice() {
  const choices = ["Rock", "Paper", "Scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
}

function getRankLabel(points = 0) {
  if (points >= 820) return "Champion";
  if (points >= 620) return "Legend";
  if (points >= 450) return "Grandmaster";
  if (points >= 320) return "Master";
  if (points >= 220) return "Diamond";
  if (points >= 150) return "Platinum";
  if (points >= 90) return "Gold";
  if (points >= 40) return "Silver";
  return "Bronze";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRankTierByLabel(rank = "Bronze") {
  return RANK_TIERS.find((tier) => tier.label === rank) || RANK_TIERS[0];
}

function getRankTierByPoints(points = 0) {
  let tier = RANK_TIERS[0];
  for (const current of RANK_TIERS) {
    if (points >= current.min) tier = current;
  }
  return tier;
}

function getNextRankTier(rank = "Bronze") {
  const index = RANK_TIERS.findIndex((tier) => tier.label === rank);
  return index >= 0 && index < RANK_TIERS.length - 1 ? RANK_TIERS[index + 1] : null;
}

function getRankProgressData(points = 0) {
  const current = getRankTierByPoints(points);
  const next = getNextRankTier(current.label);
  if (!next) {
    return {
      current,
      next: current,
      progress: 100,
      text: `وصلت إلى أعلى رانك: ${current.label}`
    };
  }

  const span = Math.max(1, next.min - current.min);
  const progress = clamp(((points - current.min) / span) * 100, 0, 100);
  return {
    current,
    next,
    progress,
    text: `${points - current.min} / ${span} pts نحو ${next.label}`
  };
}

function getRankBadgeMeta(rank = "Bronze") {
  const value = String(rank || "Bronze").toLowerCase();
  if (value === "champion") return { label: "Champion", tone: "champion", icon: "fa-fire-flame-curved" };
  if (value === "legend") return { label: "Legend", tone: "legend", icon: "fa-star" };
  if (value === "grandmaster") return { label: "Grandmaster", tone: "grandmaster", icon: "fa-trophy" };
  if (value === "master") return { label: "Master", tone: "master", icon: "fa-chess-king" };
  if (value === "diamond") return { label: "Diamond", tone: "diamond", icon: "fa-gem" };
  if (value === "platinum") return { label: "Platinum", tone: "platinum", icon: "fa-crown" };
  if (value === "gold") return { label: "Gold", tone: "gold", icon: "fa-medal" };
  if (value === "silver") return { label: "Silver", tone: "silver", icon: "fa-shield-halved" };
  return { label: "Bronze", tone: "bronze", icon: "fa-shield" };
}

function getRankBadgeMarkup(rank, compact = false) {
  const meta = getRankBadgeMeta(rank);
  return `
    <span class="rank-pill ${meta.tone}${compact ? " compact" : ""}">
      <i class="fa-solid ${meta.icon}"></i>
      <span>${meta.label}</span>
    </span>
  `;
}

function renderRankBadge(rank) {
  const badge = qs("rankBadge");
  if (!badge) return;
  const meta = getRankBadgeMeta(rank);
  badge.className = `rank-pill ${meta.tone} rank-badge-trigger`;
  badge.innerHTML = `<i class="fa-solid ${meta.icon}"></i><span>${meta.label}</span>`;
}

function renderRankOverview(profile = state.profile) {
  const panel = qs("rankOverviewModal");
  const list = qs("rankOverviewList");
  if (!panel || !list || !profile) return;

  const currentRank = profile.rank || getRankLabel(profile.points || 0);
  const progress = getRankProgressData(profile.points || 0);
  const currentIndex = RANK_TIERS.findIndex((tier) => tier.label === currentRank);

  qs("rankOverviewCurrentLabel").innerText = currentRank;
  list.innerHTML = RANK_TIERS.map((tier, index) => {
    const stateClass = tier.label === currentRank ? "current" : index < currentIndex ? "passed" : "";
    const requirement = tier.min === 0 ? "تبدأ من 0 نقطة" : `من ${tier.min} نقطة`;
    return `
      <article class="rank-overview-item ${stateClass}">
        <span class="rank-overview-state">${tier.label === currentRank ? "Current" : index < currentIndex ? "Done" : "Locked"}</span>
        <div class="rank-overview-copy">
          <strong>${tier.label}</strong>
          <span>${requirement}</span>
        </div>
        <div class="rank-overview-badge-wrap">
          ${getRankBadgeMarkup(tier.label, true)}
        </div>
      </article>
    `;
  }).join("");

  qs("rankOverviewProgressFill").style.width = `${progress.progress}%`;
  if (progress.current.label === progress.next.label) {
    qs("rankOverviewProgressLabel").innerText = "MAX";
    qs("rankOverviewProgressMeta").innerText = `أنت الآن في أعلى رانك: ${progress.current.label}`;
  } else {
    const remaining = Math.max(0, progress.next.min - (profile.points || 0));
    qs("rankOverviewProgressLabel").innerText = progress.text;
    qs("rankOverviewProgressMeta").innerText = `باقي ${remaining} نقطة للوصول إلى ${progress.next.label}`;
  }
}

function toggleRankOverview(event) {
  if (event) event.stopPropagation();
  const panel = qs("rankOverviewModal");
  if (!panel) return;
  const shouldOpen = panel.style.display === "none" || !panel.style.display;
  if (!shouldOpen) {
    closeRankOverview();
    return;
  }
  renderRankOverview();
  panel.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeRankOverview() {
  const panel = qs("rankOverviewModal");
  if (!panel) return;
  panel.style.display = "none";
  document.body.style.overflow = "";
}

function getRecentMatchesStorageKey() {
  return state.userId ? `rps_recent_matches_${state.userId}` : "";
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleString("ar", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (error) {
    return "";
  }
}

function saveRecentMatches() {
  const key = getRecentMatchesStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state.recentMatches || []));
  } catch (error) {
    console.warn("recent matches save failed:", error);
  }
}

function renderRecentMatches() {
  const list = qs("recentMatchesList");
  if (!list) return;

  const items = state.recentMatches || [];
  if (!items.length) {
    list.className = "list-shell empty-state compact-empty";
    list.innerHTML = "لا توجد مباريات بعد.";
    return;
  }

  list.className = "history-list";
  list.innerHTML = items.map((match) => `
    <article class="history-item ${match.result === "win" ? "win" : "loss"}">
      <div class="history-item-top">
        <strong>ضد ${escapeHtml(match.opponent || "خصم")}</strong>
        <span class="history-result">${match.result === "win" ? "فوز" : "خسارة"}</span>
      </div>
      <div class="history-item-bottom">
        ${getRankBadgeMarkup(match.rankTo, true)}
        <span class="history-points ${match.pointsDelta >= 0 ? "positive" : "negative"}">${match.pointsDelta >= 0 ? "+" : ""}${match.pointsDelta} pts</span>
        <span class="history-time">${escapeHtml(formatMatchTime(match.playedAt))}</span>
      </div>
    </article>
  `).join("");
}

function loadRecentMatches() {
  const key = getRecentMatchesStorageKey();
  if (!key) {
    state.recentMatches = [];
    renderRecentMatches();
    return;
  }

  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    state.recentMatches = Array.isArray(parsed) ? parsed.slice(0, RECENT_MATCHES_LIMIT) : [];
  } catch (error) {
    state.recentMatches = [];
  }

  renderRecentMatches();
}

function recordRecentMatch(summary) {
  if (!summary || !summary.createdAt || !state.userId) return;
  const matchId = String(summary.createdAt);
  if ((state.recentMatches || []).some((match) => match.id === matchId)) return;

  const isWinner = summary.winnerId === state.userId;
  const entry = {
    id: matchId,
    result: isWinner ? "win" : "loss",
    opponent: isWinner ? summary.loserName : summary.winnerName,
    pointsDelta: isWinner ? summary.winnerPointsDelta : summary.loserPointsDelta,
    rankFrom: isWinner ? summary.winnerRankFrom : summary.loserRankFrom,
    rankTo: isWinner ? summary.winnerRankTo : summary.loserRankTo,
    playedAt: summary.createdAt
  };

  state.recentMatches = [entry, ...(state.recentMatches || [])].slice(0, RECENT_MATCHES_LIMIT);
  saveRecentMatches();
  renderRecentMatches();
}

function stopParticipationRecovery() {
  if (state.participationInterval) {
    clearInterval(state.participationInterval);
    state.participationInterval = null;
  }
  if (state.participationCountdownInterval) {
    clearInterval(state.participationCountdownInterval);
    state.participationCountdownInterval = null;
  }
  state.participationNextTickAt = 0;
  const hint = qs("pointsRecoveryHint");
  if (hint) {
    hint.style.display = "none";
    hint.innerText = "";
  }
}

function isParticipationRecoveryBlocked() {
  return !!(
    state.currentRoomId &&
    state.roomData
  );
}

function formatRecoveryTime(msLeft) {
  const safe = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateParticipationHint() {
  const hint = qs("pointsRecoveryHint");
  if (!hint) return;
  if (isParticipationRecoveryBlocked()) {
    hint.style.display = "block";
    hint.innerText = "تعويض النقاط متوقف أثناء وجودك في الـ Arena";
    return;
  }
  if (!state.profile || (state.profile.points || 0) >= PARTICIPATION_MIN_POINTS || !state.participationNextTickAt) {
    hint.style.display = "none";
    hint.innerText = "";
    return;
  }

  hint.style.display = "block";
  hint.innerText = `سيتم إضافة نقطة لك بعد ${formatRecoveryTime(state.participationNextTickAt - Date.now())}`;
}

function playPointsGainFx(amount = PARTICIPATION_REWARD_AMOUNT, onMidpoint) {
  const fx = qs("pointsGainFx");
  if (!fx) {
    if (typeof onMidpoint === "function") onMidpoint();
    return;
  }

  fx.innerText = `+${amount}`;
  fx.classList.remove("show");
  void fx.offsetWidth;
  fx.classList.add("show");

  setTimeout(() => {
    if (typeof onMidpoint === "function") onMidpoint();
  }, 320);

  setTimeout(() => {
    fx.classList.remove("show");
  }, 1050);
}

async function recoverParticipationPoint() {
  if (!state.userId || state.participationTickInFlight || isParticipationRecoveryBlocked()) {
    updateParticipationHint();
    return;
  }
  state.participationTickInFlight = true;

  try {
    const latest = await fetchUser(state.userId);
    if (!latest) {
      stopParticipationRecovery();
      return;
    }

    state.profile = latest;
    renderProfile(latest);

    const currentPoints = latest.points || 0;
    if (currentPoints >= PARTICIPATION_MIN_POINTS) {
      stopParticipationRecovery();
      return;
    }

    const nextPoints = Math.min(PARTICIPATION_MIN_POINTS, currentPoints + PARTICIPATION_REWARD_AMOUNT);
    const { data, error } = await supabaseClient
      .from("users")
      .update({
        points: nextPoints,
        rank: getRankLabel(nextPoints),
        updated_at: nowIso()
      })
      .eq("id", state.userId)
      .eq("points", currentPoints)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      state.profile = { ...latest };
      playPointsGainFx(PARTICIPATION_REWARD_AMOUNT, () => {
        state.profile = data;
        renderProfile(data);
      });
      if (nextPoints >= PARTICIPATION_MIN_POINTS) {
        stopParticipationRecovery();
      } else {
        state.participationNextTickAt = Date.now() + PARTICIPATION_RECOVERY_INTERVAL_MS;
        updateParticipationHint();
      }
    }
  } catch (error) {
    console.error("participation recovery failed:", error);
  } finally {
    state.participationTickInFlight = false;
  }
}

function syncParticipationRecovery(profile = state.profile) {
  stopParticipationRecovery();
  if (!profile || !state.userId) return;
  if ((profile.points || 0) >= PARTICIPATION_MIN_POINTS) return;
  if (isParticipationRecoveryBlocked()) {
    updateParticipationHint();
    return;
  }

  state.participationNextTickAt = Date.now() + PARTICIPATION_RECOVERY_INTERVAL_MS;
  updateParticipationHint();
  state.participationCountdownInterval = setInterval(updateParticipationHint, 1000);
  state.participationInterval = setInterval(() => {
    recoverParticipationPoint();
  }, PARTICIPATION_RECOVERY_INTERVAL_MS);
}

function roomFromRow(row) {
  if (!row) return null;
  return {
    roomId: row.room_id,
    visibility: row.visibility,
    roundsToWin: row.rounds_to_win,
    timerSeconds: row.timer_seconds,
    entryCost: row.entry_cost,
    hostId: row.host_id,
    hostName: row.host_name,
    player1Id: row.player1_id,
    player1Name: row.player1_name,
    player2Id: row.player2_id,
    player2Name: row.player2_name,
    player1Choice: row.player1_choice || "",
    player2Choice: row.player2_choice || "",
    player1Auto: row.player1_auto,
    player2Auto: row.player2_auto,
    score1: row.score1 || 0,
    score2: row.score2 || 0,
    roundNumber: row.round_number || 1,
    roundActive: row.round_active,
    roundDeadline: row.round_deadline,
    status: row.status,
    resultText: row.result_text || "",
    roundMetaText: row.round_meta_text || "",
    championId: row.champion_id,
    championName: row.champion_name,
    pointsAwarded: row.points_awarded,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}


function getToastMeta(type = "info") {
  return {
    success: { icon: "fa-solid fa-circle-check", title: "نجاح", frequency: 880 },
    error: { icon: "fa-solid fa-circle-xmark", title: "خطأ", frequency: 220 },
    warning: { icon: "fa-solid fa-triangle-exclamation", title: "تنبيه", frequency: 520 },
    info: { icon: "fa-solid fa-circle-info", title: "إشعار", frequency: 660 }
  }[type] || { icon: "fa-solid fa-bell", title: "إشعار", frequency: 660 };
}

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!state.audioContext) state.audioContext = new AudioCtx();
  return state.audioContext;
}

function playNotificationSound(type = "info") {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  const { frequency } = getToastMeta(type);
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  master.connect(context.destination);

  const osc1 = context.createOscillator();
  osc1.type = type === "error" ? "sawtooth" : "sine";
  osc1.frequency.setValueAtTime(frequency, now);
  osc1.connect(master);
  osc1.start(now);
  osc1.stop(now + 0.16);

  const osc2 = context.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(frequency * 1.35, now + 0.08);
  osc2.connect(master);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.32);
}

function showToast(message, type = "info", options = {}) {
  const container = qs("toast-container");
  if (!container) return;

  const meta = getToastMeta(type);
  const duration = Math.max(1800, Number(options.duration || 5000));
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-main">
      <div class="toast-icon-wrap"><i class="${meta.icon}"></i></div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(options.title || meta.title)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
      </div>
    </div>
    <button class="toast-close" type="button" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
    <div class="toast-progress" style="animation-duration:${duration}ms"></div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  if (!options.silent) {
    playNotificationSound(type);
  }

  let removed = false;
  const removeToast = () => {
    if (removed) return;
    removed = true;
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 240);
  };

  toast.querySelector(".toast-close").addEventListener("click", removeToast);
  setTimeout(removeToast, duration);
}


function setView(view) {
  qs("dashboardView").style.display = view === "dashboard" ? "block" : "none";
  qs("arenaView").style.display = view === "arena" ? "block" : "none";
}

function updateStatusBar(message) {
  qs("info").innerText = message;
}

function setSetupVisible(isVisible) {
  qs("setupScreen").style.display = isVisible ? "grid" : "none";
  qs("appShell").style.display = isVisible ? "none" : "block";
}

function setLandingVisible(isVisible) {
  qs("landingScreen").style.display = isVisible ? "flex" : "none";
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isSignup = mode === "signup";
  qs("usernameField").style.display = isSignup ? "block" : "none";
  qs("authSubmitBtn").querySelector("span").innerText = isSignup ? "إنشاء الحساب" : "تسجيل الدخول";
  qs("loginTabBtn").classList.toggle("active-tab", !isSignup);
  qs("signupTabBtn").classList.toggle("active-tab", isSignup);
  setRecoveryVisible(false);
}

function openAuthScreen(mode = "signup") {
  setAuthMode(mode);
  saveAuthPrefs();
  setLandingVisible(false);
  setSetupVisible(true);
}

async function ensureProfileForSession(user, usernameFromSignup = "") {
  state.userId = user.id;
  let profile = await fetchUser(user.id);

  if (!profile) {
    const displayName = usernameFromSignup || user.user_metadata?.display_name || user.email?.split("@")[0] || "Player";
    await updateUser(user.id, {
      display_name: displayName,
      code: generateCode(),
      points: STARTING_POINTS,
      wins: 0,
      losses: 0,
      rank: getRankLabel(STARTING_POINTS),
      created_at: nowIso(),
      updated_at: nowIso(),
      last_seen: nowIso()
    });
    profile = await fetchUser(user.id);
  }

  state.profile = profile;
  renderProfile(profile);
}

async function submitAuth() {
  const email = qs("emailInput").value.trim();
  const password = qs("passwordInput").value;
  const username = qs("displayNameInput").value.trim();

  if (!email || !password) {
    showToast("أدخل الإيميل وكلمة المرور", "error");
    return;
  }

  if (state.authMode === "signup") {
    if (!username) {
      showToast("أدخل اسم المستخدم", "error");
      return;
    }

    saveAuthPrefs();
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username
        }
      }
    });

    if (error) {
      showToast(error.message || "فشل إنشاء الحساب", "error");
      return;
    }

    if (!data.session) {
      showToast("تم إنشاء الحساب. افحص بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.", "success");
      setAuthMode("login");
      return;
    }

    await ensureProfileForSession(data.user, username);
    await afterAuthenticated();
    showToast("تم إنشاء الحساب والدخول", "success");
    return;
  }

  saveAuthPrefs();
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showToast(error.message || "فشل تسجيل الدخول", "error");
    return;
  }

  await ensureProfileForSession(data.user);
  await afterAuthenticated();
  showToast("تم تسجيل الدخول", "success");
}

async function requestPasswordReset() {
  const email = qs("emailInput")?.value?.trim();
  const remaining = getRemainingCooldownMs("reset", email);
  if (!email) {
    showToast("أدخل الإيميل أولًا لإرسال رابط الاستعادة", "warning");
    return;
  }

  if (remaining > 0) {
    showToast(`يمكنك طلب رابط جديد بعد ${formatCooldown(remaining)}.`, "warning");
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href
  });

  if (error) {
    showToast(error.message || "تعذر إرسال رابط الاستعادة", "error");
    return;
  }

  saveAuthPrefs();
  showToast("تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني", "success");
}

async function updatePasswordFromRecovery() {
  const password = qs("recoveryPasswordInput")?.value || "";
  const confirmPassword = qs("recoveryPasswordConfirmInput")?.value || "";

  if (!password || password.length < 6) {
    showToast("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل", "warning");
    return;
  }

  if (password !== confirmPassword) {
    showToast("تأكيد كلمة المرور غير مطابق", "error");
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    showToast(error.message || "تعذر تحديث كلمة المرور", "error");
    return;
  }

  if (qs("recoveryPasswordInput")) qs("recoveryPasswordInput").value = "";
  if (qs("recoveryPasswordConfirmInput")) qs("recoveryPasswordConfirmInput").value = "";
  setRecoveryVisible(false);
  setAuthMode("login");
  showToast("تم تحديث كلمة المرور بنجاح", "success");
}

async function changePassword() {
  const password = qs("newPasswordInput")?.value || "";
  const confirmPassword = qs("confirmPasswordInput")?.value || "";

  if (!password || password.length < 6) {
    showToast("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل", "warning");
    return;
  }

  if (password !== confirmPassword) {
    showToast("تأكيد كلمة المرور غير مطابق", "error");
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    showToast(error.message || "تعذر تغيير كلمة المرور", "error");
    return;
  }

  if (qs("newPasswordInput")) qs("newPasswordInput").value = "";
  if (qs("confirmPasswordInput")) qs("confirmPasswordInput").value = "";
  showToast("تم تغيير كلمة المرور بنجاح", "success");
}

window.showToastOriginal = showToast;
const defaultSubmitAuth = submitAuth;
submitAuth = async function submitAuthGuarded() {
  if (state.authSubmitting) return;

  const email = qs("emailInput")?.value?.trim();
  const password = qs("passwordInput")?.value || "";
  const username = qs("displayNameInput")?.value?.trim() || "";

  if (state.authMode === "signup") {
    const remaining = getRemainingCooldownMs("signup", email);
    if (remaining > 0) {
      showToast(`انتظر ${formatCooldown(remaining)} قبل محاولة إنشاء الحساب مرة أخرى.`, "warning");
      return;
    }
  }

  if (!email || !password) {
    showToast("أدخل الإيميل وكلمة المرور", "error");
    return;
  }

  if (state.authMode === "signup" && !username) {
    showToast("أدخل اسم المستخدم", "error");
    return;
  }

  setAuthSubmitting(true);

  try {
    const originalShowToast = showToast;
    let hadError = false;
    showToast = (message, type = "info", options = {}) => {
      const normalized = String(message || "");
      if (type === "error") {
        hadError = true;
        return originalShowToast(getFriendlyAuthError({ message: normalized }, state.authMode), type, options);
      }
      return originalShowToast(message, type, options);
    };

    await defaultSubmitAuth();
    if (!hadError && state.authMode === "signup") {
      startAuthCooldown("signup", email, SIGNUP_COOLDOWN_MS);
    }

    showToast = originalShowToast;
  } catch (error) {
    showToast(getFriendlyAuthError(error, state.authMode), "error");
  } finally {
    if (typeof showToast === "function" && showToast.name !== "showToast") {
      showToast = window.showToastOriginal || showToast;
    }
    setAuthSubmitting(false);
  }
};

const defaultRequestPasswordReset = requestPasswordReset;
requestPasswordReset = async function requestPasswordResetGuarded() {
  if (state.authSubmitting) return;

  const email = qs("emailInput")?.value?.trim();
  if (!email) {
    showToast("أدخل الإيميل أولًا لإرسال رابط الاستعادة", "warning");
    return;
  }

  setAuthSubmitting(true);

  try {
    const originalShowToast = showToast;
    let hadError = false;
    showToast = (message, type = "info", options = {}) => {
      const normalized = String(message || "");
      if (type === "error") {
        hadError = true;
        return originalShowToast(getFriendlyAuthError({ message: normalized }, "login"), type, options);
      }
      return originalShowToast(message, type, options);
    };

    await defaultRequestPasswordReset();
    if (!hadError) {
      startAuthCooldown("reset", email, RESET_COOLDOWN_MS);
    }

    showToast = originalShowToast;
  } catch (error) {
    showToast(getFriendlyAuthError(error, "login"), "error");
  } finally {
    if (typeof showToast === "function" && showToast.name !== "showToast") {
      showToast = window.showToastOriginal || showToast;
    }
    setAuthSubmitting(false);
  }
};

async function updateUser(userId, values) {
  const payload = { ...values, id: userId };
  const { error } = await supabaseClient.from("users").upsert(payload);
  if (error) throw error;
}

async function fetchUser(userId) {
  const { data, error } = await supabaseClient.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchProfilesByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabaseClient.from("users").select("*").in("id", ids);
  if (error) throw error;
  return data || [];
}

async function saveProfile() {
  const displayName = qs("displayNameInput").value.trim();
  if (!displayName) {
    showToast("اكتب اسم العرض أولاً", "error");
    return;
  }

  const currentPoints = state.profile?.points ?? STARTING_POINTS;
  try {
    await updateUser(state.userId, {
      display_name: displayName,
      code: state.profile?.code || generateCode(),
      points: currentPoints,
      wins: state.profile?.wins || 0,
      losses: state.profile?.losses || 0,
      rank: getRankLabel(currentPoints),
      created_at: state.profile?.created_at || nowIso(),
      updated_at: nowIso(),
      last_seen: nowIso()
    });
    await loadProfile();
    setSetupVisible(false);
    setView("dashboard");
    showToast("تم حفظ الحساب", "success");
  } catch (error) {
    console.error("saveProfile failed:", error);
    showToast(`تعذر حفظ الحساب: ${error.message || "Supabase error"}`, "error");
  }
}

function renderProfile(profile) {
  qs("profileName").innerText = profile.display_name || "-";
  qs("friendCodeValue").innerText = profile.code || "------";
  qs("pointsValue").innerText = profile.points || 0;
  const rank = profile.rank || getRankLabel(profile.points || 0);
  qs("rankValue").innerText = rank;
  renderRankBadge(rank);
  renderRankOverview(profile);
  qs("winsValue").innerText = profile.wins || 0;
  qs("lossesValue").innerText = profile.losses || 0;
}

async function loadProfile() {
  if (!state.userId) return null;
  const profile = await fetchUser(state.userId);
  state.profile = profile;

  if (!profile || !profile.display_name) {
    setSetupVisible(true);
    return null;
  }

  qs("displayNameInput").value = profile.display_name;
  renderProfile(profile);
  loadRecentMatches();
  syncParticipationRecovery(profile);
  setSetupVisible(false);
  return profile;
}

function subscribeProfile() {
  if (!state.userId) return;
  if (state.profileChannel) {
    supabaseClient.removeChannel(state.profileChannel);
  }

  state.profileChannel = supabaseClient
    .channel(`profile-${state.userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "users",
      filter: `id=eq.${state.userId}`
    }, async () => {
      await loadProfile();
      await refreshLeaderboard();
    })
    .subscribe();
}

async function afterAuthenticated() {
  setLandingVisible(false);
  setSetupVisible(false);
  setView("dashboard");
  await loadProfile();
  await loadFriendsAndRequests();
  await refreshPublicRooms();
  subscribeProfile();
  subscribeFriendsAndRequests();
  subscribePublicRooms();
}

async function logout() {
  stopParticipationRecovery();
  try {
    if (!qs("rememberSessionInput")?.checked) {
      localStorage.removeItem(AUTH_PREFS_KEY);
    }
  } catch (error) {
    console.warn("auth prefs clear failed:", error);
  }
  await supabaseClient.auth.signOut();
  clearRoomSubscriptions();
  if (state.profileChannel) supabaseClient.removeChannel(state.profileChannel);
  if (state.friendsChannel) supabaseClient.removeChannel(state.friendsChannel);
  if (state.requestsChannel) supabaseClient.removeChannel(state.requestsChannel);
  if (state.publicRoomsChannel) supabaseClient.removeChannel(state.publicRoomsChannel);
  state.profileChannel = null;
  state.friendsChannel = null;
  state.requestsChannel = null;
  state.publicRoomsChannel = null;
  state.userId = "";
  state.profile = null;
  state.friends = {};
  state.requests = {};
  state.recentMatches = [];
  renderRecentMatches();
  qs("emailInput").value = "";
  qs("passwordInput").value = "";
  setAuthMode("login");
  setLandingVisible(true);
  setSetupVisible(false);
  applyAuthPrefs();
  setView("dashboard");
}

async function fetchFriendsMap() {
  const { data, error } = await supabaseClient.from("friends").select("friend_id").eq("user_id", state.userId);
  if (error) throw error;

  const map = {};
  (data || []).forEach((row) => {
    map[row.friend_id] = true;
  });
  return map;
}

async function fetchRequestsMap() {
  const { data, error } = await supabaseClient.from("friend_requests").select("*").eq("target_user_id", state.userId);
  if (error) throw error;

  const map = {};
  (data || []).forEach((row) => {
    map[row.from_user_id] = {
      displayName: row.display_name,
      code: row.code,
      createdAt: row.created_at
    };
  });
  return map;
}

async function loadFriendsAndRequests() {
  state.friends = await fetchFriendsMap();
  state.requests = await fetchRequestsMap();
  renderRequests();
  await refreshLeaderboard();
}

function subscribeFriendsAndRequests() {
  if (state.friendsChannel) {
    supabaseClient.removeChannel(state.friendsChannel);
  }
  if (state.requestsChannel) {
    supabaseClient.removeChannel(state.requestsChannel);
  }

  state.friendsChannel = supabaseClient
    .channel(`friends-${state.userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "friends"
    }, loadFriendsAndRequests)
    .subscribe();

  state.requestsChannel = supabaseClient
    .channel(`requests-${state.userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "friend_requests"
    }, loadFriendsAndRequests)
    .subscribe();
}

function renderRequests() {
  const entries = Object.entries(state.requests || {});
  const el = qs("friendRequestsList");

  if (!entries.length) {
    el.className = "list-shell empty-state";
    el.innerHTML = "لا توجد طلبات حالياً.";
    return;
  }

  el.className = "list-shell";
  el.innerHTML = entries.map(([fromUid, request]) => `
    <div class="request-item">
      <div class="item-meta">
        <strong>${escapeHtml(request.displayName || "Unknown")}</strong>
        <span>${escapeHtml(request.code || "-")}</span>
      </div>
      <span class="mini-label">طلب صداقة</span>
      <div class="request-actions">
        <button class="btn-secondary" onclick="acceptFriendRequest('${fromUid}')">قبول</button>
        <button class="btn-ghost" onclick="rejectFriendRequest('${fromUid}')">رفض</button>
      </div>
    </div>
  `).join("");
}

function renderFriends(profiles) {
  const list = qs("friendsList");
  if (!profiles.length) {
    list.className = "list-shell empty-state";
    list.innerHTML = "لا يوجد أصدقاء بعد.";
    return;
  }

  list.className = "list-shell";
  list.innerHTML = profiles.map((friend) => `
    <div class="list-item">
      <div class="item-meta">
        <div class="item-title-row">
          <strong>${escapeHtml(friend.display_name || "Unknown")}</strong>
          ${getRankBadgeMarkup(friend.rank || "Bronze", true)}
        </div>
        <span>${escapeHtml(friend.rank || "Bronze")} • ${friend.points || 0} pts</span>
      </div>
      <button class="btn-ghost" onclick="removeFriend('${friend.id}')">إزالة</button>
    </div>
  `).join("");
}

async function refreshLeaderboard() {
  if (!state.profile) return;

  const ids = Array.from(new Set([state.userId, ...Object.keys(state.friends || {})]));
  const profiles = await fetchProfilesByIds(ids);
  const sorted = profiles.sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    return (b.wins || 0) - (a.wins || 0);
  });

  renderFriends(sorted.filter((profile) => profile.id !== state.userId));

  const list = qs("leaderboardList");
  if (!sorted.length) {
    list.className = "list-shell empty-state";
    list.innerHTML = "لا توجد بيانات كافية بعد.";
    return;
  }

  list.className = "list-shell";
  list.innerHTML = sorted.map((profile, index) => `
    <div class="list-item">
      <div class="item-meta">
        <div class="item-title-row">
          <strong>${escapeHtml(profile.display_name)}${profile.id === state.userId ? " (أنت)" : ""}</strong>
          ${getRankBadgeMarkup(profile.rank || getRankLabel(profile.points || 0), true)}
        </div>
        <span>${escapeHtml(profile.rank || getRankLabel(profile.points || 0))} • ${profile.points || 0} pts</span>
      </div>
      <div class="leaderboard-side">
        <div class="rank-badge">#${index + 1}</div>
        <div class="mini-label">${profile.wins || 0}W / ${profile.losses || 0}L</div>
      </div>
    </div>
  `).join("");
}

async function sendFriendRequest() {
  if (!state.profile) return;

  const code = qs("friendCodeInput").value.trim().toUpperCase();
  if (!code) {
    showToast("أدخل Friend Code", "error");
    return;
  }
  if (code === state.profile.code) {
    showToast("لا يمكنك إضافة نفسك", "warning");
    return;
  }

  const { data, error } = await supabaseClient.from("users").select("*").eq("code", code).limit(1).maybeSingle();
  if (error || !data) {
    showToast("الكود غير موجود", "error");
    return;
  }
  if (state.friends[data.id]) {
    showToast("هذا الشخص موجود بالفعل ضمن الأصدقاء", "info");
    return;
  }

  const { error: insertError } = await supabaseClient.from("friend_requests").upsert({
    target_user_id: data.id,
    from_user_id: state.userId,
    display_name: state.profile.display_name,
    code: state.profile.code,
    created_at: nowIso()
  });
  if (insertError) {
    showToast("تعذر إرسال الطلب", "error");
    return;
  }

  qs("friendCodeInput").value = "";
  showToast(`تم إرسال الطلب إلى ${data.display_name}`, "success");
}

async function acceptFriendRequest(fromUid) {
  const payload = [
    { user_id: state.userId, friend_id: fromUid, created_at: nowIso() },
    { user_id: fromUid, friend_id: state.userId, created_at: nowIso() }
  ];

  const { error: friendsError } = await supabaseClient.from("friends").upsert(payload);
  if (friendsError) {
    showToast("تعذر إضافة الصديق", "error");
    return;
  }

  await supabaseClient.from("friend_requests").delete().eq("target_user_id", state.userId).eq("from_user_id", fromUid);
  await loadFriendsAndRequests();
  showToast("تمت إضافة الصديق", "success");
}

async function rejectFriendRequest(fromUid) {
  await supabaseClient.from("friend_requests").delete().eq("target_user_id", state.userId).eq("from_user_id", fromUid);
  await loadFriendsAndRequests();
  showToast("تم رفض الطلب", "info");
}

async function removeFriend(friendUid) {
  await supabaseClient.from("friends").delete().eq("user_id", state.userId).eq("friend_id", friendUid);
  await supabaseClient.from("friends").delete().eq("user_id", friendUid).eq("friend_id", state.userId);
  await loadFriendsAndRequests();
  showToast("تمت إزالة الصديق", "info");
}

function copyFriendCode() {
  if (!state.profile?.code) return;
  navigator.clipboard.writeText(state.profile.code);
  showToast("تم نسخ Friend Code", "success");
}

function buildRoomPayload(roomId) {
  const visibility = qs("roomVisibilityInput").value;
  const roundsToWin = Number(qs("roundsToWinInput").value);
  const timerSeconds = Number(qs("timerSecondsInput").value);
  const deadline = Date.now() + (timerSeconds * 1000);

  return {
    room_id: roomId,
    visibility,
    rounds_to_win: roundsToWin,
    timer_seconds: timerSeconds,
    entry_cost: ROOM_ENTRY_COST,
    host_id: state.userId,
    host_name: state.profile.display_name,
    player1_id: state.userId,
    player1_name: state.profile.display_name,
    player2_id: null,
    player2_name: null,
    player1_choice: "",
    player2_choice: "",
    player1_auto: false,
    player2_auto: false,
    score1: 0,
    score2: 0,
    round_number: 1,
    round_active: true,
    round_deadline: deadline,
    status: "waiting",
    result_text: "",
    round_meta_text: "بانتظار الخصم",
    champion_id: null,
    champion_name: null,
    points_awarded: false,
    summary: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

async function createRoom() {
  if (!state.profile) return;
  if (state.currentRoomId) {
    showToast("اخرج من الغرفة الحالية أولاً", "warning");
    return;
  }
  if ((state.profile.points || 0) < ROOM_ENTRY_COST) {
    showToast(`تحتاج ${ROOM_ENTRY_COST} نقطة على الأقل لإنشاء الغرفة`, "warning");
    return;
  }

  const roomId = generateCode(6);
  const nextPoints = (state.profile.points || 0) - ROOM_ENTRY_COST;

  const { error: userError } = await supabaseClient.from("users").update({
    points: nextPoints,
    rank: getRankLabel(nextPoints),
    updated_at: nowIso()
  }).eq("id", state.userId);
  if (userError) {
    showToast("تعذر خصم نقاط إنشاء الغرفة", "error");
    return;
  }

  const { error: roomError } = await supabaseClient.from("rooms").insert(buildRoomPayload(roomId));
  if (roomError) {
    await supabaseClient.from("users").update({
      points: state.profile.points || 0,
      rank: state.profile.rank || getRankLabel(state.profile.points || 0),
      updated_at: nowIso()
    }).eq("id", state.userId);
    showToast("تعذر إنشاء الغرفة", "error");
    return;
  }

  await loadProfile();
  await refreshPublicRooms();
  await subscribeToRoom(roomId);
  openModal(roomId);
  showToast(`تم إنشاء الـ Arena وخصم ${ROOM_ENTRY_COST} نقطة`, "success");
}

async function fetchRoom(roomId) {
  const { data, error } = await supabaseClient.from("rooms").select("*").eq("room_id", roomId).maybeSingle();
  if (error) throw error;
  return roomFromRow(data);
}

async function joinRoom(roomIdFromPublic) {
  if (!state.profile) return;
  if (state.currentRoomId) {
    showToast("اخرج من الغرفة الحالية أولاً", "warning");
    return;
  }

  const roomId = String(roomIdFromPublic || qs("roomIdInput").value || "").trim().toUpperCase();
  if (!roomId) {
    showToast("أدخل Room Code", "error");
    return;
  }

  let room;
  try {
    room = await fetchRoom(roomId);
  } catch {
    room = null;
  }

  if (!room) {
    showToast("الغرفة غير موجودة", "error");
    return;
  }

  const joinCost = room.entryCost || ROOM_ENTRY_COST;
  if (room.player2Id && room.player2Id !== state.userId) {
    showToast("الغرفة ممتلئة", "warning");
    return;
  }
  if ((state.profile.points || 0) < joinCost) {
    showToast(`تحتاج ${joinCost} نقطة على الأقل للدخول`, "warning");
    return;
  }

  const nextPoints = (state.profile.points || 0) - joinCost;
  const { error: userError } = await supabaseClient.from("users").update({
    points: nextPoints,
    rank: getRankLabel(nextPoints),
    updated_at: nowIso()
  }).eq("id", state.userId);
  if (userError) {
    showToast("تعذر خصم نقاط الدخول", "error");
    return;
  }

  const { error: roomError } = await supabaseClient.from("rooms").update({
    player2_id: state.userId,
    player2_name: state.profile.display_name,
    status: "playing",
    round_active: true,
    round_deadline: Date.now() + ((room.timerSeconds || 10) * 1000),
    round_meta_text: "الجولة بدأت",
    updated_at: nowIso()
  }).eq("room_id", roomId);

  if (roomError) {
    await supabaseClient.from("users").update({
      points: state.profile.points || 0,
      rank: state.profile.rank || getRankLabel(state.profile.points || 0),
      updated_at: nowIso()
    }).eq("id", state.userId);
    showToast("تعذر الانضمام إلى الغرفة", "error");
    return;
  }

  qs("roomIdInput").value = "";
  await loadProfile();
  await refreshPublicRooms();
  await subscribeToRoom(roomId);
  showToast(`تم الانضمام إلى الـ Arena وخصم ${joinCost} نقطة`, "success");
}

async function refreshPublicRooms() {
  const { data, error } = await supabaseClient
    .from("rooms")
    .select("*")
    .eq("visibility", "public")
    .is("player2_id", null)
    .neq("host_id", state.userId);

  if (error) return;
  renderPublicRooms((data || []).map(roomFromRow));
}

function subscribePublicRooms() {
  if (state.publicRoomsChannel) {
    supabaseClient.removeChannel(state.publicRoomsChannel);
  }

  state.publicRoomsChannel = supabaseClient
    .channel("public-rooms")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "rooms"
    }, refreshPublicRooms)
    .subscribe();
}

function renderPublicRooms(rooms) {
  const list = qs("publicRoomsList");
  if (!rooms.length) {
    list.className = "list-shell empty-state";
    list.innerHTML = "لا توجد غرف عامة مفتوحة الآن.";
    return;
  }

  list.className = "list-shell";
  list.innerHTML = rooms.map((room) => `
    <div class="room-item">
      <div class="item-meta">
        <strong>${escapeHtml(room.hostName)}</strong>
        <span>${room.roundsToWin} جولات • ${room.timerSeconds}s • دخول ${room.entryCost || ROOM_ENTRY_COST} نقطة • ${escapeHtml(room.roomId)}</span>
      </div>
      <button onclick="joinRoom('${room.roomId}')">انضمام</button>
    </div>
  `).join("");
}

function clearRoomSubscriptions() {
  if (state.roomChannel) supabaseClient.removeChannel(state.roomChannel);
  if (state.reactionsChannel) supabaseClient.removeChannel(state.reactionsChannel);
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.roomChannel = null;
  state.reactionsChannel = null;
  state.timerInterval = null;
  state.battleSignature = "";
  state.resolvingSignature = "";
  state.awardingRoomId = "";
  state.notifiedJoinSignature = "";
}

async function subscribeToRoom(roomId) {
  clearRoomSubscriptions();
  state.currentRoomId = roomId;
  state.roomData = await fetchRoom(roomId);
  setView("arena");
  qs("summaryPanel").style.display = "none";
  renderRoom(state.roomData);
  syncParticipationRecovery();
  watchRoundTimer(state.roomData);

  state.roomChannel = supabaseClient
    .channel(`room-${roomId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "rooms",
      filter: `room_id=eq.${roomId}`
    }, async () => {
      const previousRoom = state.roomData;
      const room = await fetchRoom(roomId);
      if (!room) {
        showToast("تم إغلاق الغرفة", "info");
        resetArenaUi();
        return;
      }

      const joinSignature = `${room.roomId}:${room.player2Id || ""}`;
      const playerJoinedNow = previousRoom && !previousRoom.player2Id && room.player2Id && room.player2Id !== state.userId;
      if (playerJoinedNow && state.notifiedJoinSignature !== joinSignature) {
        state.notifiedJoinSignature = joinSignature;
        showToast(`اللاعب ${room.player2Name || "مجهول"} دخل الغرفة`, "info", {
          title: "دخول لاعب جديد",
          duration: 5600
        });
      }

      state.roomData = room;
      renderRoom(room);
      syncParticipationRecovery();
      watchRoundTimer(room);

      const resolveKey = `${room.roundNumber}-${room.player1Choice}-${room.player2Choice}-${room.roundDeadline}`;
      if (room.hostId === state.userId && room.roundActive && shouldAutoResolve(room) && state.resolvingSignature !== resolveKey) {
        state.resolvingSignature = resolveKey;
        await handleRoundTimeout(room);
        return;
      }

      if (room.hostId === state.userId && room.roundActive && room.player1Choice && room.player2Choice && state.resolvingSignature !== resolveKey) {
        state.resolvingSignature = resolveKey;
        await resolveRound(room);
      }

      if (room.hostId === state.userId && room.status === "finished" && room.championId && !room.pointsAwarded && state.awardingRoomId !== room.roomId) {
        state.awardingRoomId = room.roomId;
        await awardMatchPoints(room);
      }
    })
    .subscribe();

  state.reactionsChannel = supabaseClient
    .channel(`reactions-${roomId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "room_reactions",
      filter: `room_id=eq.${roomId}`
    }, async () => {
      const { data } = await supabaseClient.from("room_reactions").select("*").eq("room_id", roomId);
      (data || []).forEach(triggerReactionAnim);
    })
    .subscribe();
}

function resetArenaUi() {
  clearRoomSubscriptions();
  state.currentRoomId = "";
  state.roomData = null;
  setView("dashboard");
  qs("roomStatusText").innerText = "لا توجد غرفة نشطة";
  qs("activeRoomCode").innerText = "-";
  qs("arenaRoomCode").innerText = "-";
  qs("roundTimerText").innerText = "--";
  qs("result").innerText = "ابدأ الجولة";
  qs("roundMetaText").innerText = "اختر حركتك قبل انتهاء الوقت.";
  qs("summaryPanel").style.display = "none";
  qs("playAgainBtn").style.display = "none";
  resetBattleVisuals();
  syncParticipationRecovery();
}

function getPlayerRole(room) {
  if (!room) return "";
  if (room.player1Id === state.userId) return "player1";
  if (room.player2Id === state.userId) return "player2";
  return "";
}

function getChoiceStatusText(room, role) {
  const choice = room[`${role}Choice`];
  if (!room.player2Id) return "بانتظار لاعب ثان";
  if (!choice) return role === getPlayerRole(room) ? "لم تختر بعد" : "بانتظار الاختيار";
  if (room.player1Choice && room.player2Choice) return choice;
  return role === getPlayerRole(room) ? "تم تثبيت اختيارك" : "اختياره مخفي";
}

function renderRoom(room) {
  if (!room) return;

  qs("roomStatusText").innerText = room.status === "finished" ? "انتهت المباراة" : room.visibility === "public" ? "غرفة عامة" : "غرفة خاصة";
  qs("activeRoomCode").innerText = room.roomId || "-";
  qs("arenaRoomCode").innerText = room.roomId || "-";
  qs("matchHeadline").innerText = room.championName ? `الفائز: ${room.championName}` : `${room.player1Name || "Player 1"} vs ${room.player2Name || "Waiting..."}`;

  qs("name1").innerText = room.player1Name || "Player 1";
  qs("name2").innerText = room.player2Name || "Waiting...";
  qs("score1").innerText = room.score1 || 0;
  qs("score2").innerText = room.score2 || 0;
  qs("choice1").innerText = getChoiceStatusText(room, "player1");
  qs("choice2").innerText = getChoiceStatusText(room, "player2");
  qs("result").innerText = room.resultText || "ابدأ الجولة";
  qs("roundMetaText").innerText = room.roundMetaText || "اختر حركتك قبل انتهاء الوقت.";

  if (!room.player2Id) {
    updateStatusBar("الغرفة جاهزة، بانتظار الخصم");
  } else if (room.status === "finished") {
    updateStatusBar(room.resultText || "انتهت المباراة");
  } else if (room.player1Choice && room.player2Choice) {
    updateStatusBar("تم اختيار الطرفين، جاري الحسم");
  } else {
    updateStatusBar("اختيارات اللاعبين مخفية حتى يكتمل الطرفان");
  }

  if (!(room.player1Choice && room.player2Choice)) {
    resetBattleVisuals();
    state.battleSignature = "";
  }

  const battleSignature = `${room.roundNumber}-${room.player1Choice}-${room.player2Choice}-${room.resultText}`;
  if (room.player1Choice && room.player2Choice && room.resultText && state.battleSignature !== battleSignature) {
    state.battleSignature = battleSignature;
    startBattleAnimation(room.player1Choice, room.player2Choice, room);
  }

  renderSummaryCard(room.summary, room);
  const canReset = room.status === "finished" && room.player1Id === state.userId;
  qs("playAgainBtn").style.display = canReset ? "inline-flex" : "none";
}

function resetBattleVisuals() {
  qs("battleArea").style.display = "none";
  qs("leftHand").className = "hand";
  qs("rightHand").className = "hand";
  qs("leftHand").innerText = "✊";
  qs("rightHand").innerText = "✊";
}

function getEmoji(choice) {
  if (choice === "Rock") return "✊";
  if (choice === "Paper") return "✋";
  if (choice === "Scissors") return "✌️";
  return "❔";
}

function startBattleAnimation(choice1, choice2, room) {
  qs("battleArea").style.display = "flex";
  qs("leftHand").innerText = "✊";
  qs("rightHand").innerText = "✊";
  qs("leftHand").className = "hand animate-hand";
  qs("rightHand").className = "hand animate-hand";

  setTimeout(() => {
    qs("leftHand").className = "hand";
    qs("rightHand").className = "hand";
    qs("leftHand").innerText = getEmoji(choice2);
    qs("rightHand").innerText = getEmoji(choice1);

    if (room.resultText.includes("تعادل")) {
      qs("leftHand").classList.add("draw");
      qs("rightHand").classList.add("draw");
    } else if (room.resultText.includes(room.player1Name) || room.championId === room.player1Id) {
      qs("rightHand").classList.add("winner");
      qs("leftHand").classList.add("loser");
    } else {
      qs("leftHand").classList.add("winner");
      qs("rightHand").classList.add("loser");
    }
  }, 900);
}

function determineRound(room) {
  const p1 = room.player1Choice;
  const p2 = room.player2Choice;
  if (p1 === p2) {
    return { winner: "", resultText: "تعادل في هذه الجولة" };
  }

  const player1Wins =
    (p1 === "Rock" && p2 === "Scissors") ||
    (p1 === "Paper" && p2 === "Rock") ||
    (p1 === "Scissors" && p2 === "Paper");

  return player1Wins
    ? { winner: "player1", resultText: `${room.player1Name} فاز بالجولة` }
    : { winner: "player2", resultText: `${room.player2Name} فاز بالجولة` };
}

function shouldAutoResolve(room) {
  const someoneMissingChoice = !room.player1Choice || !room.player2Choice;
  return room.roundDeadline && Date.now() >= room.roundDeadline && !!room.player2Id && someoneMissingChoice;
}

async function handleRoundTimeout(room) {
  const updates = {};
  if (!room.player1Choice) {
    updates.player1_choice = randomChoice();
    updates.player1_auto = true;
  }
  if (!room.player2Choice) {
    updates.player2_choice = randomChoice();
    updates.player2_auto = true;
  }
  updates.round_meta_text = "انتهى الوقت وتم اختيار حركة تلقائية للطرف المتأخر";
  updates.updated_at = nowIso();

  await supabaseClient.from("rooms").update(updates).eq("room_id", room.roomId);
}

async function resolveRound(room) {
  const round = determineRound(room);
  let score1 = room.score1 || 0;
  let score2 = room.score2 || 0;
  if (round.winner === "player1") score1 += 1;
  if (round.winner === "player2") score2 += 1;

  let status = "playing";
  let championId = null;
  let championName = null;
  let resultText = round.resultText;
  let roundMetaText = `الجولة ${room.roundNumber} انتهت`;

  if (score1 >= room.roundsToWin) {
    status = "finished";
    championId = room.player1Id;
    championName = room.player1Name;
    resultText = `${room.player1Name} ربح المباراة`;
    roundMetaText = "انتهت المباراة";
  } else if (score2 >= room.roundsToWin) {
    status = "finished";
    championId = room.player2Id;
    championName = room.player2Name;
    resultText = `${room.player2Name} ربح المباراة`;
    roundMetaText = "انتهت المباراة";
  }

  await supabaseClient.from("rooms").update({
    score1,
    score2,
    status,
    champion_id: championId,
    champion_name: championName,
    result_text: resultText,
    round_meta_text: roundMetaText,
    round_active: false,
    updated_at: nowIso()
  }).eq("room_id", room.roomId);

  if (status !== "finished") {
    setTimeout(async () => {
      await supabaseClient.from("rooms").update({
        player1_choice: "",
        player2_choice: "",
        player1_auto: false,
        player2_auto: false,
        round_number: (room.roundNumber || 1) + 1,
        round_deadline: Date.now() + ((room.timerSeconds || 10) * 1000),
        round_meta_text: "جولة جديدة بدأت",
        result_text: "",
        round_active: true,
        updated_at: nowIso()
      }).eq("room_id", room.roomId);
    }, 2800);
  }
}

async function awardMatchPoints(room) {
  if (!room.championId || !room.player1Id || !room.player2Id) return;

  const loserId = room.championId === room.player1Id ? room.player2Id : room.player1Id;
  const winner = await fetchUser(room.championId);
  const loser = await fetchUser(loserId);
  if (!winner || !loser) return;

  const entryCost = room.entryCost || ROOM_ENTRY_COST;
  const roundsReward = (room.roundsToWin || 1) * 10;
  const winnerReward = entryCost + entryCost + roundsReward;
  const loserPenalty = Math.max(6, (room.roundsToWin || 1) * 4);

  const winnerBeforePoints = winner.points || 0;
  const loserBeforePoints = loser.points || 0;
  const winnerAfterPoints = winnerBeforePoints + winnerReward;
  const loserAfterPoints = Math.max(0, loserBeforePoints - loserPenalty);
  const loserDelta = loserAfterPoints - loserBeforePoints;
  const winnerBeforeRank = winner.rank || getRankLabel(winnerBeforePoints);
  const loserBeforeRank = loser.rank || getRankLabel(loserBeforePoints);
  const winnerAfterRank = getRankLabel(winnerAfterPoints);
  const loserAfterRank = getRankLabel(loserAfterPoints);

  const summary = {
    winnerId: room.championId,
    winnerName: room.championName,
    loserId,
    loserName: loserId === room.player1Id ? room.player1Name : room.player2Name,
    winnerPointsBefore: winnerBeforePoints,
    winnerPointsAfter: winnerAfterPoints,
    loserPointsBefore: loserBeforePoints,
    loserPointsAfter: loserAfterPoints,
    winnerPointsDelta: winnerReward,
    loserPointsDelta: loserDelta,
    winnerRankFrom: winnerBeforeRank,
    winnerRankTo: winnerAfterRank,
    loserRankFrom: loserBeforeRank,
    loserRankTo: loserAfterRank,
    roundsBonus: roundsReward,
    entryCost,
    createdAt: Date.now()
  };

  await supabaseClient.from("users").update({
    points: winnerAfterPoints,
    wins: (winner.wins || 0) + 1,
    rank: winnerAfterRank,
    updated_at: nowIso()
  }).eq("id", room.championId);

  await supabaseClient.from("users").update({
    points: loserAfterPoints,
    losses: (loser.losses || 0) + 1,
    rank: loserAfterRank,
    updated_at: nowIso()
  }).eq("id", loserId);

  await supabaseClient.from("rooms").update({
    points_awarded: true,
    summary
  }).eq("room_id", room.roomId);

  await loadProfile();
  await refreshLeaderboard();
}

function renderSummary(summary, room) {
  if (!summary || room.status !== "finished") {
    qs("summaryPanel").style.display = "none";
    return;
  }

  recordRecentMatch(summary);
  qs("summaryPanel").style.display = "block";
  const isWinner = summary.winnerId === state.userId;
  const pointsDelta = isWinner ? `+${summary.winnerPointsDelta}` : `${summary.loserPointsDelta}`;
  const rankFrom = isWinner ? summary.winnerRankFrom : summary.loserRankFrom;
  const rankTo = isWinner ? summary.winnerRankTo : summary.loserRankTo;
  const rankDelta = rankFrom === rankTo ? "No Change" : `${rankFrom} → ${rankTo}`;

  qs("summaryTitle").innerText = isWinner ? "فزت بالمواجهة" : "انتهت المواجهة";
  qs("summaryPointsDelta").innerText = pointsDelta;
  qs("summaryRankDelta").innerText = rankDelta;
  qs("summaryWinner").innerText = summary.winnerName || "-";
  qs("summaryLoser").innerText = summary.loserName || "-";
}

function renderSummaryCard(summary, room) {
  if (!summary || room.status !== "finished") {
    qs("summaryPanel").style.display = "none";
    return;
  }

  recordRecentMatch(summary);
  qs("summaryPanel").style.display = "block";

  const isWinner = summary.winnerId === state.userId;
  const pointsBefore = isWinner ? summary.winnerPointsBefore : summary.loserPointsBefore;
  const pointsAfter = isWinner ? summary.winnerPointsAfter : summary.loserPointsAfter;
  const pointsDeltaValue = pointsAfter - pointsBefore;
  const pointsDelta = `${pointsDeltaValue > 0 ? "+" : ""}${pointsDeltaValue}`;
  const rankFrom = isWinner ? summary.winnerRankFrom : summary.loserRankFrom;
  const rankTo = isWinner ? summary.winnerRankTo : summary.loserRankTo;
  const rankDelta = rankFrom === rankTo ? "No Change" : `${rankFrom} → ${rankTo}`;
  const rankProgress = getRankProgressData(pointsAfter);
  const pointMax = Math.max(pointsBefore, pointsAfter, 1);
  const beforeWidth = `${clamp((pointsBefore / pointMax) * 100, 0, 100)}%`;
  const afterWidth = `${clamp((pointsAfter / pointMax) * 100, 0, 100)}%`;
  const beforeRankIndex = RANK_TIERS.findIndex((tier) => tier.label === rankFrom);
  const afterRankIndex = RANK_TIERS.findIndex((tier) => tier.label === rankTo);
  const pointsState = pointsDeltaValue > 0 ? "increase" : pointsDeltaValue < 0 ? "decrease" : "neutral";
  const rankState = afterRankIndex > beforeRankIndex ? "increase" : afterRankIndex < beforeRankIndex ? "decrease" : "neutral";

  qs("summaryTitle").innerText = isWinner ? "فزت بالمواجهة" : "انتهت المواجهة";
  qs("summaryPointsDelta").innerText = pointsDelta;
  qs("summaryRankDelta").innerText = rankDelta;
  qs("summaryWinner").innerText = summary.winnerName || "-";
  qs("summaryLoser").innerText = summary.loserName || "-";

  qs("summaryPointsRange").innerText = `${pointsBefore} → ${pointsAfter}`;
  qs("summaryPointsMeta").innerText = pointsDeltaValue > 0 ? `كسبت ${pointsDeltaValue} نقطة في هذه المباراة.` : pointsDeltaValue < 0 ? `خسرت ${Math.abs(pointsDeltaValue)} نقطة في هذه المباراة.` : "لم تتغير نقاطك بعد هذه المباراة.";
  qs("summaryPointsState").className = `summary-state-pill ${pointsState}`;
  qs("summaryPointsState").innerText = pointsState === "increase" ? "Points Up" : pointsState === "decrease" ? "Points Down" : "Stable";
  qs("summaryPointsProgressFill").style.width = afterWidth;
  qs("summaryPointsBeforeMarker").style.insetInlineStart = beforeWidth;
  qs("summaryPointsAfterMarker").style.insetInlineStart = afterWidth;

  qs("summaryRankCurrentBadge").innerHTML = getRankBadgeMarkup(rankTo);
  qs("summaryRankNextBadge").innerHTML = getRankBadgeMarkup(rankProgress.next.label);
  qs("summaryRankStatus").innerText = `${rankFrom} → ${rankTo}`;
  qs("summaryRankProgressMeta").innerText = rankProgress.text;
  qs("summaryRankProgressFill").style.width = `${rankProgress.progress}%`;
  qs("summaryRankState").className = `summary-state-pill ${rankState}`;
  qs("summaryRankState").innerText = rankState === "increase" ? "Rank Up" : rankState === "decrease" ? "Rank Down" : "No Change";
}

async function play(choice) {
  if (!state.roomData || !state.currentRoomId) {
    showToast("ادخل Arena أولاً", "warning");
    return;
  }
  if (!state.roomData.player2Id) {
    showToast("بانتظار الخصم", "warning");
    return;
  }
  if (state.roomData.status === "finished") {
    showToast("المباراة انتهت", "info");
    return;
  }

  const role = getPlayerRole(state.roomData);
  const choiceKey = role === "player1" ? "player1_choice" : "player2_choice";
  const autoKey = role === "player1" ? "player1_auto" : "player2_auto";
  if (!role) {
    showToast("أنت لست ضمن هذه الغرفة", "error");
    return;
  }
  if (state.roomData[role === "player1" ? "player1Choice" : "player2Choice"]) {
    showToast("تم تثبيت اختيارك بالفعل", "info");
    return;
  }

  await supabaseClient.from("rooms").update({
    [choiceKey]: choice,
    [autoKey]: false,
    round_meta_text: "تم تثبيت أحد الاختيارات",
    updated_at: nowIso()
  }).eq("room_id", state.currentRoomId);
}

async function sendReaction(emoji) {
  if (!state.currentRoomId) return;
  triggerReactionAnim({
    user_id: state.userId,
    emoji,
    created_at: Date.now(),
    local: true
  });
  state.localReactionEchoes[`${state.userId}:${emoji}`] = Date.now();
  await supabaseClient.from("room_reactions").upsert({
    room_id: state.currentRoomId,
    user_id: state.userId,
    emoji,
    created_at: Date.now()
  });
}

function triggerReactionAnim(row) {
  if (!row || !state.roomData || Date.now() - row.created_at > 5000) return;
  const echoKey = `${row.user_id}:${row.emoji}`;
  const echoAt = state.localReactionEchoes[echoKey];
  if (!row.local && echoAt && Date.now() - echoAt < 2000) {
    delete state.localReactionEchoes[echoKey];
    return;
  }

  const target = row.user_id === state.roomData.player2Id ? "reaction2" : "reaction1";
  const el = qs(target);
  if (!el) return;
  el.innerText = row.emoji;
  el.className = "floating-reaction";
  void el.offsetWidth;
  el.classList.add("animate-reaction");
  clearTimeout(el._reactionTimeout);
  el._reactionTimeout = setTimeout(() => {
    el.className = "floating-reaction";
    el.innerText = "";
  }, 1400);
}

function watchRoundTimer(room) {
  if (state.timerInterval) clearInterval(state.timerInterval);

  const updateTimer = () => {
    if (!room.roundDeadline || room.status === "finished" || !room.player2Id) {
      qs("roundTimerText").innerText = "--";
      return;
    }
    const left = Math.max(0, Math.ceil((room.roundDeadline - Date.now()) / 1000));
    qs("roundTimerText").innerText = `${left}s`;
  };

  updateTimer();
  state.timerInterval = setInterval(updateTimer, 300);
}

function isMatchNotStarted(room) {
  return (
    (room.score1 || 0) === 0 &&
    (room.score2 || 0) === 0 &&
    (room.roundNumber || 1) === 1 &&
    !room.player1Choice &&
    !room.player2Choice
  );
}

async function leaveRoom() {
  if (!state.currentRoomId || !state.roomData) {
    resetArenaUi();
    return;
  }

  const room = state.roomData;
  const entryCost = room.entryCost || ROOM_ENTRY_COST;
  const matchNotStarted = isMatchNotStarted(room);

  if (room.hostId === state.userId) {
    if (matchNotStarted) {
      const host = await fetchUser(room.player1Id);
      if (host) {
        const refunded = (host.points || 0) + entryCost;
        await supabaseClient.from("users").update({
          points: refunded,
          rank: getRankLabel(refunded),
          updated_at: nowIso()
        }).eq("id", room.player1Id);
      }
      if (room.player2Id) {
        const guest = await fetchUser(room.player2Id);
        if (guest) {
          const refunded = (guest.points || 0) + entryCost;
          await supabaseClient.from("users").update({
            points: refunded,
            rank: getRankLabel(refunded),
            updated_at: nowIso()
          }).eq("id", room.player2Id);
        }
      }
    }
    await supabaseClient.from("rooms").delete().eq("room_id", state.currentRoomId);
  } else {
    if (matchNotStarted) {
      const refunded = (state.profile?.points || 0) + entryCost;
      await supabaseClient.from("users").update({
        points: refunded,
        rank: getRankLabel(refunded),
        updated_at: nowIso()
      }).eq("id", state.userId);
    }

    await supabaseClient.from("rooms").update({
      player2_id: null,
      player2_name: null,
      player1_choice: "",
      player2_choice: "",
      player1_auto: false,
      player2_auto: false,
      score1: 0,
      score2: 0,
      round_number: 1,
      round_deadline: Date.now() + ((room.timerSeconds || 10) * 1000),
      round_active: true,
      result_text: "",
      round_meta_text: "عاد المضيف إلى وضع الانتظار",
      champion_id: null,
      champion_name: null,
      points_awarded: false,
      summary: null,
      status: "waiting",
      updated_at: nowIso()
    }).eq("room_id", state.currentRoomId);
  }

  await loadProfile();
  await refreshPublicRooms();
  resetArenaUi();
  showToast(matchNotStarted ? `تم الخروج من الـ Arena واسترجاع ${entryCost} نقطة` : "تم الخروج من الـ Arena", "info");
}

async function resetMatch() {
  if (!state.roomData || state.roomData.player1Id !== state.userId) {
    showToast("فقط صاحب الغرفة يستطيع إعادة المباراة", "warning");
    return;
  }

  await supabaseClient.from("rooms").update({
    player1_choice: "",
    player2_choice: "",
    player1_auto: false,
    player2_auto: false,
    score1: 0,
    score2: 0,
    round_number: 1,
    round_deadline: Date.now() + ((state.roomData.timerSeconds || 10) * 1000),
    round_active: true,
    result_text: "",
    round_meta_text: "بدأت مباراة جديدة",
    champion_id: null,
    champion_name: null,
    points_awarded: false,
    summary: null,
    status: state.roomData.player2Id ? "playing" : "waiting",
    updated_at: nowIso()
  }).eq("room_id", state.currentRoomId);

  qs("summaryPanel").style.display = "none";
  showToast("تمت إعادة المباراة", "success");
}

function openModal(roomId) {
  qs("roomModal").style.display = "flex";
  qs("roomCodeText").innerText = roomId;
  qs("qrcode").innerHTML = "";
  const isDarkTheme = document.documentElement.getAttribute("data-theme") === "dark";
  new QRCode(qs("qrcode"), {
    text: roomId,
    width: 132,
    height: 132,
    colorDark: isDarkTheme ? "#f4f4f4" : "#111111",
    colorLight: isDarkTheme ? "#0d0a0b" : "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

function closeModal() {
  qs("roomModal").style.display = "none";
}

function copyRoomCode() {
  const code = qs("roomCodeText").innerText;
  navigator.clipboard.writeText(code);
  showToast("تم نسخ كود الغرفة", "success");
}

async function bootstrap() {
  initTheme();
  setupLandingContent();
  setupPasswordUi();
  setAuthMode("login");
  applyAuthPrefs();
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      setLandingVisible(false);
      setSetupVisible(true);
      setAuthMode("login");
      setRecoveryVisible(true);
      showToast("أدخل كلمة المرور الجديدة لإكمال الاستعادة", "info");
      return;
    }

    if (event === "SIGNED_OUT" || !session?.user) {
      stopParticipationRecovery();
      clearRoomSubscriptions();
      if (state.profileChannel) supabaseClient.removeChannel(state.profileChannel);
      if (state.friendsChannel) supabaseClient.removeChannel(state.friendsChannel);
      if (state.requestsChannel) supabaseClient.removeChannel(state.requestsChannel);
      if (state.publicRoomsChannel) supabaseClient.removeChannel(state.publicRoomsChannel);
      state.profileChannel = null;
      state.friendsChannel = null;
      state.requestsChannel = null;
      state.publicRoomsChannel = null;
      state.userId = "";
      state.profile = null;
      state.friends = {};
      state.requests = {};
      qs("emailInput").value = "";
      qs("passwordInput").value = "";
      setAuthMode("login");
      setLandingVisible(true);
      setSetupVisible(false);
      setView("dashboard");
      return;
    }
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  const session = data.session;
  if (!session?.user) {
    setLandingVisible(true);
    setSetupVisible(false);
    return;
  }

  await ensureProfileForSession(session.user);
  await afterAuthenticated();
}

window.addEventListener("beforeunload", async () => {
  if (state.profile && state.userId) {
    await supabaseClient.from("users").update({ last_seen: nowIso() }).eq("id", state.userId);
  }
});

document.addEventListener("click", (event) => {
  const panel = qs("rankOverviewModal");
  if (!panel || panel.style.display === "none" || !panel.style.display) return;
  if (event.target === panel) {
    closeRankOverview();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRankOverview();
  }
});

window.setAuthMode = setAuthMode;
window.openAuthScreen = openAuthScreen;
window.submitAuth = submitAuth;
window.copyFriendCode = copyFriendCode;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.rejectFriendRequest = rejectFriendRequest;
window.removeFriend = removeFriend;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.play = play;
window.sendReaction = sendReaction;
window.resetMatch = resetMatch;
window.logout = logout;
window.closeModal = closeModal;
window.copyRoomCode = copyRoomCode;
window.toggleTheme = toggleTheme;
window.toggleRankOverview = toggleRankOverview;
window.closeRankOverview = closeRankOverview;
window.requestPasswordReset = requestPasswordReset;
window.updatePasswordFromRecovery = updatePasswordFromRecovery;
window.changePassword = changePassword;

bootstrap().catch((error) => {
  console.error("bootstrap failed:", error);
  showToast(`فشل الاتصال بـ Supabase: ${error.message || "Unknown error"}`, "error");
});
