      /* ============================================================
   STORAGE
============================================================ */
      const DB_KEY_PREFIX = "balhadj_farm_v2";
      const LEGACY_DB_KEY = "balhadj_farm_v1";
      const LEGACY_UNSCOPED_DB_KEY = "balhadj_farm_v2";
      const BACKUP_INDEX_KEY_PREFIX = "balhadj_farm_v2_backups";
      const ACCOUNT_REGISTRY_KEY = "balhadj_farm_accounts";
      const ACTIVE_ACCOUNT_KEY = "balhadj_farm_active_account";
      const MAX_BACKUPS = 8;
      const APP_VERSION = "20260511-production-readiness";
      const RUNTIME_CONFIG = window.__FARM_RUNTIME_CONFIG__ || {};
      const API_BASE = String(
        RUNTIME_CONFIG.apiBaseUrl ||
          (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
            ? "http://127.0.0.1:8787/api"
            : `${window.location.origin}/api`),
      ).replace(/\/$/, "");
      const WEB_BASE_URL = String(
        RUNTIME_CONFIG.webBaseUrl || window.location.origin,
      ).replace(/\/$/, "");
      const SUPPORT_EMAIL = String(RUNTIME_CONFIG.supportEmail || "support@example.com").trim();
      const AUTH_TOKEN_KEY = "balhadj_farm_auth_token";
      const UI_THEME_MODE_KEY = "balhadj_ui_theme_mode";
      const THEME_MODE_LABELS = {
        system: "تلقائي",
        dark: "ليلي",
        light: "نهاري",
      };
      const THEME_MODE_SEQUENCE = ["system", "dark", "light"];
      let authServiceHealthy = null;
      let systemThemeMediaQuery = null;
      const ROLE_OPTIONS = {
        manager: "مدير النظام",
        worker: "عامل المزرعة",
        accountant: "المحاسب",
        healthSupervisor: "المشرف الصحي",
      };
      const ROLE_PERMISSIONS = {
        manager: ["dashboard", "flock", "production", "feed", "incubation", "health", "financials", "care", "product", "settings"],
        worker: ["dashboard", "flock", "production", "feed", "incubation", "care"],
        accountant: ["dashboard", "financials", "product", "settings"],
        healthSupervisor: ["dashboard", "health", "care", "incubation", "settings"],
      };
      const PRODUCT_PLANS = [
        {
          id: "monthly",
          name: "اشتراك شهري",
          price: 3500,
          cadence: "شهري",
          highlight: "أفضل بداية لتجربة السوق المحلي",
          badgeClass: "badge-green",
        },
        {
          id: "annual",
          name: "اشتراك سنوي",
          price: 36000,
          cadence: "سنوي",
          highlight: "أعلى استقرار وأفضل نقدية سنوية",
          badgeClass: "badge-cyan",
        },
        {
          id: "lifetime",
          name: "شراء مدى الحياة",
          price: 95000,
          cadence: "مرة واحدة",
          highlight: "مناسب للمربين التقليديين الذين يفضلون دفعة واحدة",
          badgeClass: "badge-amber",
        },
      ];
      let deferredInstallPrompt = null;
      let bootNotice = "";
      let currentAccount = null;
      let syncTimer = null;
      let isHydratingRemoteState = false;
      let authViewMode = "login";
      let pendingPasswordResetToken = "";

      function simpleHash(value) {
        const input = String(value || "");
        let hash = 2166136261;
        for (let i = 0; i < input.length; i++) {
          hash ^= input.charCodeAt(i);
          hash +=
            (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (`0000000${(hash >>> 0).toString(16)}`).slice(-8);
      }

      function getAccounts() {
        return ensureArray(safeParse(localStorage.getItem(ACCOUNT_REGISTRY_KEY), []));
      }

      function setAccounts(accounts) {
        localStorage.setItem(ACCOUNT_REGISTRY_KEY, JSON.stringify(accounts));
      }

      function getActiveAccountId() {
        const value = localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "";
        return value.startsWith("SES-") ? "" : value;
      }

      function setActiveAccountId(accountId) {
        if (accountId) localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
        else localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      }

      function cleanupBrokenSessionScopedStorage() {
        Object.keys(localStorage).forEach((key) => {
          if (
            key.startsWith(`${DB_KEY_PREFIX}:SES-`) ||
            key.startsWith(`${BACKUP_INDEX_KEY_PREFIX}:SES-`)
          ) {
            localStorage.removeItem(key);
          }
        });
        const activeAccountId = localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "";
        if (activeAccountId.startsWith("SES-")) {
          localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        }
      }

      function getAuthToken() {
        return localStorage.getItem(AUTH_TOKEN_KEY) || "";
      }

      function setAuthToken(token) {
        if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
      }

      function normalizeThemeMode(mode) {
        return THEME_MODE_SEQUENCE.includes(mode) ? mode : "system";
      }

      function getSavedThemeMode() {
        return normalizeThemeMode(localStorage.getItem(UI_THEME_MODE_KEY) || "system");
      }

      function getThemeMode() {
        return normalizeThemeMode(
          document.documentElement.getAttribute("data-theme-mode") || getSavedThemeMode(),
        );
      }

      function resolveAppliedTheme(mode = getSavedThemeMode()) {
        if (mode === "dark" || mode === "light") return mode;
        if (window.matchMedia) {
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return "dark";
      }

      function refreshThemeControls(mode = getThemeMode(), applied = resolveAppliedTheme(mode)) {
        const label = THEME_MODE_LABELS[mode] || THEME_MODE_LABELS.system;
        ["theme-toggle-label", "auth-theme-toggle-label"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.textContent = label;
        });
        ["theme-toggle-btn", "auth-theme-toggle"].forEach((id) => {
          const btn = document.getElementById(id);
          if (!btn) return;
          btn.setAttribute("title", `المظهر الحالي: ${label}. اضغط للتبديل`);
          btn.setAttribute("aria-label", `تبديل المظهر. الوضع الحالي ${label}`);
          btn.dataset.mode = mode;
          btn.dataset.appliedTheme = applied;
        });
        const select = document.getElementById("set-theme-mode");
        if (select && select.value !== mode) select.value = mode;
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute("content", applied === "dark" ? "#07111f" : "#f4f8fc");
      }

      function applyThemeMode(mode = getSavedThemeMode(), persist = false) {
        const normalizedMode = normalizeThemeMode(mode);
        const appliedTheme = resolveAppliedTheme(normalizedMode);
        document.documentElement.setAttribute("data-theme-mode", normalizedMode);
        document.documentElement.setAttribute("data-theme", appliedTheme);
        if (persist) localStorage.setItem(UI_THEME_MODE_KEY, normalizedMode);
        refreshThemeControls(normalizedMode, appliedTheme);
        return appliedTheme;
      }

      function setThemeMode(mode, persist = true, syncState = true) {
        const normalizedMode = normalizeThemeMode(mode);
        applyThemeMode(normalizedMode, persist);
        if (S?.settings) {
          S.settings.themeMode = normalizedMode;
          if (syncState) save();
        }
        return normalizedMode;
      }

      function cycleThemeMode() {
        const currentMode = getThemeMode();
        const index = THEME_MODE_SEQUENCE.indexOf(currentMode);
        const nextMode = THEME_MODE_SEQUENCE[(index + 1) % THEME_MODE_SEQUENCE.length];
        setThemeMode(nextMode, true, !!S);
      }

      function bindThemePreferenceListener() {
        if (!window.matchMedia) return;
        systemThemeMediaQuery = systemThemeMediaQuery || window.matchMedia("(prefers-color-scheme: dark)");
        const handleThemePreferenceChange = () => {
          if (getThemeMode() === "system") applyThemeMode("system", false);
        };
        if (typeof systemThemeMediaQuery.addEventListener === "function") {
          systemThemeMediaQuery.addEventListener("change", handleThemePreferenceChange);
        } else if (typeof systemThemeMediaQuery.addListener === "function") {
          systemThemeMediaQuery.addListener(handleThemePreferenceChange);
        }
      }

      function getScopedDbKey(accountId = getActiveAccountId()) {
        return accountId ? `${DB_KEY_PREFIX}:${accountId}` : "";
      }

      function getScopedBackupIndexKey(accountId = getActiveAccountId()) {
        return accountId ? `${BACKUP_INDEX_KEY_PREFIX}:${accountId}` : "";
      }

      function getLegacyCandidate() {
        const scopedless = safeParse(localStorage.getItem(LEGACY_UNSCOPED_DB_KEY), null);
        if (scopedless?.flock || scopedless?.production || scopedless?.feedStock) return scopedless;
        const legacy = safeParse(localStorage.getItem(LEGACY_DB_KEY), null);
        if (legacy?.flock || legacy?.production || legacy?.feedStock) return legacy;
        return buildLegacyFlatState();
      }

      function buildNetworkErrorMessage(error) {
        if (!error) return "تعذر الاتصال بخادم الحسابات الآن. تأكد أن خدمة الحسابات تعمل ثم أعد المحاولة.";
        const message = String(error.message || "").toLowerCase();
        if (
          message.includes("failed to fetch") ||
          message.includes("networkerror") ||
          message.includes("load failed")
        ) {
          return "تعذر الاتصال بخادم الحسابات الآن. يبدو أن خدمة الحسابات متوقفة أو غير قابلة للوصول.";
        }
        return error.message || "تعذر الاتصال بخادم الحسابات الآن.";
      }

      async function checkAuthService(showMessage = false) {
        try {
          await fetch(`${API_BASE}/health`, { cache: "no-store" });
          authServiceHealthy = true;
          return true;
        } catch (error) {
          authServiceHealthy = false;
          if (showMessage) {
            setAuthMessage(
              "خدمة الحسابات غير متاحة الآن. تحقق من إعدادات الخادم أو أعد المحاولة بعد قليل.",
              "warning",
            );
          }
          return false;
        }
      }

      async function apiRequest(path, options = {}) {
        const headers = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        };
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        let response;
        try {
          response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
          });
        } catch (error) {
          const wrapped = new Error(buildNetworkErrorMessage(error));
          wrapped.cause = error;
          wrapped.status = 0;
          throw wrapped;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload?.error || "فشل في الاتصال بالخادم");
          error.status = response.status;
          error.payload = payload;
          error.code = payload?.code;
          throw error;
        }
        return payload;
      }

      function safeParse(value, fallback = null) {
        try {
          return value ? JSON.parse(value) : fallback;
        } catch (error) {
          return fallback;
        }
      }

      function ensureArray(value) {
        return Array.isArray(value) ? value : [];
      }

      function ensureObject(value, fallback = {}) {
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : fallback;
      }

      function getBackupIndex() {
        const key = getScopedBackupIndexKey();
        if (!key) return [];
        return ensureArray(safeParse(localStorage.getItem(key), []));
      }

      function setBackupIndex(items) {
        const key = getScopedBackupIndexKey();
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(items));
      }

      function createBackup(payload, reason = "manual") {
        if (!payload) return;
        const stamp = new Date().toISOString();
        const key = `balhadj_farm_backup_${stamp.replace(/[:.]/g, "-")}`;
        localStorage.setItem(key, JSON.stringify(payload));
        const index = getBackupIndex();
        index.unshift({
          key,
          createdAt: stamp,
          reason,
          version: payload?.meta?.version || "unknown",
        });
        while (index.length > MAX_BACKUPS) {
          const removed = index.pop();
          if (removed?.key) localStorage.removeItem(removed.key);
        }
        setBackupIndex(index);
      }

      async function pushStateToCloud(immediate = false) {
        if (!currentAccount || !getAuthToken() || !S) return;
        if (!immediate) {
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            pushStateToCloud(true).catch((error) => {
              recordSystemError("cloud-sync", error);
            });
          }, 800);
          return;
        }
        syncTimer = null;
        try {
          await apiRequest("/state", {
            method: "PUT",
            body: JSON.stringify({ state: S }),
          });
        } catch (error) {
          recordSystemError("cloud-sync", error);
        }
      }

      function buildLegacyFlatState() {
        const birds = ensureArray(safeParse(localStorage.getItem("f_birds"), []));
        const prod = ensureArray(safeParse(localStorage.getItem("f_prod"), []));
        const stock = parseFloat(localStorage.getItem("f_stock") || "0") || 0;
        if (!birds.length && !prod.length && !stock) return null;
        return {
          meta: { version: "0.5", created: new Date().toISOString() },
          flock: birds.map((bird, index) => ({
            id: bird.id || `LEG-BIRD-${index + 1}`,
            breed: bird.breed || "بلدي",
            gender: "female",
            entry: "",
            hatchDate: "",
            ageCategory: "producing",
            weight: 0,
            pen: "",
            health: "healthy",
            notes: "",
            nickname: "",
            image: "",
            active: true,
            acquisitionType: "purchase",
            acquisitionRef: "",
            entryUnknown: true,
            breedMixDetails: "",
            exitReason: null,
            exitDate: null,
            exitNotes: "",
          })),
          production: prod.map((entry, index) => ({
            id: entry.id || `LEG-PROD-${index + 1}`,
            date: entry.date || todayStr(),
            total: entry.qty || 0,
            broken: 0,
            producingBirds: birds.length,
            notes: "تمت الترقية من نسخة قديمة",
          })),
          feedStock: stock
            ? [
                {
                  id: "LEG-FEED-1",
                  type: "علف بياض",
                  supplier: "غير محدد",
                  qty: stock,
                  balance: stock,
                  price: 0,
                  date: todayStr(),
                  expiry: "",
                  notes: "تمت الترقية من النسخة القديمة",
                  unit: "kg",
                  packageWeight: 0,
                  kgEquivalent: stock,
                },
              ]
            : [],
        };
      }

      const Store = {
        getRaw(key = getScopedDbKey()) {
          if (!key) return null;
          return safeParse(localStorage.getItem(key), null);
        },
        get() {
          return this.getRaw(getScopedDbKey());
        },
        set(data) {
          const key = getScopedDbKey();
          if (!key) return;
          localStorage.setItem(key, JSON.stringify(data));
        },
        clear() {
          const key = getScopedDbKey();
          if (!key) return;
          localStorage.removeItem(key);
        },
      };

      function findAccountByEmail(email) {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        return getAccounts().find((account) => account.email === normalizedEmail) || null;
      }

      function updateAuthUI() {
        const authShell = document.getElementById("auth-shell");
        const appShell = document.getElementById("app");
        const authName = document.getElementById("current-account-name");
        const authFarm = document.getElementById("current-farm-name");
        const authRole = document.getElementById("role-pill");
        const logoutBtn = document.getElementById("logout-btn");
        if (authShell) authShell.classList.toggle("hidden", !!currentAccount);
        if (appShell) appShell.classList.toggle("hidden", !currentAccount);
        if (authName) authName.textContent = currentAccount ? currentAccount.fullName : "ضيف";
        if (authFarm) authFarm.textContent = currentAccount ? currentAccount.farmName : "--";
        if (logoutBtn) logoutBtn.classList.toggle("hidden", !currentAccount);
        if (authRole && currentAccount) {
          authRole.textContent = `الدور: ${ROLE_OPTIONS[S?.settings?.activeRole || "manager"] || "مدير النظام"}`;
        }
      }

      function switchAuthMode(mode = "login") {
        const loginBox = document.getElementById("auth-login-panel");
        const registerBox = document.getElementById("auth-register-panel");
        const forgotBox = document.getElementById("auth-forgot-panel");
        const verifyBox = document.getElementById("auth-verify-panel");
        const resetBox = document.getElementById("auth-reset-panel");
        const loginTab = document.getElementById("auth-tab-login");
        const registerTab = document.getElementById("auth-tab-register");
        authViewMode = mode;
        const isRegister = mode === "register";
        const isLogin = mode === "login";
        const isForgot = mode === "forgot";
        const isVerify = mode === "verify";
        const isReset = mode === "reset";
        if (loginBox) loginBox.classList.toggle("hidden", !isLogin);
        if (registerBox) registerBox.classList.toggle("hidden", !isRegister);
        if (forgotBox) forgotBox.classList.toggle("hidden", !isForgot);
        if (verifyBox) verifyBox.classList.toggle("hidden", !isVerify);
        if (resetBox) resetBox.classList.toggle("hidden", !isReset);
        if (loginTab) loginTab.classList.toggle("active", isLogin);
        if (registerTab) registerTab.classList.toggle("active", isRegister);
        if (loginTab) loginTab.classList.toggle("hidden", isForgot || isVerify || isReset);
        if (registerTab) registerTab.classList.toggle("hidden", isForgot || isVerify || isReset);
      }

      function setAuthMessage(message = "", type = "info") {
        const box = document.getElementById("auth-message");
        if (!box) return;
        if (!message) {
          box.className = "hidden";
          box.textContent = "";
          return;
        }
        box.className = `auth-message auth-message-${type}`;
        box.textContent = message;
      }

      function updateAuthSupportInfo() {
        const supportEl = document.getElementById("auth-support-email");
        if (supportEl) supportEl.textContent = SUPPORT_EMAIL;
      }

      function consumeUrlToken(param) {
        const url = new URL(window.location.href);
        const value = String(url.searchParams.get(param) || "").trim();
        if (value) {
          url.searchParams.delete(param);
          window.history.replaceState({}, document.title, url.toString());
        }
        return value;
      }

      async function verifyEmailTokenFromUrl(token) {
        try {
          const payload = await apiRequest("/auth/verify-email", {
            method: "POST",
            body: JSON.stringify({ token }),
          });
          switchAuthMode("login");
          setAuthMessage(payload.message || "تم تأكيد بريدك الإلكتروني. يمكنك تسجيل الدخول الآن.", "success");
        } catch (error) {
          switchAuthMode("verify");
          setAuthMessage(error.message || "تعذر تأكيد البريد الإلكتروني بهذا الرابط.", "error");
        }
      }

      function preparePasswordResetFromUrl(token) {
        pendingPasswordResetToken = token;
        switchAuthMode("reset");
        setAuthMessage("أدخل كلمة مرور جديدة لإكمال إعادة التعيين.", "info");
      }

      async function handleAuthUrlActions() {
        const verifyToken = consumeUrlToken("verify");
        if (verifyToken) {
          await verifyEmailTokenFromUrl(verifyToken);
          return true;
        }
        const resetToken = consumeUrlToken("reset");
        if (resetToken) {
          preparePasswordResetFromUrl(resetToken);
          return true;
        }
        return false;
      }

      async function resendVerification() {
        const email = document.getElementById("verify-email")?.value.trim().toLowerCase();
        if (!email) {
          setAuthMessage("أدخل البريد الإلكتروني أولًا لإرسال رابط التحقق.", "error");
          return;
        }
        try {
          const payload = await apiRequest("/auth/resend-verification", {
            method: "POST",
            body: JSON.stringify({ email }),
          });
          setAuthMessage(payload.message || "إذا كان الحساب يحتاج تحققًا فسيصلك رابط جديد.", "success");
        } catch (error) {
          setAuthMessage(error.message || "تعذر إرسال رابط التحقق الآن.", "error");
        }
      }

      async function requestPasswordReset() {
        const email = document.getElementById("forgot-email")?.value.trim().toLowerCase();
        if (!email) {
          setAuthMessage("أدخل البريد الإلكتروني أولًا.", "error");
          return;
        }
        try {
          const payload = await apiRequest("/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email }),
          });
          setAuthMessage(payload.message || "إذا كان البريد مسجلًا فسيصلك رابط إعادة التعيين.", "success");
          switchAuthMode("login");
        } catch (error) {
          setAuthMessage(error.message || "تعذر بدء إعادة تعيين كلمة المرور.", "error");
        }
      }

      async function submitPasswordReset() {
        const password = document.getElementById("reset-password")?.value || "";
        const confirm = document.getElementById("reset-password-confirm")?.value || "";
        if (!pendingPasswordResetToken) {
          setAuthMessage("رابط إعادة التعيين غير موجود أو منتهي.", "error");
          return;
        }
        if (password.length < 6) {
          setAuthMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل.", "error");
          return;
        }
        if (password !== confirm) {
          setAuthMessage("تأكيد كلمة المرور غير مطابق.", "error");
          return;
        }
        try {
          const payload = await apiRequest("/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({ token: pendingPasswordResetToken, password }),
          });
          pendingPasswordResetToken = "";
          switchAuthMode("login");
          setAuthMessage(payload.message || "تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.", "success");
        } catch (error) {
          setAuthMessage(error.message || "تعذر تحديث كلمة المرور بهذا الرابط.", "error");
        }
      }

      function seedStateForAccount(account) {
        const hasMultipleAccounts = getAccounts().length > 1;
        const legacy = getLegacyCandidate();
        let scopedState = null;
        if (!hasMultipleAccounts && legacy) {
          createBackup(legacy, "legacy-migration");
          bootNotice = "تم ربط البيانات القديمة بأول حساب في النظام.";
          scopedState = normalizeState(legacy);
        } else {
          scopedState = defaultState();
        }
        scopedState.settings.farmName = account.farmName;
        scopedState.settings.owner = account.fullName;
        scopedState.settings.themeMode = getSavedThemeMode();
        return scopedState;
      }

      function ensureAccountState(account, reason = "fallback") {
        if (S) return;
        const scopedState = seedStateForAccount(
          account || currentAccount || { farmName: "مزرعة جديدة", fullName: "مالك المزرعة" },
        );
        scopedState.settings.farmName =
          account?.farmName || currentAccount?.farmName || scopedState.settings.farmName;
        scopedState.settings.owner =
          account?.fullName || currentAccount?.fullName || scopedState.settings.owner;
        S = normalizeState(scopedState);
        S.settings.themeMode = normalizeThemeMode(
          S.settings.themeMode || getSavedThemeMode(),
        );
        applyThemeMode(S.settings.themeMode, true);
        createBackup(S, `recovered-${reason}`);
        Store.set(S);
        document.title = `${S.settings.farmName} — نظام إدارة الدواجن`;
        updateAuthUI();
        refreshDynamicUIState();
        const brandName = document.querySelector(".brand-name");
        if (brandName) brandName.textContent = S.settings.farmName;
        updateWeatherUI();
        save();
      }

      async function bootstrapAccountSession(account) {
        currentAccount = account;
        setActiveAccountId(account.id);
        const knownAccounts = getAccounts();
        const nextAccounts = [
          account,
          ...knownAccounts.filter((item) => item.id !== account.id),
        ];
        setAccounts(nextAccounts);
        let remoteState = null;
        try {
          const payload = await apiRequest("/state");
          remoteState = payload?.state || null;
        } catch (error) {
          recordSystemError("bootstrap-state", error);
        }

        const cached = Store.get();
        const needsWrite = !Store.getRaw(getScopedDbKey(account.id));
        if (remoteState && Object.keys(remoteState).length) {
          isHydratingRemoteState = true;
          S = normalizeState(remoteState);
          Store.set(S);
          isHydratingRemoteState = false;
        } else if (cached) {
          S = normalizeState(cached);
          if (needsWrite) save();
        } else {
          S = seedStateForAccount(account);
          save();
        }
        S.settings.farmName = account.farmName || S.settings.farmName;
        S.settings.owner = account.fullName || S.settings.owner;
        S.settings.themeMode = normalizeThemeMode(
          S.settings.themeMode || getSavedThemeMode(),
        );
        applyThemeMode(S.settings.themeMode, true);
        document.title = `${S.settings.farmName} — نظام إدارة الدواجن`;
        updateAuthUI();
        refreshDynamicUIState();
        document.querySelector(".brand-name").textContent = S.settings.farmName;
        updateWeatherUI();
        save();
      }

      async function registerAccount() {
        const fullName = document.getElementById("register-full-name")?.value.trim();
        const farmName = document.getElementById("register-farm-name")?.value.trim();
        const email = document.getElementById("register-email")?.value.trim().toLowerCase();
        const password = document.getElementById("register-password")?.value || "";
        const confirmPassword = document.getElementById("register-password-confirm")?.value || "";
        if (!fullName || !farmName || !email || !password) {
          setAuthMessage("أكمل بيانات التسجيل الأساسية قبل إنشاء الحساب.", "error");
          return;
        }
        if (password.length < 6) {
          setAuthMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل.", "error");
          return;
        }
        if (password !== confirmPassword) {
          setAuthMessage("تأكيد كلمة المرور غير مطابق.", "error");
          return;
        }
        try {
          const legacy = getLegacyCandidate();
          const initialState = legacy
            ? normalizeState(legacy)
            : defaultState();
          initialState.settings.farmName = farmName;
          initialState.settings.owner = fullName;
          initialState.settings.themeMode = getSavedThemeMode();
          const payload = await apiRequest("/auth/register", {
            method: "POST",
            body: JSON.stringify({
              fullName,
              farmName,
              email,
              password,
              initialState,
            }),
          });
          if (payload.requiresVerification) {
            document.getElementById("verify-email").value = email;
            switchAuthMode("verify");
            setAuthMessage(
              payload.message || "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لإتمام التفعيل.",
              "success",
            );
            toast("تم إنشاء الحساب. تفقد بريدك الإلكتروني لإكمال التفعيل.", "info");
            return;
          }
          setAuthToken(payload.token);
          const account = payload.user;
          currentAccount = account;
          setActiveAccountId(account.id);
          await bootstrapAccountSession(account);
          ensureAccountState(account, "register");
          save();
          renderPage("dashboard");
          setAuthMessage("");
          toast(`أهلًا ${fullName}، تم إنشاء حسابك وربط مزرعتك بنجاح`, "success");
        } catch (error) {
          setAuthMessage(error.message || "تعذر إنشاء الحساب الآن.", "error");
        }
      }

      async function loginAccount() {
        const email = document.getElementById("login-email")?.value.trim().toLowerCase();
        const password = document.getElementById("login-password")?.value || "";
        if (!email || !password) {
          setAuthMessage("أدخل البريد وكلمة المرور أولًا.", "error");
          return;
        }
        try {
          const payload = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });
          setAuthToken(payload.token);
          const account = payload.user;
          await bootstrapAccountSession(account);
          ensureAccountState(account, "login");
          renderPage(currentPage || "dashboard");
          setAuthMessage("");
          toast(`مرحبًا بعودتك ${account.fullName}`, "success");
        } catch (error) {
          if (error.code === "EMAIL_NOT_VERIFIED") {
            const verifyInput = document.getElementById("verify-email");
            if (verifyInput) verifyInput.value = email;
            switchAuthMode("verify");
            setAuthMessage(error.message || "يجب تأكيد البريد الإلكتروني قبل الدخول.", "warning");
            return;
          }
          setAuthMessage(error.message || "بيانات الدخول غير صحيحة.", "error");
        }
      }

      async function logoutAccount() {
        if (!currentAccount) return;
        recordActivity("logout", `تسجيل خروج للحساب ${currentAccount.fullName}`, "auth", currentAccount.id);
        save();
        try {
          await apiRequest("/auth/logout", { method: "POST", body: JSON.stringify({}) });
        } catch (error) {
          recordSystemError("logout", error);
        }
        setAuthToken("");
        setActiveAccountId("");
        currentAccount = null;
        S = null;
        pendingPasswordResetToken = "";
        applyThemeMode(getSavedThemeMode(), false);
        updateAuthUI();
        switchAuthMode("login");
        setAuthMessage("تم تسجيل الخروج. يمكنك الدخول مجددًا أو إنشاء حساب جديد.", "info");
      }

      /* ============================================================
   DEFAULT STATE
============================================================ */
      function defaultState() {
        return {
          meta: { version: "2.0", created: new Date().toISOString() },
          settings: {
            farmName: "مزرعة بلحاج إبراهيم",
            owner: "بلحاج إبراهيم",
            eggPrice: 12,
            feedRate: 0.12,
            themeMode: "system",
            activeRole: "manager",
            lowFeedThresholdDays: 10,
            coldThreshold: 10,
            highHeatThreshold: 34,
            dailyWaterNote: "تأكد من نظافة المشارب وتبديل الماء في الحر",
            location: {
              lat: null,
              lon: null,
              city: "",
              country: "",
              enabled: false,
              updatedAt: "",
            },
            weather: {
              temperature: null,
              code: null,
              updatedAt: "",
            },
          },
          users: [
            { id: "USR-1", name: "مدير النظام", role: "manager" },
            { id: "USR-2", name: "عامل المزرعة", role: "worker" },
            { id: "USR-3", name: "المحاسب", role: "accountant" },
            { id: "USR-4", name: "المشرف الصحي", role: "healthSupervisor" },
          ],
          birdCounter: 0,
          flock: [],
          eggLogs: [],
          production: [],
          eggSales: [],
          feedStock: [],
          feedCatalog: [],
          feedPurchases: [],
          mealRecipes: [],
          healthRecords: [],
          incubations: [],
          chicks: [],
          hatchChicks: [],
          coopCleaning: [],
          sales: [],
          expenses: [],
          activityLog: [],
          systemErrors: [],
          savedTasks: [],
          vendors: [],
          customers: [],
          eggStock: {
            available: 0,
            sold: 0,
            gifted: 0,
            family: 0,
            hatching: 0,
            broken: 0,
          },
        };
      }
      function normalizeState(raw) {
        const base = defaultState();
        const normalized = Object.assign({}, base, ensureObject(raw, {}));
        normalized.settings = Object.assign(
          {},
          base.settings,
          raw?.settings || {},
        );
        normalized.settings.location = Object.assign(
          {},
          base.settings.location,
          raw?.settings?.location || {},
        );
        normalized.settings.weather = Object.assign(
          {},
          base.settings.weather,
          raw?.settings?.weather || {},
        );
        normalized.settings.weather.forecast = Array.isArray(
          normalized.settings.weather.forecast,
        )
          ? normalized.settings.weather.forecast
          : [];
        normalized.users = ensureArray(raw?.users).length
          ? ensureArray(raw?.users)
          : base.users;
        normalized.flock = ensureArray(raw?.flock).map((bird) => ({
          ...bird,
          hatchDate: bird.hatchDate || bird.birth || bird.entry || "",
          nickname: bird.nickname || "",
          image: bird.image || "",
          acquisitionType: bird.acquisitionType || "purchase",
          acquisitionRef: bird.acquisitionRef || "",
          ageCategory: bird.ageCategory || "producing",
          entryUnknown: !!bird.entryUnknown,
          breedMixDetails: bird.breedMixDetails || "",
        }));
        normalized.eggLogs = ensureArray(raw?.eggLogs || raw?.production).map((entry) => ({
          ...entry,
          sizes: Object.assign(
            {
              large: entry.gradeA || 0,
              medium: entry.gradeB || 0,
              small: entry.gradeC || 0,
            },
            entry.sizes || {},
          ),
          colors: Object.assign(
            { whitePure: 0, cream: 0, speckled: 0, lightBrown: 0 },
            entry.colors || {},
          ),
          usage: Object.assign(
            { sold: 0, gifted: 0, family: 0, hatching: 0 },
            entry.usage || {},
          ),
        }));
        normalized.production = normalized.eggLogs;
        normalized.feedPurchases = ensureArray(raw?.feedPurchases || raw?.feedStock).map((feed) => ({
          ...feed,
          unit: feed.unit || "kg",
          packageWeight: feed.packageWeight || 0,
          kgEquivalent:
            feed.kgEquivalent ||
            (feed.unit === "package"
              ? (feed.qty || 0) * (feed.packageWeight || 0)
              : feed.qty || 0),
        }));
        normalized.feedStock = normalized.feedPurchases;
        normalized.feedCatalog = ensureArray(raw?.feedCatalog);
        normalized.mealRecipes = raw?.mealRecipes || [];
        normalized.healthRecords = ensureArray(raw?.healthRecords).map((record) => ({
          ...record,
          nextDate: record.nextDate || "",
          targetDetail: record.targetDetail || "",
          notes: record.notes || "",
        }));
        normalized.incubations = ensureArray(raw?.incubations).map((batch) => ({
          ...batch,
          logs: batch.logs || [],
          result: Object.assign(
            { hatched: 0, male: 0, female: 0, unknown: 0, successRate: 0 },
            batch.result || {},
          ),
          chickIds: batch.chickIds || [],
          status: batch.status || "incubating",
        }));
        normalized.chicks = ensureArray(raw?.chicks || raw?.hatchChicks).map((chick) => ({
          ...chick,
          status: chick.status || "brooder",
          gender: chick.gender || "unknown",
        }));
        normalized.hatchChicks = normalized.chicks;
        normalized.coopCleaning = ensureArray(raw?.coopCleaning).map((record) => ({
          ...record,
          nextDate: record.nextDate || "",
          notes: record.notes || "",
        }));
        normalized.eggSales = ensureArray(raw?.eggSales || raw?.sales).map((sale) => ({
          ...sale,
          items: sale.items || {
            large: { qty: 0, price: 0 },
            medium: { qty: 0, price: 0 },
            small: { qty: 0, price: 0 },
          },
        }));
        normalized.sales = normalized.eggSales;
        normalized.expenses = ensureArray(raw?.expenses).map((expense) => ({
          ...expense,
          notes: expense.notes || "",
        }));
        normalized.activityLog = ensureArray(raw?.activityLog).map((entry) => ({
          id: entry.id || `ACT-${uid()}`,
          at: entry.at || new Date().toISOString(),
          action: entry.action || "unknown",
          entityType: entry.entityType || "system",
          entityId: entry.entityId || "",
          details: entry.details || "",
          role: entry.role || normalized.settings.activeRole || "manager",
        }));
        normalized.systemErrors = ensureArray(raw?.systemErrors);
        normalized.savedTasks = ensureArray(raw?.savedTasks).map((task) => ({
          ...task,
          status: task.status || "pending",
        }));
        normalized.vendors = ensureArray(raw?.vendors);
        normalized.customers = ensureArray(raw?.customers);
        normalized.eggStock = Object.assign({}, base.eggStock, raw?.eggStock || {});
        normalized.feedCatalog = buildFeedCatalog(normalized);
        normalized.vendors = buildVendors(normalized);
        normalized.customers = buildCustomers(normalized);
        normalized.meta = Object.assign({}, base.meta, raw?.meta || {}, {
          version: "2.0",
          migratedAt: new Date().toISOString(),
        });
        return normalized;
      }

      function buildFeedCatalog(state) {
        const catalog = new Map();
        FEED_OPTIONS.forEach((name) => {
          catalog.set(name, {
            id: `FEED-CAT-${name}`,
            name,
            defaultUnit: name === "بقايا المطبخ" ? "kitchen" : "kg",
            notes: "",
          });
        });
        ensureArray(state.feedPurchases || state.feedStock).forEach((feed) => {
          if (!feed?.type) return;
          catalog.set(feed.type, {
            id: feed.catalogId || `FEED-CAT-${feed.type}`,
            name: feed.type,
            defaultUnit: feed.unit || "kg",
            notes: feed.notes || "",
          });
        });
        return Array.from(catalog.values());
      }

      function buildVendors(state) {
        const map = new Map();
        ensureArray(state.vendors).forEach((vendor) => {
          map.set(vendor.name, vendor);
        });
        ensureArray(state.feedPurchases || state.feedStock).forEach((feed) => {
          if (!feed?.supplier) return;
          map.set(feed.supplier, {
            id: `VEN-${feed.supplier}`,
            name: feed.supplier,
            type: "feed",
            lastSeenAt: feed.date || "",
          });
        });
        ensureArray(state.expenses).forEach((expense) => {
          if (!expense?.supplier) return;
          map.set(expense.supplier, {
            id: `VEN-${expense.supplier}`,
            name: expense.supplier,
            type: expense.category || "general",
            lastSeenAt: expense.date || "",
          });
        });
        return Array.from(map.values());
      }

      function buildCustomers(state) {
        const map = new Map();
        ensureArray(state.customers).forEach((customer) => {
          map.set(customer.name, customer);
        });
        ensureArray(state.eggSales || state.sales).forEach((sale) => {
          if (!sale?.buyer) return;
          map.set(sale.buyer, {
            id: `CUS-${sale.buyer}`,
            name: sale.buyer,
            lastSeenAt: sale.date || "",
            totalSpent: 0,
          });
        });
        return Array.from(map.values()).map((customer) => ({
          ...customer,
          totalSpent: ensureArray(state.eggSales || state.sales)
            .filter((sale) => sale.buyer === customer.name)
            .reduce((sum, sale) => sum + (sale.total || 0), 0),
        }));
      }

      const BREED_OPTIONS = [
        "بلدي",
        "أحمر رود آيلاند",
        "أوسترالورب",
        "أوربنجتون",
        "إيزا براون",
        "هاي لاين براون",
        "لوهمان براون",
        "ليجهورن",
        "ساسو",
        "بليموث روك",
        "ساسكس",
        "ماران",
        "عنق عاري",
        "براهما",
        "فافرول",
        "كوب 500",
        "روس 308",
        "هوبارد",
        "مختلط",
      ];
      const FEED_OPTIONS = [
        "علف بادئ",
        "علف نامي",
        "علف بياض",
        "علف تسمين",
        "ذرة",
        "شعير",
        "نخالة",
        "صوجا",
        "بقايا المطبخ",
      ];
      const ACQUISITION_LABELS = {
        purchase: "شراء",
        gift: "هدية",
        hatching: "تفقيس",
        exchange: "تبادل",
      };
      const AGE_CATEGORY_LABELS = {
        chick: "فرخ",
        growing: "نامية",
        producing: "منتجة",
        out_of_production: "خارج إنتاج",
      };
      const AGE_CATEGORY_TO_WEEKS = {
        chick: 3,
        growing: 12,
        producing: 34,
        out_of_production: 85,
      };
      const VACCINE_LIBRARY = [
        {
          id: "newcastle",
          name: "لقاح نيوكاسل",
          purpose: "الوقاية من النيوكاسل",
          why: "مرض شديد العدوى يسبب خسائر عالية في النفوق وانخفاض الإنتاج.",
          dose: "1 مل أو 1 قطرة حسب نوع اللقاح",
          intervalDays: 45,
          ageHint: "من الأسبوع الأول ثم يعاد دوريًا",
          method: "ماء الشرب / العين / الرش",
        },
        {
          id: "gumboro",
          name: "لقاح الجمبورو",
          purpose: "حماية جهاز المناعة",
          why: "ضروري للصيصان لأن المرض يضرب كيس فابريشيوس ويضعف المناعة.",
          dose: "حسب النشرة",
          intervalDays: 21,
          ageHint: "من عمر 10 - 14 يوم",
          method: "ماء الشرب",
        },
        {
          id: "fowlpox",
          name: "لقاح جدري الدجاج",
          purpose: "الوقاية من الجدري",
          why: "يمنع ظهور الآفات الجلدية وتراجع الإنتاج خاصة في التربية المفتوحة.",
          dose: "وخزة جناح واحدة",
          intervalDays: 180,
          ageHint: "عمر 6 - 10 أسابيع",
          method: "وخز الجناح",
        },
        {
          id: "infectious_bronchitis",
          name: "لقاح التهاب الشعب المعدي",
          purpose: "حماية الجهاز التنفسي",
          why: "يساعد على تقليل مشاكل التنفس وتشوهات البيض لاحقًا.",
          dose: "حسب النشرة",
          intervalDays: 60,
          ageHint: "من الأيام الأولى",
          method: "الرش / ماء الشرب",
        },
        {
          id: "marek",
          name: "لقاح ماريك",
          purpose: "الوقاية من الشلل والأورام",
          why: "مهم جدًا للصيصان حديثة الفقس قبل التعرض للعدوى.",
          dose: "0.2 مل",
          intervalDays: 0,
          ageHint: "عند الفقس",
          method: "حقن تحت الجلد",
        },
        {
          id: "coryza",
          name: "لقاح الكوريزا",
          purpose: "تقليل التهاب الجهاز التنفسي العلوي",
          why: "مهم في القطعان المعرضة لعدوى تنفسية متكررة.",
          dose: "حسب النشرة",
          intervalDays: 120,
          ageHint: "قبل الإنتاج",
          method: "حقن",
        },
        {
          id: "salmonella",
          name: "لقاح السالمونيلا",
          purpose: "تقليل انتقال السالمونيلا",
          why: "يحسن السلامة الصحية ويقلل العدوى الرأسية في البيض.",
          dose: "حسب النشرة",
          intervalDays: 120,
          ageHint: "مرحلة النمو أو قبل الإنتاج",
          method: "حقن / ماء الشرب",
        },
        {
          id: "vitamins",
          name: "برنامج فيتامينات وكالسيوم",
          purpose: "دعم المناعة وجودة القشرة",
          why: "ليس لقاحًا لكنه برنامج داعم مهم أثناء الحر والإجهاد والإنتاج.",
          dose: "5 مل / لتر أو حسب المنتج",
          intervalDays: 14,
          ageHint: "حسب الحاجة",
          method: "ماء الشرب",
        },
      ];

      /* ============================================================
   SEED DATA
============================================================ */
      function seedData(st) {
        const today = new Date();
        const d = (offset = 0) => {
          const x = new Date(today);
          x.setDate(x.getDate() - offset);
          return x.toISOString().split("T")[0];
        };
        const breeds = [
          "أوسترالورب",
          "أوسترالورب",
          "أوسترالورب",
          "أوسترالورب",
          "أوسترالورب",
          "إيزا براون",
          "إيزا براون",
          "إيزا براون",
          "إيزا براون",
          "بلدي",
          "بلدي",
          "بلدي",
        ];
        const pens = [
          "خم-1",
          "خم-1",
          "خم-1",
          "خم-1",
          "خم-2",
          "خم-2",
          "خم-2",
          "خم-2",
          "خم-2",
          "خم-3",
          "خم-3",
          "خم-3",
        ];
        for (let i = 0; i < 12; i++) {
          st.birdCounter++;
          const year = i < 6 ? 2023 : 2024;
          const id = `BLH-${year}-${String(st.birdCounter).padStart(4, "0")}`;
          const ageWeeks = [78, 72, 65, 60, 55, 48, 40, 32, 25, 18, 12, 8][i];
          const birthDate = new Date(today);
          birthDate.setDate(birthDate.getDate() - ageWeeks * 7);
          st.flock.push({
            id,
            breed: breeds[i],
            gender: "female",
            entry: d(ageWeeks * 7 - 14),
            hatchDate: birthDate.toISOString().split("T")[0],
            ageCategory: ageWeeks < 8 ? "chick" : ageWeeks < 20 ? "growing" : ageWeeks < 72 ? "producing" : "out_of_production",
            weight: (1.6 + Math.random() * 0.8).toFixed(1),
            pen: pens[i],
            health: "healthy",
            notes: "",
            nickname: "",
            image: "",
            acquisitionType: "purchase",
            acquisitionRef: "",
            entryUnknown: false,
            breedMixDetails: "",
            active: true,
            exitReason: null,
            exitDate: null,
            exitNotes: "",
          });
        }
        for (let i = 29; i >= 0; i--) {
          const activeBirds = st.flock.filter((b) => b.active).length;
          const producingBirds = st.flock.filter((b) => {
            const weeks = getAgeWeeks(getBirdHatchDate(b));
            return b.active && weeks >= 20 && weeks < 72;
          }).length;
          const base = producingBirds > 0 ? producingBirds : 8;
          const total = Math.round(base * (0.72 + Math.random() * 0.18));
          const broken = Math.floor(Math.random() * 3);
          st.production.push({
            id: "P" + Date.now() + i,
            date: d(i),
            total,
            broken,
            sizes: {
              large: Math.floor(total * 0.32),
              medium: Math.floor(total * 0.43),
              small: Math.max(0, total - Math.floor(total * 0.32) - Math.floor(total * 0.43) - broken),
            },
            colors: {
              whitePure: Math.floor(total * 0.12),
              cream: Math.floor(total * 0.46),
              speckled: Math.floor(total * 0.08),
              lightBrown: Math.max(0, total - Math.floor(total * 0.12) - Math.floor(total * 0.46) - Math.floor(total * 0.08)),
            },
            usage: { sold: 0, gifted: 0, family: 0, hatching: 0 },
            producingBirds: base,
            notes: i === 0 ? "أول يوم تسجيل" : "",
          });
        }
        st.feedStock.push({
          id: "F1",
          type: "علف بياض",
          supplier: "مورد الحميد",
          qty: 150,
          unit: "kg",
          kgEquivalent: 150,
          price: 55,
          date: d(14),
          expiry: d(-90),
          notes: "علف عالي الجودة",
          balance: 138,
        });
        st.feedStock.push({
          id: "F2",
          type: "علف بادئ",
          supplier: "مورد السعيد",
          qty: 80,
          unit: "kg",
          kgEquivalent: 80,
          price: 48,
          date: d(21),
          expiry: d(-60),
          notes: "",
          balance: 62,
        });
        st.healthRecords.push({
          id: "H1",
          date: d(20),
          type: "vaccine",
          medicine: "لقاح نيوكاسل",
          dose: "2 قطرة/طير",
          target: "all",
          targetDetail: "",
          nextDate: d(-10),
          notes: "تطعيم دوري منتظم",
        });
        st.healthRecords.push({
          id: "H2",
          date: d(45),
          type: "vaccine",
          medicine: "لقاح الجدري",
          dose: "1 قطرة/طير",
          target: "all",
          targetDetail: "",
          nextDate: d(-5),
          notes: "تطعيم سنوي",
        });
        st.healthRecords.push({
          id: "H3",
          date: d(7),
          type: "treatment",
          medicine: "فيتامين د + كالسيوم",
          dose: "5مل/لتر ماء",
          target: "pen",
          targetDetail: "خم-3",
          nextDate: "",
          notes: "تحسين جودة قشرة البيض",
        });
        st.incubations.push({
          id: "INC-001",
          type: "artificial",
          breed: "بلدي",
          startDate: d(10),
          eggCount: 18,
          henId: "",
          source: "بيض من القطيع",
          notes: "",
          expectedDate: getIncubationExpectedDate(d(10)),
          status: "incubating",
          logs: [
            { date: d(10), temp: 37.6, humidity: 55, notes: "بداية التفقيس" },
            { date: d(5), temp: 37.5, humidity: 57, notes: "استقرار جيد" },
          ],
          result: { hatched: 0, male: 0, female: 0, unknown: 0, successRate: 0 },
          chickIds: [],
        });
        st.coopCleaning.push({
          id: "CL1",
          coop: "خم-1",
          date: d(3),
          kind: "routine",
          doneBy: "المالك",
          nextDate: d(-4),
          notes: "تبديل جزء من الفرشة",
        });
        for (let i = 1; i <= 3; i++) {
          st.sales.push({
            id: "S" + i,
            date: d(i * 8),
            qty: 120 + i * 15,
            price: 12,
            buyer: "زبون رقم " + i,
            notes: "",
            total: (120 + i * 15) * 12,
          });
        }
        st.expenses.push({
          id: "E1",
          date: d(14),
          category: "feed",
          amount: 8250,
          notes: "شراء علف بياض 150كغ",
        });
        st.expenses.push({
          id: "E2",
          date: d(21),
          category: "feed",
          amount: 3840,
          notes: "شراء علف بداية 80كغ",
        });
        st.expenses.push({
          id: "E3",
          date: d(5),
          category: "electricity",
          amount: 1200,
          notes: "فاتورة الكهرباء",
        });
        st.expenses.push({
          id: "E4",
          date: d(20),
          category: "medicine",
          amount: 850,
          notes: "شراء لقاح نيوكاسل",
        });
        st.eggStock = recalcEggStock(st.production);
        return st;
      }

      /* ============================================================
   HELPERS
============================================================ */
      function getAgeWeeks(birthDate) {
        if (!birthDate) return 0;
        const diff = new Date() - new Date(birthDate);
        return Math.floor(diff / (7 * 24 * 3600 * 1000));
      }
      function getBirdHatchDate(bird) {
        return bird.hatchDate || bird.birth || bird.entry || "";
      }
      function getBirdEffectiveWeeks(bird) {
        const hatchDate = getBirdHatchDate(bird);
        if (bird?.acquisitionType === "hatching" && hatchDate) {
          return getAgeWeeks(hatchDate);
        }
        if (bird?.ageCategory && AGE_CATEGORY_TO_WEEKS[bird.ageCategory] != null) {
          return AGE_CATEGORY_TO_WEEKS[bird.ageCategory];
        }
        return hatchDate ? getAgeWeeks(hatchDate) : 0;
      }
      function getBirdAgeDisplay(bird) {
        if (bird?.acquisitionType === "hatching" && getBirdHatchDate(bird)) {
          return `فقس معروف: ${fmtDate(getBirdHatchDate(bird))}`;
        }
        return AGE_CATEGORY_LABELS[bird?.ageCategory] || "غير محدد";
      }
      function getAgeDisplay(birthDate) {
        const w = getAgeWeeks(birthDate);
        if (w < 16) return w + " أسبوع";
        const m = Math.floor(w / 4.33);
        if (m < 24) return m + " شهر";
        return (m / 12).toFixed(1) + " سنة";
      }
      function getStageFromWeeks(w) {
        if (w < 6) return { label: "فرخ", cls: "badge-cyan" };
        if (w < 18) return { label: "نامية", cls: "badge-amber" };
        if (w < 22) return { label: "بداية إنتاج", cls: "badge-purple" };
        if (w < 72) return { label: "إنتاج", cls: "badge-green" };
        if (w < 90) return { label: "نهاية إنتاج", cls: "badge-red" };
        return { label: "تقاعد", cls: "badge-gray" };
      }
      function getStage(birthDate) {
        return getStageFromWeeks(getAgeWeeks(birthDate));
      }
      function getBirdStage(bird) {
        if (bird?.ageCategory === "chick") return { label: "فرخ", cls: "badge-cyan" };
        if (bird?.ageCategory === "growing") return { label: "نامية", cls: "badge-amber" };
        if (bird?.ageCategory === "producing") return { label: "إنتاج", cls: "badge-green" };
        if (bird?.ageCategory === "out_of_production") return { label: "خارج إنتاج", cls: "badge-gray" };
        return getStageFromWeeks(getBirdEffectiveWeeks(bird));
      }
      function getAcquisitionLabel(type) {
        return ACQUISITION_LABELS[type] || type || "--";
      }
      function getFeedNames() {
        const names = new Set([...FEED_OPTIONS, ...S.feedStock.map((feed) => feed.type).filter(Boolean)]);
        return Array.from(names);
      }
      function getCoopNames() {
        const names = new Set([
          ...S.flock.map((bird) => bird.pen).filter(Boolean),
          ...S.coopCleaning.map((record) => record.coop).filter(Boolean),
          "خم-1",
          "خم-2",
          "خم-3",
        ]);
        return Array.from(names);
      }
      function getVaccineTemplate(templateId) {
        return VACCINE_LIBRARY.find((item) => item.id === templateId) || null;
      }
      function calculateNextDate(date, days) {
        if (!date || !days) return "";
        const dt = new Date(date + "T00:00:00");
        dt.setDate(dt.getDate() + days);
        return dt.toISOString().split("T")[0];
      }
      function getIncubationExpectedDate(startDate) {
        return calculateNextDate(startDate, 21);
      }
      function getLastIncubationLog(batch) {
        const logs = [...(batch.logs || [])].sort((a, b) => b.date.localeCompare(a.date));
        return logs[0] || null;
      }
      function getChickAgeDays(chick) {
        if (!chick?.hatchDate) return 0;
        const diff = new Date() - new Date(chick.hatchDate);
        return Math.max(0, Math.floor(diff / (24 * 3600 * 1000)));
      }
      function getChickStage(chick) {
        const age = getChickAgeDays(chick);
        if (age < 14) return { label: "حضانة أولى", feed: "علف بادئ ناعم", vaccine: "ماريك / نيوكاسل مبكر" };
        if (age < 35) return { label: "حضانة", feed: "علف بادئ", vaccine: "جمبورو / نيوكاسل" };
        if (age < 60) return { label: "نمو", feed: "علف نامي", vaccine: "جدري / شعب معدي" };
        return { label: "جاهز للفرز", feed: "علف نامي أو بياض حسب الغرض", vaccine: "حسب الخطة الصحية" };
      }
      function createChickIdentifier(batchId, index) {
        return `CHK-${batchId.split("-").pop()}-${String(index).padStart(3, "0")}`;
      }
      function populateIncubationBreedOptions() {
        const select = document.getElementById("inc-breed");
        if (!select) return;
        select.innerHTML = BREED_OPTIONS.map((breed) => `<option value="${breed}">${breed}</option>`).join("");
      }
      function populateHenOptions() {
        const select = document.getElementById("inc-hen-id");
        if (!select) return;
        const hens = getActiveFlock().filter((bird) => bird.gender === "female");
        select.innerHTML = `<option value="">اختر الدجاجة الحاضنة</option>` +
          hens.map((bird) => `<option value="${bird.id}">${bird.id}${bird.nickname ? " - " + bird.nickname : ""}</option>`).join("");
      }
      function populateIncubationBatchOptions() {
        const select = document.getElementById("ilog-batch");
        if (!select) return;
        const batches = S.incubations.filter((batch) => batch.status === "incubating");
        select.innerHTML = `<option value="">اختر دفعة</option>` +
          batches.map((batch) => `<option value="${batch.id}">${batch.id} - ${batch.type === "artificial" ? "فقاسة" : "طبيعي"}</option>`).join("");
      }
      function populateCleaningCoops() {
        const select = document.getElementById("cl-coop");
        if (!select) return;
        select.innerHTML = getCoopNames().map((coop) => `<option value="${coop}">${coop}</option>`).join("");
      }
      function populateHealthTemplates() {
        const select = document.getElementById("ah-template");
        if (!select) return;
        select.innerHTML =
          '<option value="">اختياري - املأ يدويًا</option>' +
          VACCINE_LIBRARY.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
      }
      function syncHealthTemplateFields() {
        const templateId = document.getElementById("ah-template")?.value;
        const info = document.getElementById("ah-template-info");
        const template = getVaccineTemplate(templateId);
        if (!template) {
          if (info) info.textContent = "";
          return;
        }
        document.getElementById("ah-type").value = "vaccine";
        document.getElementById("ah-medicine").value = template.name;
        document.getElementById("ah-dose").value = template.dose;
        if (!document.getElementById("ah-notes").value.trim()) {
          document.getElementById("ah-notes").value = `${template.purpose}. ${template.why}`;
        }
        const date = document.getElementById("ah-date").value || todayStr();
        if (template.intervalDays > 0) {
          document.getElementById("ah-next").value = calculateNextDate(
            date,
            template.intervalDays,
          );
        }
        if (info) {
          info.textContent = `${template.purpose} | الجرعة: ${template.dose} | التكرار: ${template.intervalDays ? template.intervalDays + " يوم" : "مرة واحدة"} | ${template.why}`;
        }
      }
      function getCleaningKindLabel(kind) {
        return (
          {
            routine: "تنظيف عادي",
            deep: "تنظيف عميق",
            disinfection: "تعقيم",
          }[kind] || kind
        );
      }
      function getWeatherAdvice() {
        const weather = S.settings.weather || {};
        const forecast = weather.forecast || [];
        const advice = [];
        const heatThreshold = S.settings.highHeatThreshold || 34;
        const coldThreshold = S.settings.coldThreshold || 10;
        if (!S.settings.location?.enabled) {
          return [
            {
              type: "info",
              title: "فعّل الموقع الجغرافي",
              text: "بعد تفعيل الموقع سنعرض نصائح استباقية لحماية الخم والمعالف والمشارب حسب الحرارة والرياح والأمطار.",
            },
          ];
        }
        if (weather.temperature != null) {
          if (weather.temperature >= heatThreshold) {
            advice.push({
              type: "danger",
              title: "موجة حر",
              text: "زِد الماء البارد، أضف ظلًا وتهوية، وخفف الأعلاف الثقيلة وقت الظهيرة.",
            });
          } else if (weather.temperature <= coldThreshold) {
            advice.push({
              type: "warning",
              title: "برودة مرتفعة",
              text: "قلل التيارات الهوائية، عزز الفرشة الجافة، وراقب الصيصان قرب مصدر الدفء.",
            });
          }
        }
        const severeDay = forecast.find(
          (day) =>
            day.tempMax >= heatThreshold ||
            day.tempMin <= coldThreshold - 2 ||
            day.wind >= 35 ||
            day.precip >= 8 ||
            [61, 63, 65, 80, 81, 82, 95].includes(day.code),
        );
        if (severeDay) {
          advice.push({
            type: "info",
            title: `توقعات ${fmtDate(severeDay.date)}`,
            text:
              severeDay.tempMax >= heatThreshold
                ? "استعد لحرارة مرتفعة غدًا: راقب المشارب ولا تملأ المعالف دفعة واحدة."
                : severeDay.tempMin <= coldThreshold - 2
                  ? "برودة متوقعة: جهّز الحماية الليلية خاصة للصيصان."
                  : severeDay.wind >= 35
                    ? "رياح قوية متوقعة: ثبّت الأغطية واحمِ المعالف والمشارب."
                    : "أمطار أو اضطراب جوي متوقع: افحص التسربات وارفَع العلف عن الأرضية.",
          });
        }
        if (!advice.length) {
          advice.push({
            type: "success",
            title: "الوضع مناسب",
            text: "لا توجد مؤشرات حرجة حاليًا. استمر على الماء النظيف والتهوية والمتابعة اليومية.",
          });
        }
        return advice;
      }
      function printIdentifierLabels(items, title) {
        if (!items.length) {
          toast("لا توجد معرفات للطباعة", "info");
          return;
        }
        const win = window.open("", "_blank", "width=900,height=700");
        if (!win) {
          toast("تعذر فتح نافذة الطباعة", "error");
          return;
        }
        win.document.write(`
          <html lang="ar" dir="rtl">
            <head>
              <title>${title}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 24px; }
                .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
                .label { border:1px solid #333; border-radius:10px; padding:14px; min-height:140px; display:flex; gap:12px; align-items:center; justify-content:space-between; }
                .label-info { flex:1; display:flex; flex-direction:column; gap:8px; }
                .id { font-size:22px; font-weight:bold; }
                .meta { font-size:13px; color:#444; }
                .qr { width:84px; height:84px; border:1px solid #ddd; border-radius:8px; }
              </style>
            </head>
            <body>
              <h2>${title}</h2>
              <div class="grid">
                ${items
                  .map(
                    (item) => `
                      <div class="label">
                        <div class="label-info">
                          <div class="id">${item.id}</div>
                          <div class="meta">${item.breed || ""}</div>
                          <div class="meta">${item.extra || ""}</div>
                        </div>
                        <img class="qr" alt="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=84x84&data=${encodeURIComponent(item.id)}" />
                      </div>`,
                  )
                  .join("")}
              </div>
              <script>window.onload = () => window.print();<\/script>
            </body>
          </html>
        `);
        win.document.close();
      }
      function recalcEggStock(entries = S.production) {
        const base = entries.reduce(
          (acc, entry) => {
            const usage = Object.assign({ sold: 0, gifted: 0, family: 0, hatching: 0 }, entry.usage || {});
            acc.available += Math.max(0, entry.total - entry.broken - usage.sold - usage.gifted - usage.family - usage.hatching);
            acc.sold += usage.sold;
            acc.gifted += usage.gifted;
            acc.family += usage.family;
            acc.hatching += usage.hatching;
            acc.broken += entry.broken || 0;
            return acc;
          },
          { available: 0, sold: 0, gifted: 0, family: 0, hatching: 0, broken: 0 },
        );
        const recordedSales = ensureArray(S?.sales).reduce(
          (sum, sale) => sum + (parseInt(sale?.qty, 10) || 0),
          0,
        );
        base.sold += recordedSales;
        base.available = Math.max(0, base.available - recordedSales);
        return base;
      }
      function getEggSummaryDisplay(entry) {
        const sizes = entry.sizes || {};
        const colors = entry.colors || {};
        const usage = entry.usage || {};
        const available = Math.max(0, entry.total - entry.broken - (usage.sold || 0) - (usage.gifted || 0) - (usage.family || 0) - (usage.hatching || 0));
        return {
          sizes: `كبير ${sizes.large || 0} | متوسط ${sizes.medium || 0} | صغير ${sizes.small || 0}`,
          colors: `أبيض ${colors.whitePure || 0} | كريمي ${colors.cream || 0} | منقط ${colors.speckled || 0} | بني فاتح ${colors.lightBrown || 0}`,
          usage: `بيع ${usage.sold || 0} | هدية ${usage.gifted || 0} | عائلة ${usage.family || 0}`,
          available,
        };
      }
      function readImageAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          if (!file) {
            resolve("");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result || "");
          reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
          reader.readAsDataURL(file);
        });
      }
      function healthLabel(h) {
        const m = {
          healthy: ["سليم", "badge-green"],
          sick: ["مريض", "badge-red"],
          quarantine: ["عزل", "badge-amber"],
        };
        const [l, c] = m[h] || [h, "badge-gray"];
        return `<span class="badge ${c}">${l}</span>`;
      }
      function fmtDate(str) {
        if (!str) return "--";
        const d = new Date(str + "T00:00:00");
        return d.toLocaleDateString("ar-DZ", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
      function fmtNum(n, dec = 0) {
        if (n == null || isNaN(n)) return "--";
        return Number(n).toLocaleString("ar-DZ", {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        });
      }
      function todayStr() {
        return new Date().toISOString().split("T")[0];
      }
      function uid() {
        return Date.now() + Math.random().toString(36).slice(2, 7);
      }
      function daysUntil(dateStr) {
        if (!dateStr) return null;
        const diff = new Date(dateStr + "T00:00:00") - new Date();
        return Math.ceil(diff / (24 * 3600 * 1000));
      }
      function weatherCodeLabel(code) {
        const map = {
          0: "صحو",
          1: "غالبًا صحو",
          2: "غائم جزئي",
          3: "غائم",
          45: "ضباب",
          48: "ضباب كثيف",
          51: "رذاذ خفيف",
          53: "رذاذ",
          55: "رذاذ كثيف",
          61: "مطر خفيف",
          63: "مطر",
          65: "مطر غزير",
          71: "ثلج خفيف",
          73: "ثلج",
          75: "ثلج كثيف",
          80: "زخات خفيفة",
          81: "زخات",
          82: "زخات غزيرة",
          95: "عاصفة رعدية",
        };
        return map[code] || "غير معروف";
      }
      function updateWeatherUI() {
        const weather = S.settings.weather || {};
        const location = S.settings.location || {};
        const pill = document.getElementById("weather-pill");
        const summary = document.getElementById("weather-settings-summary");
        const cityLabel = location.city || "غير محدد";
        const weatherLabel =
          weather.temperature == null
            ? "الطقس غير متاح"
            : `${weather.temperature}°C - ${weatherCodeLabel(weather.code)}`;
        if (pill) {
          pill.innerHTML = location.enabled
            ? `<strong>${cityLabel}</strong> ${weatherLabel}`
            : "الطقس غير مفعل";
        }
        if (summary) {
          summary.textContent = location.enabled
            ? `${cityLabel}${location.country ? "، " + location.country : ""} | ${weatherLabel}`
            : "لم يتم تفعيل الموقع بعد";
        }
      }

      function isStandaloneMode() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      }

      function updateInstallButtons() {
        const available = !!deferredInstallPrompt && !isStandaloneMode();
        ["install-app-btn", "install-app-btn-secondary"].forEach((id) => {
          const button = document.getElementById(id);
          if (!button) return;
          button.classList.toggle("hidden", !available);
          button.disabled = !available;
        });
      }

      async function installPWA() {
        if (!deferredInstallPrompt) {
          toast(isStandaloneMode() ? "التطبيق مثبت بالفعل على هذا الجهاز" : "خيار التثبيت غير متاح بعد في هذا المتصفح", "info");
          return;
        }
        deferredInstallPrompt.prompt();
        const outcome = await deferredInstallPrompt.userChoice;
        recordActivity(
          "pwa-install-prompt",
          outcome?.outcome === "accepted" ? "وافق المستخدم على تثبيت التطبيق" : "تم تجاهل تثبيت التطبيق",
          "pwa",
          "install",
        );
        deferredInstallPrompt = null;
        updateInstallButtons();
        save();
        if (outcome?.outcome === "accepted") toast("تم تفعيل تثبيت التطبيق على الجهاز", "success");
      }

      function registerPWA() {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker
            .register(`./sw.js?v=${APP_VERSION}`, { updateViaCache: "none" })
            .then((registration) => registration.update().catch(() => null))
            .catch((error) => {
              recordSystemError("service-worker", error);
            });
        }
        window.addEventListener("beforeinstallprompt", (event) => {
          event.preventDefault();
          deferredInstallPrompt = event;
          updateInstallButtons();
        });
        window.addEventListener("appinstalled", () => {
          deferredInstallPrompt = null;
          updateInstallButtons();
          toast("تم تثبيت التطبيق بنجاح ويمكنك تشغيله من الشاشة الرئيسية", "success");
        });
      }
      async function reverseGeocode(lat, lon) {
        const res = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ar`,
        );
        if (!res.ok) throw new Error("تعذر تحديد المدينة");
        const data = await res.json();
        return {
          city:
            data.city ||
            data.locality ||
            data.principalSubdivision ||
            "موقع غير معروف",
          country: data.countryName || "",
        };
      }
      async function fetchWeatherByCoords(lat, lon) {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=3&timezone=auto`,
        );
        if (!res.ok) throw new Error("تعذر جلب الطقس");
        const data = await res.json();
        const forecast = (data.daily?.time || []).map((date, index) => ({
          date,
          code: data.daily?.weather_code?.[index] ?? null,
          tempMax: data.daily?.temperature_2m_max?.[index] ?? null,
          tempMin: data.daily?.temperature_2m_min?.[index] ?? null,
          precip: data.daily?.precipitation_sum?.[index] ?? null,
          wind: data.daily?.wind_speed_10m_max?.[index] ?? null,
        }));
        return {
          temperature: data.current?.temperature_2m ?? null,
          code: data.current?.weather_code ?? null,
          forecast,
          updatedAt: new Date().toISOString(),
        };
      }
      async function applyLocationWeather(lat, lon) {
        const geo = await reverseGeocode(lat, lon);
        const weather = await fetchWeatherByCoords(lat, lon);
        S.settings.location = {
          lat,
          lon,
          city: geo.city,
          country: geo.country,
          enabled: true,
          updatedAt: new Date().toISOString(),
        };
        S.settings.weather = weather;
        save();
        updateWeatherUI();
        if (currentPage === "dashboard") renderDashboard();
        if (currentPage === "settings") renderSettingsPage();
        if (currentPage === "care") renderCarePage();
      }
      function requestLocationWeather() {
        if (!navigator.geolocation) {
          toast("المتصفح لا يدعم تحديد الموقع", "error");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await applyLocationWeather(
                pos.coords.latitude,
                pos.coords.longitude,
              );
              toast("تم تفعيل الموقع وتحديث الطقس", "success");
            } catch (err) {
              toast(
                "تم الحصول على الموقع لكن فشل جلب الطقس أو المدينة",
                "warning",
              );
            }
          },
          () => {
            toast("تم رفض الوصول إلى الموقع أو تعذر تحديده", "warning");
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
        );
      }
      async function refreshWeather() {
        const location = S.settings.location || {};
        if (!location.enabled || location.lat == null || location.lon == null) {
          toast("حدد الموقع أولاً لتحديث الطقس", "info");
          return;
        }
        try {
          const weather = await fetchWeatherByCoords(
            location.lat,
            location.lon,
          );
          S.settings.weather = weather;
          save();
          updateWeatherUI();
          if (currentPage === "dashboard") renderDashboard();
          if (currentPage === "settings") renderSettingsPage();
          if (currentPage === "care") renderCarePage();
          toast("تم تحديث الطقس", "success");
        } catch (err) {
          toast("تعذر تحديث الطقس حالياً", "error");
        }
      }
      function populateBreedOptions() {
        const select = document.getElementById("ab-breed");
        const filter = document.getElementById("flock-filter-breed");
        if (select) {
          select.innerHTML = BREED_OPTIONS.map((breed) => `<option value="${breed}">${breed}</option>`).join("");
        }
        if (filter) {
          filter.innerHTML = `<option value="">كل السلالات</option>` +
            BREED_OPTIONS.map((breed) => `<option value="${breed}">${breed}</option>`).join("");
        }
      }
      function populateFeedOptions() {
        const select = document.getElementById("af-type");
        if (!select) return;
        select.innerHTML = getFeedNames()
          .map((feed) => `<option value="${feed}">${feed}</option>`)
          .join("");
      }
      function populateExchangeBirdOptions() {
        const select = document.getElementById("ab-exchange-bird");
        if (!select) return;
        const activeBirds = getActiveFlock();
        select.innerHTML = `<option value="">اختر طيراً من القطيع</option>` +
          activeBirds.map((bird) => `<option value="${bird.id}">${bird.id}${bird.nickname ? " - " + bird.nickname : ""}</option>`).join("");
      }
      function renderMealIngredientFields() {
        const wrap = document.getElementById("meal-ingredients");
        if (!wrap) return;
        const feedNames = getFeedNames().filter((name) => name !== "بقايا المطبخ");
        if (!feedNames.length) {
          wrap.innerHTML = `<div class="field-note">أضف أعلافًا إلى المخزون أولاً لإنشاء وجبة.</div>`;
          return;
        }
        wrap.innerHTML = feedNames
          .map(
            (name) => `
            <div class="fg ingredient-card">
              <label><input type="checkbox" data-meal-feed="${name}" onchange="refreshMealInputs()"> ${name}</label>
              <input type="number" class="form-control meal-qty" data-meal-qty="${name}" min="0" step="0.1" placeholder="الكمية المأخوذة" disabled />
            </div>`,
          )
          .join("");
      }
      function refreshMealInputs() {
        document.querySelectorAll("[data-meal-feed]").forEach((checkbox) => {
          const qtyInput = document.querySelector(`[data-meal-qty="${checkbox.getAttribute("data-meal-feed")}"]`);
          if (qtyInput) qtyInput.disabled = !checkbox.checked;
        });
      }
      function refreshBirdFormVisibility() {
        const breed = document.getElementById("ab-breed")?.value;
        const acquisitionType = document.getElementById("ab-acquisition")?.value;
        const entryUnknown = document.getElementById("ab-entry-unknown")?.checked;
        const entryInput = document.getElementById("ab-entry");
        const mixWrap = document.getElementById("ab-mix-wrap");
        const hatchWrap = document.getElementById("ab-hatch-wrap");
        const ageWrap = document.getElementById("ab-age-category-wrap");
        const exchangeWrap = document.getElementById("ab-exchange-wrap");

        if (mixWrap) mixWrap.classList.toggle("hidden", breed !== "مختلط");
        if (exchangeWrap) exchangeWrap.classList.toggle("hidden", acquisitionType !== "exchange");
        if (hatchWrap) hatchWrap.classList.toggle("hidden", acquisitionType !== "hatching");
        if (ageWrap) ageWrap.classList.toggle("hidden", acquisitionType === "hatching");
        if (entryInput) {
          entryInput.disabled = !!entryUnknown;
          if (entryUnknown) entryInput.value = "";
        }
        if (acquisitionType === "exchange") populateExchangeBirdOptions();
      }
      function refreshFeedFormVisibility() {
        const feedType = document.getElementById("af-type")?.value;
        const unit = document.getElementById("af-unit")?.value;
        const qtyWrap = document.getElementById("af-qty-wrap");
        const packageWrap = document.getElementById("af-package-weight-wrap");
        const price = document.getElementById("af-price");
        if (qtyWrap) qtyWrap.classList.toggle("hidden", unit === "kitchen" || feedType === "بقايا المطبخ");
        if (packageWrap) packageWrap.classList.toggle("hidden", unit !== "package");
        if (price) price.disabled = unit === "kitchen" || feedType === "بقايا المطبخ";
      }
      function prepareBirdFormForCreate() {
        document.getElementById("ab-edit-id").value = "";
        document.getElementById("ab-submit-btn").textContent = "حفظ الطير";
        document.getElementById("ab-breed").value = BREED_OPTIONS[0];
        document.getElementById("ab-gender").value = "female";
        document.getElementById("ab-nickname").value = "";
        document.getElementById("ab-mix-details").value = "";
        document.getElementById("ab-acquisition").value = "purchase";
        document.getElementById("ab-exchange-bird").value = "";
        document.getElementById("ab-entry-unknown").checked = false;
        document.getElementById("ab-entry").value = todayStr();
        document.getElementById("ab-hatch").value = todayStr();
        document.getElementById("ab-age-category").value = "chick";
        document.getElementById("ab-weight").value = "";
        document.getElementById("ab-pen").value = "";
        document.getElementById("ab-health").value = "healthy";
        document.getElementById("ab-notes").value = "";
        document.getElementById("ab-image").value = "";
        refreshBirdFormVisibility();
      }
      function prepareIncubationForm() {
        document.getElementById("inc-type").value = "artificial";
        document.getElementById("inc-breed").value = BREED_OPTIONS[0];
        document.getElementById("inc-start-date").value = todayStr();
        document.getElementById("inc-egg-count").value = "";
        document.getElementById("inc-hen-id").value = "";
        document.getElementById("inc-source").value = "";
        document.getElementById("inc-temp").value = "";
        document.getElementById("inc-humidity").value = "";
        document.getElementById("inc-notes").value = "";
        refreshIncubationFormVisibility();
      }
      function prepareFeedForm() {
        document.getElementById("af-type").value = getFeedNames()[0] || FEED_OPTIONS[0];
        document.getElementById("af-supplier").value = "";
        document.getElementById("af-unit").value = "kg";
        document.getElementById("af-qty").value = "";
        document.getElementById("af-package-weight").value = "";
        document.getElementById("af-price").value = "";
        document.getElementById("af-date").value = todayStr();
        document.getElementById("af-expiry").value = "";
        document.getElementById("af-notes").value = "";
        refreshFeedFormVisibility();
      }
      function prepareHealthForm() {
        document.getElementById("ah-template").value = "";
        document.getElementById("ah-template-info").textContent = "";
        document.getElementById("ah-date").value = todayStr();
        document.getElementById("ah-type").value = "vaccine";
        document.getElementById("ah-medicine").value = "";
        document.getElementById("ah-dose").value = "";
        document.getElementById("ah-target").value = "all";
        document.getElementById("ah-target-detail").value = "";
        document.getElementById("ah-next").value = "";
        document.getElementById("ah-notes").value = "";
      }
      function prepareSaleForm() {
        document.getElementById("as-date").value = todayStr();
        [
          "as-large-qty",
          "as-large-price",
          "as-medium-qty",
          "as-medium-price",
          "as-small-qty",
          "as-small-price",
        ].forEach((id) => {
          document.getElementById(id).value = "0";
        });
        document.getElementById("as-buyer").value = "";
        document.getElementById("as-notes").value = "";
      }
      function prepareCleaningForm() {
        document.getElementById("cl-coop").value = getCoopNames()[0] || "";
        document.getElementById("cl-date").value = todayStr();
        document.getElementById("cl-kind").value = "routine";
        document.getElementById("cl-done-by").value = "";
        document.getElementById("cl-next-date").value = "";
        document.getElementById("cl-notes").value = "";
      }

      /* ============================================================
   CHART HELPERS
============================================================ */
      const Charts = {};
      const chartDefaults = {
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0c1625",
            borderColor: "rgba(255,255,255,.12)",
            borderWidth: 1,
            titleColor: "#94a3b8",
            bodyColor: "#f1f5f9",
            padding: 12,
            callbacks: {},
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,.04)" },
            ticks: { color: "#475569", font: { family: "Tajawal", size: 11 } },
            border: { color: "rgba(255,255,255,.06)" },
          },
          y: {
            grid: { color: "rgba(255,255,255,.04)" },
            ticks: { color: "#475569", font: { family: "Tajawal", size: 11 } },
            border: { color: "rgba(255,255,255,.06)" },
            beginAtZero: true,
          },
        },
      };
      function destroyChart(id) {
        if (Charts[id]) {
          Charts[id].destroy();
          delete Charts[id];
        }
      }
      function mkChart(id, cfg) {
        destroyChart(id);
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof Chart === "undefined") {
          const wrap = el.parentElement;
          if (wrap) {
            wrap.innerHTML =
              '<div class="empty-box chart-fallback">تعذر تحميل الرسم البياني الآن. ستبقى بقية الصفحة تعمل بشكل طبيعي.</div>';
          }
          return null;
        }
        Charts[id] = new Chart(el.getContext("2d"), cfg);
        return Charts[id];
      }

      /* ============================================================
   TOAST
============================================================ */
      function toast(msg, type = "success") {
        const icons = {
          success:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
          error:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
          warning:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
          info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        };
        const el = document.createElement("div");
        el.className = `toast toast-${type}`;
        el.innerHTML = (icons[type] || icons.info) + msg;
        document.getElementById("toasts").appendChild(el);
        setTimeout(() => {
          el.classList.add("removing");
          setTimeout(() => el.remove(), 280);
        }, 3400);
      }
      window.addEventListener("error", (event) => {
        console.error("Runtime error:", event.error || event.message);
        recordSystemError("runtime", event.error || event.message);
      });
      window.addEventListener("unhandledrejection", (event) => {
        console.error("Unhandled promise rejection:", event.reason);
        recordSystemError("promise", event.reason);
      });

      /* ============================================================
   MODAL
============================================================ */
      function openModal(id) {
        if (id === "modal-add-bird" && !document.getElementById("ab-edit-id")?.value) {
          prepareBirdFormForCreate();
        }
        if (id === "modal-add-incubation") prepareIncubationForm();
        if (id === "modal-add-feed") prepareFeedForm();
        if (id === "modal-add-health") prepareHealthForm();
        if (id === "modal-add-sale") prepareSaleForm();
        if (id === "modal-add-cleaning") prepareCleaningForm();
        document.getElementById(id).classList.add("open");
        document.body.style.overflow = "hidden";
      }
      function closeModal(id) {
        document.getElementById(id).classList.remove("open");
        document.body.style.overflow = "";
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          document.querySelectorAll(".overlay.open").forEach((m) => {
            m.classList.remove("open");
            document.body.style.overflow = "";
          });
        }
      });
      document.querySelectorAll(".overlay").forEach((ov) => {
        ov.addEventListener("click", (e) => {
          if (e.target === ov) closeModal(ov.id);
        });
      });

      /* ============================================================
   SIDEBAR / NAVIGATION
============================================================ */
      const PAGE_TITLES = {
        dashboard: "لوحة التحكم",
        flock: "إدارة القطيع",
        production: "الإنتاج اليومي",
        feed: "إدارة العلف",
        incubation: "التفقيس والحضانة",
        health: "السجل الصحي",
        financials: "الحسابات المالية",
        care: "الخم والوقاية",
        product: "المنتج والاشتراك",
        settings: "الإعدادات",
      };
      let currentPage = "dashboard";

      function navTo(page) {
        if (!hasPageAccess(page)) {
          toast("هذه الصفحة غير متاحة للدور الحالي", "warning");
          return;
        }
        currentPage = page;
        document
          .querySelectorAll(".page")
          .forEach((p) => p.classList.remove("active"));
        document
          .querySelectorAll(".nav-item")
          .forEach((n) => n.classList.remove("active"));
        const el = document.getElementById("page-" + page);
        if (el) el.classList.add("active");
        document
          .querySelectorAll(`.nav-item[data-page="${page}"]`)
          .forEach((n) => n.classList.add("active"));
        document.getElementById("topbar-title").textContent =
          PAGE_TITLES[page] || "";
        window.location.hash = page;
        renderPage(page);
        closeSidebar();
      }

      document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
        item.addEventListener("click", () => navTo(item.dataset.page));
      });

      function toggleSidebar() {
        document.getElementById("sidebar").classList.toggle("mobile-open");
        document.getElementById("sidebar-overlay").classList.toggle("show");
      }
      function closeSidebar() {
        document.getElementById("sidebar").classList.remove("mobile-open");
        document.getElementById("sidebar-overlay").classList.remove("show");
      }
      function applyRolePermissions() {
        const role = getCurrentRole();
        document.getElementById("role-pill").textContent = `الدور: ${ROLE_OPTIONS[role] || role}`;
        document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
          const allowed = hasPageAccess(item.dataset.page);
          item.style.display = allowed ? "" : "none";
        });
      }
      function handleGlobalSearch(query) {
        const box = document.getElementById("global-search-results");
        if (!box) return;
        if (!String(query || "").trim()) {
          box.innerHTML = '<div class="field-note">ابدأ بالكتابة في شريط البحث أعلى الصفحة.</div>';
          return;
        }
        const results = runGlobalSearch(query);
        if (!results.length) {
          box.innerHTML = '<div class="empty-box">لا توجد نتائج مطابقة.</div>';
          return;
        }
        box.innerHTML = `<div class="mini-list">${results
          .map(
            (result) => `
              <div class="mini-list-item mini-list-item-clickable" onclick="navTo('${result.page}')">
                <div class="mini-list-head"><strong>${result.label}</strong><span class="badge badge-cyan">${PAGE_TITLES[result.page] || result.page}</span></div>
                <div class="mini-meta">${result.sub}</div>
              </div>`,
          )
          .join("")}</div>`;
      }
      function refreshDynamicUIState() {
        populateBreedOptions();
        populateFeedOptions();
        populateExchangeBirdOptions();
        populateIncubationBreedOptions();
        populateHenOptions();
        populateIncubationBatchOptions();
        populateCleaningCoops();
        populateHealthTemplates();
        refreshBirdFormVisibility();
        refreshFeedFormVisibility();
        refreshIncubationFormVisibility();
        renderMealIngredientFields();
        syncDerivedTasks();
        updateWeatherUI();
        refreshThemeControls(S?.settings?.themeMode || getThemeMode());
        applyRolePermissions();
        updateInstallButtons();
      }

      function hydrateDynamicWidths(root = document) {
        root.querySelectorAll("[data-progress-width]").forEach((el) => {
          const width = Number(el.getAttribute("data-progress-width") || 0);
          const safeWidth = Number.isFinite(width) ? Math.max(0, Math.min(100, width)) : 0;
          el.style.width = `${safeWidth}%`;
        });
      }

      /* ============================================================
   CLOCK
============================================================ */
      function startClock() {
        function tick() {
          const now = new Date();
          const t = now.toLocaleTimeString("ar-DZ", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          const sbTime = document.getElementById("sb-time");
          if (sbTime) sbTime.textContent = t;
          const sbDate = document.getElementById("sb-date");
          if (sbDate)
            sbDate.textContent = now.toLocaleDateString("ar-DZ", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });
        }
        tick();
        setInterval(tick, 1000);
      }

      /* ============================================================
   MAIN APP STATE
============================================================ */
      let S; // global state

      function getCurrentRole() {
        return S?.settings?.activeRole || "manager";
      }

      function hasPageAccess(page) {
        return (ROLE_PERMISSIONS[getCurrentRole()] || []).includes(page);
      }

      function ensurePermission(page, message) {
        if (hasPageAccess(page)) return true;
        toast(message || "ليس لديك صلاحية تنفيذ هذا الإجراء في الدور الحالي", "warning");
        return false;
      }

      function syncStateForSave() {
        S.meta = Object.assign({}, S.meta, {
          version: "2.0",
          updatedAt: new Date().toISOString(),
        });
        S.eggLogs = S.production;
        S.eggSales = S.sales;
        S.feedPurchases = S.feedStock;
        S.chicks = S.hatchChicks;
        S.feedCatalog = buildFeedCatalog(S);
        S.vendors = buildVendors(S);
        S.customers = buildCustomers(S);
        S.eggStock = recalcEggStock(S.production);
      }

      function recordActivity(action, details, entityType = "system", entityId = "") {
        if (!S) return;
        S.activityLog.unshift({
          id: `ACT-${uid()}`,
          at: new Date().toISOString(),
          action,
          details,
          entityType,
          entityId,
          role: getCurrentRole(),
        });
        S.activityLog = S.activityLog.slice(0, 250);
      }

      function recordSystemError(source, error) {
        if (!S) return;
        S.systemErrors.unshift({
          id: `ERR-${uid()}`,
          at: new Date().toISOString(),
          source,
          message: error?.message || String(error || "خطأ غير معروف"),
        });
        S.systemErrors = S.systemErrors.slice(0, 80);
      }

      function save() {
        syncStateForSave();
        const lastBackupAt = Number(localStorage.getItem("balhadj_farm_v2_last_backup_at") || "0");
        const now = Date.now();
        if (!lastBackupAt || now - lastBackupAt > 1000 * 60 * 20) {
          createBackup(S, "auto-save");
          localStorage.setItem("balhadj_farm_v2_last_backup_at", String(now));
        }
        Store.set(S);
        if (!isHydratingRemoteState) {
          pushStateToCloud(false);
        }
      }

      function getActiveFlock() {
        return S.flock.filter((b) => b.active);
      }
      function getProducingFlock() {
        return S.flock.filter((b) => {
          const stage = getBirdStage(b).label;
          return b.active && (stage === "إنتاج" || stage === "بداية إنتاج" || b.ageCategory === "producing");
        });
      }

      /* ============================================================
   RENDER ROUTER
============================================================ */
      function renderPage(page) {
        const r = {
          dashboard: renderDashboard,
          flock: renderFlockPage,
          production: renderProductionPage,
          feed: renderFeedPage,
          incubation: renderIncubationPage,
          health: renderHealthPage,
          financials: renderFinancialsPage,
          care: renderCarePage,
          product: renderProductPage,
          settings: renderSettingsPage,
        };
        try {
          if (r[page]) r[page]();
          updateWeatherUI();
          updateNavBadges();
        } catch (err) {
          console.error("Render error", page, err);
          recordSystemError(`render:${page}`, err);
          toast(`حدث خطأ أثناء فتح صفحة ${PAGE_TITLES[page] || page}`, "error");
        }
      }

      function updateNavBadges() {
        const alerts = getAlerts();
        const badgeAlerts = document.getElementById("badge-alerts");
        if (badgeAlerts) {
          if (alerts.length > 0) {
            badgeAlerts.textContent = alerts.length;
            badgeAlerts.classList.add("show");
          } else badgeAlerts.classList.remove("show");
        }
        const feedDays = calcFeedDays();
        const badgeFeed = document.getElementById("badge-feed");
        if (badgeFeed) {
          if (feedDays < (S.settings.lowFeedThresholdDays || 10))
            badgeFeed.classList.add("show");
          else badgeFeed.classList.remove("show");
        }
      }

      function getAlerts() {
        const alerts = [];
        const feedDays = calcFeedDays();
        if (feedDays < 5)
          alerts.push({
            type: "danger",
            msg: `العلف سينتهي خلال ${feedDays} أيام فقط! يجب التزود فوراً.`,
          });
        else if (feedDays < 10)
          alerts.push({
            type: "warning",
            msg: `تنبيه: العلف سينتهي خلال ${feedDays} أيام.`,
          });
        S.healthRecords.forEach((h) => {
          if (!h.nextDate) return;
          const days = daysUntil(h.nextDate);
          if (days != null && days >= 0 && days <= 3)
            alerts.push({
              type: "warning",
              msg: `موعد ${h.medicine} خلال ${days} يوم!`,
            });
          else if (days != null && days < 0)
            alerts.push({
              type: "info",
              msg: `موعد ${h.medicine} مضى (${Math.abs(days)} يوم)`,
            });
        });
        S.coopCleaning.forEach((record) => {
          if (!record.nextDate) return;
          const days = daysUntil(record.nextDate);
          if (days != null && days < 0)
            alerts.push({
              type: "danger",
              msg: `تنظيف ${record.coop} متأخر منذ ${Math.abs(days)} يوم.`,
            });
          else if (days != null && days <= 1)
            alerts.push({
              type: "warning",
              msg: `تنظيف ${record.coop} ${days === 0 ? "اليوم" : "غدًا"}.`,
            });
        });
        S.incubations
          .filter((batch) => batch.status === "incubating")
          .forEach((batch) => {
            const due = daysUntil(batch.expectedDate);
            if (due != null && due <= 2 && due >= 0) {
              alerts.push({
                type: "info",
                msg: `دفعة ${batch.id} على بُعد ${due} يوم من الفقس المتوقع.`,
              });
            }
          });
        getWeatherAdvice()
          .filter((item) => item.type !== "success")
          .slice(0, 2)
          .forEach((item) => {
            alerts.push({
              type: item.type === "danger" ? "danger" : "info",
              msg: `${item.title}: ${item.text}`,
            });
          });
        return alerts;
      }

      function calcFeedDays() {
        const active = getActiveFlock().length;
        if (!active) return 999;
        const totalFeed = S.feedStock.reduce((s, f) => s + f.balance, 0);
        const dailyUse = active * S.settings.feedRate;
        return dailyUse > 0 ? Math.floor(totalFeed / dailyUse) : 999;
      }

      function renderNotificationCenter() {
        const box = document.getElementById("notification-center");
        if (!box) return;
        const items = getNotificationCenterItems();
        if (!items.length) {
          box.innerHTML = '<div class="empty-box">لا توجد تنبيهات حالية.</div>';
          return;
        }
        box.innerHTML = `<div class="mini-list">${items
          .map(
            (item) => `
              <div class="mini-list-item">
                <div class="mini-list-head"><strong>${item.title}</strong><span class="badge ${
                  item.level === "danger"
                    ? "badge-red"
                    : item.level === "warning"
                      ? "badge-amber"
                      : item.level === "success"
                        ? "badge-green"
                        : "badge-cyan"
                }">${item.when}</span></div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function renderDailyTasks() {
        const box = document.getElementById("daily-tasks");
        if (!box) return;
        const tasks = S.savedTasks
          .filter((task) => task.status !== "done")
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
          .slice(0, 8);
        if (!tasks.length) {
          box.innerHTML = '<div class="empty-box">لا توجد مهام مفتوحة اليوم.</div>';
          return;
        }
        box.innerHTML = `<div class="task-list">${tasks
          .map(
            (task) => `
              <div class="task-item">
                <div class="task-item-head">
                  <strong>${task.title}</strong>
                  <span class="badge ${
                    task.priority === "danger"
                      ? "badge-red"
                      : task.priority === "warning"
                        ? "badge-amber"
                        : "badge-cyan"
                  }">${task.category || "مهمة"}</span>
                </div>
                <div class="task-meta">${task.date ? fmtDate(task.date) : "بدون تاريخ"} | الحالة: ${
                  task.status === "done" ? "منجزة" : task.status === "skipped" ? "مؤجلة" : "قيد المتابعة"
                }</div>
                <div class="task-actions">
                  <button class="btn btn-xs btn-primary" onclick="markTaskStatus('${task.id}', 'done')">تم</button>
                  <button class="btn btn-xs btn-secondary" onclick="markTaskStatus('${task.id}', 'skipped')">تأجيل</button>
                </div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function renderAgendaCalendar() {
        const box = document.getElementById("agenda-calendar");
        if (!box) return;
        const agenda = getUpcomingAgenda();
        const start = new Date();
        start.setDate(1);
        const month = start.getMonth();
        const year = start.getFullYear();
        const firstWeekDay = (start.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstWeekDay; i++) cells.push('<div class="calendar-cell"></div>');
        for (let day = 1; day <= daysInMonth; day++) {
          const iso = new Date(year, month, day).toISOString().split("T")[0];
          const events = agenda.filter((item) => item.date === iso);
          const isToday = iso === todayStr();
          cells.push(`
            <div class="calendar-cell ${isToday ? "today" : ""}">
              <div class="calendar-date">${day}</div>
              ${events
                .slice(0, 3)
                .map(
                  (event) =>
                    `<span class="calendar-event ${
                      event.type === "لقاح"
                        ? "health"
                        : event.type === "تنظيف"
                          ? "care"
                          : event.type === "تفقيس"
                            ? "incubation"
                            : "task"
                    }">${event.type}: ${event.label}</span>`,
                )
                .join("")}
            </div>`);
        }
        box.innerHTML = `<div class="calendar-days">${cells.join("")}</div>`;
      }

      function renderDecisionAssistant() {
        const box = document.getElementById("decision-assistant");
        if (!box) return;
        const insights = [];
        const feedDays = calcFeedDays();
        const overdueCleaning = S.coopCleaning.filter(
          (record) => record.nextDate && daysUntil(record.nextDate) < 0,
        ).length;
        const mortality = getMonthlyMortality();
        const activeIncubations = S.incubations.filter(
          (batch) => batch.status === "incubating",
        ).length;
        const recentProduction = [...S.production]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 7);
        const avgRecent =
          recentProduction.length > 0
            ? recentProduction.reduce((sum, entry) => sum + entry.total, 0) /
              recentProduction.length
            : 0;
        const weatherAdvice = getWeatherAdvice();

        if (feedDays <= 5) {
          insights.push({
            level: "danger",
            title: "تحرك سريع للعلف",
            body: `المخزون الحالي يكفي تقريبًا ${feedDays} أيام فقط. الأفضل تجهيز التزويد اليوم قبل أن يتأثر التشغيل.`,
          });
        } else if (feedDays <= (S.settings.lowFeedThresholdDays || 10)) {
          insights.push({
            level: "warning",
            title: "جدولة تموين قريب",
            body: `العلف دخل نطاق التنبيه (${feedDays} أيام). نسق مع الموردين وجهّز الدفعة التالية مبكرًا.`,
          });
        }

        if (weatherAdvice.length) {
          insights.push({
            level: weatherAdvice[0].type || "info",
            title: weatherAdvice[0].title,
            body:
              weatherAdvice[0].details?.[0] ||
              "راجع نصائح الطقس في صفحة الخم والوقاية.",
          });
        }

        if (overdueCleaning > 0) {
          insights.push({
            level: "warning",
            title: "تنظيفات متأخرة",
            body: `يوجد ${overdueCleaning} خم متأخر عن موعد التنظيف، وهذا يستحق متابعة سريعة لتقليل الرطوبة وخطر الأمراض.`,
          });
        }

        if (mortality > 0) {
          insights.push({
            level: "danger",
            title: "راجع أسباب النفوق",
            body: `سُجل هذا الشهر ${mortality} حالة نفوق. راجع الماء والتهوية والسجل الصحي والطقس معًا لاكتشاف السبب الأقرب.`,
          });
        }

        if (activeIncubations > 0) {
          insights.push({
            level: "info",
            title: "متابعة دفعات التفقيس",
            body: `لديك ${activeIncubations} دفعة تفقيس نشطة. لا تؤجل إدخال قراءات الحرارة والرطوبة اليومية.`,
          });
        }

        if (avgRecent > 0) {
          insights.push({
            level: "success",
            title: "خط أساس الإنتاج",
            body: `متوسط آخر 7 أيام هو ${avgRecent.toFixed(1)} بيضة يوميًا. استخدمه كمرجع قبل تقييم أي هبوط جديد.`,
          });
        }

        if (!insights.length) {
          insights.push({
            level: "info",
            title: "الوضع مستقر",
            body: "لا توجد إشارات حرجة حاليًا. واصل التسجيل اليومي ومراجعة المهام والتنبيهات للحفاظ على هذا الاستقرار.",
          });
        }

        box.innerHTML = `<div class="mini-list">${insights
          .slice(0, 6)
          .map(
            (insight) => `
              <div class="mini-list-item">
                <div class="mini-list-head">
                  <strong>${insight.title}</strong>
                  <span class="badge ${
                    insight.level === "danger"
                      ? "badge-red"
                      : insight.level === "warning"
                        ? "badge-amber"
                        : insight.level === "success"
                          ? "badge-green"
                          : "badge-cyan"
                  }">${
                    insight.level === "danger"
                      ? "حرج"
                      : insight.level === "warning"
                        ? "تنبيه"
                        : insight.level === "success"
                          ? "جيد"
                          : "معلومة"
                  }</span>
                </div>
                <div class="mini-meta">${insight.body}</div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function getProductReadinessChecklist() {
        return [
          {
            label: "لوحة تشغيل يومية مع تنبيهات ومهام",
            state: "ready",
            detail: "جاهزة داخل النسخة الحالية ويمكن عرضها للمستخدمين التجريبيين مباشرة.",
          },
          {
            label: "PWA قابلة للتثبيت على الهاتف",
            state: "ready",
            detail: "أضفنا manifest وservice worker وتثبيتًا مباشرًا من المتصفح.",
          },
          {
            label: "نسخ احتياطي محلي وسجل نشاط",
            state: "ready",
            detail: "يوجد حفظ محلي ونسخ احتياطية وسجل للعمليات الحساسة.",
          },
          {
            label: "حسابات منفصلة حقيقية لكل مزرعة",
            state: "next",
            detail: "هذه هي الخطوة التجارية الكبيرة التالية، وتحتاج backend وقاعدة بيانات ومصادقة.",
          },
          {
            label: "بيع باشتراك أو شراء مرة واحدة",
            state: "pilot",
            detail: "منطقي جدًا لهذا المنتج، ويمكن البدء بعرض تجريبي ثم التوسع إلى اشتراك كامل.",
          },
        ];
      }

      function getProductReleaseChecklist() {
        return [
          {
            label: "إطلاق ويب تجريبي محمي",
            state: "pilot",
            detail: "نوصي بمرحلة تجربة مغلقة مع 3 إلى 5 مزارع محلية أولًا.",
          },
          {
            label: "ربط الحسابات وقاعدة البيانات",
            state: "next",
            detail: "أفضل أساس تجاري قبل البيع العام أو مشاركة الروابط مع العملاء.",
          },
          {
            label: "نسخة هاتفية React Native / Expo",
            state: "next",
            detail: "النسخة الحالية تساعدنا على تحديد الشاشات الأساسية للتطبيق قبل التطوير الأصلي.",
          },
          {
            label: "نشر Play Store وApp Store",
            state: "later",
            detail: "يأتي بعد تثبيت الحسابات وسياسة الخصوصية وحذف الحساب والمزامنة السحابية.",
          },
        ];
      }

      function renderChecklist(containerId, items) {
        const box = document.getElementById(containerId);
        if (!box) return;
        box.innerHTML = `<div class="checklist-stack">${items
          .map(
            (item) => `
              <div class="checklist-item">
                <div class="mini-list-head">
                  <strong>${item.label}</strong>
                  <span class="badge ${
                    item.state === "ready"
                      ? "badge-green"
                      : item.state === "pilot"
                        ? "badge-cyan"
                        : item.state === "next"
                          ? "badge-amber"
                          : "badge-gray"
                  }">${
                    item.state === "ready"
                      ? "جاهز"
                      : item.state === "pilot"
                        ? "تجريبي"
                        : item.state === "next"
                          ? "التالي"
                          : "لاحقًا"
                  }</span>
                </div>
                <div class="mini-meta">${item.detail}</div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function updateProductScenario() {
        const model = document.getElementById("product-pricing-model")?.value || "monthly";
        const customers = parseInt(document.getElementById("product-customer-count")?.value, 10) || 0;
        const price = parseFloat(document.getElementById("product-plan-price")?.value) || 0;
        const retention = parseFloat(document.getElementById("product-retention")?.value) || 0;
        const summary = document.getElementById("product-scenario-summary");
        if (!summary) return;
        const annualMultiplier = model === "monthly" ? 12 : 1;
        const firstYearRevenue = model === "lifetime" ? customers * price : customers * price * annualMultiplier;
        const retainedCustomers = Math.round(customers * (retention / 100));
        const secondYearRevenue = model === "lifetime" ? 0 : retainedCustomers * price * annualMultiplier;
        const label =
          model === "monthly"
            ? "اشتراك شهري"
            : model === "annual"
              ? "اشتراك سنوي"
              : "شراء مدى الحياة";
        summary.innerHTML = `
          <div class="metric-grid">
            <div class="metric-card">
              <div class="metric-label">النموذج المختار</div>
              <div class="metric-value">${label}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">دخل السنة الأولى</div>
              <div class="metric-value">${fmtNum(firstYearRevenue)} دج</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">العملاء المتوقع بقاؤهم</div>
              <div class="metric-value">${retainedCustomers}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">دخل السنة الثانية</div>
              <div class="metric-value">${fmtNum(secondYearRevenue)} دج</div>
            </div>
          </div>
          <div class="field-note">التقدير مبسط، لكنه يساعدك على مقارنة الاشتراك الشهري والسنوي مع البيع مرة واحدة قبل اتخاذ قرار التسعير.</div>
        `;
      }

      function renderProductPage() {
        const kpiBox = document.getElementById("product-kpis");
        if (kpiBox) {
          const readiness = getProductReadinessChecklist();
          const readyCount = readiness.filter((item) => item.state === "ready").length;
          const nextCount = readiness.filter((item) => item.state === "next").length;
          const backupCount = getBackupIndex().length;
          const customers = Math.max(S.customers.length, 3);
          kpiBox.innerHTML = `
            <div class="kpi kpi-green">
              <div class="kpi-accent-bar"></div>
              <div class="kpi-top"><div class="kpi-label">جاهزية التشغيل</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6L9 17l-5-5"/></svg></div></div>
              <div class="kpi-value">${readyCount}<span class="kpi-unit">محور</span></div>
              <div class="kpi-trend">جاهزة للتجربة الميدانية الآن</div>
            </div>
            <div class="kpi kpi-amber">
              <div class="kpi-accent-bar"></div>
              <div class="kpi-top"><div class="kpi-label">خطوات ما قبل البيع</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg></div></div>
              <div class="kpi-value">${nextCount}<span class="kpi-unit">خطوة</span></div>
              <div class="kpi-trend">أهمها الحسابات وقاعدة البيانات</div>
            </div>
            <div class="kpi kpi-cyan">
              <div class="kpi-accent-bar"></div>
              <div class="kpi-top"><div class="kpi-label">نسخ احتياطية محلية</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div></div>
              <div class="kpi-value">${backupCount}<span class="kpi-unit">نسخة</span></div>
              <div class="kpi-trend">جاهزة قبل كل تسليم أو تجربة</div>
            </div>
            <div class="kpi kpi-purple">
              <div class="kpi-accent-bar"></div>
              <div class="kpi-top"><div class="kpi-label">عملاء تجريبيون مقترحون</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div></div>
              <div class="kpi-value">${customers}<span class="kpi-unit">مزرعة</span></div>
              <div class="kpi-trend">ابدأ بدفعة صغيرة ثم وسّع</div>
            </div>
          `;
        }

        const planBox = document.getElementById("product-plan-grid");
        if (planBox) {
          planBox.innerHTML = PRODUCT_PLANS.map(
            (plan) => `
              <div class="plan-card">
                <div class="mini-list-head">
                  <strong>${plan.name}</strong>
                  <span class="badge ${plan.badgeClass}">${plan.cadence}</span>
                </div>
                <div class="plan-price">${fmtNum(plan.price)} <span>دج</span></div>
                <div class="mini-meta">${plan.highlight}</div>
              </div>`,
          ).join("");
        }

        renderChecklist("product-readiness-list", getProductReadinessChecklist());
        renderChecklist("product-release-checklist", getProductReleaseChecklist());

        const pwaBox = document.getElementById("pwa-status-summary");
        if (pwaBox) {
          pwaBox.innerHTML = `<strong>وضع التطبيق:</strong> ${
            isStandaloneMode()
              ? "مثبت ويعمل كوضع تطبيق مستقل على هذا الجهاز."
              : deferredInstallPrompt
                ? "جاهز للتثبيت من المتصفح الحالي."
                : "يعمل من المتصفح مباشرة ويمكن تحويله إلى تطبيق محمول."
          }`;
        }
        const mobileBox = document.getElementById("mobile-readiness-summary");
        if (mobileBox) {
          mobileBox.innerHTML =
            "<strong>جاهزية الهاتف:</strong> الواجهة الحالية متجاوبة وتصلح كقاعدة ممتازة قبل بناء تطبيق أصلي عبر Expo / React Native.";
        }
        const deployBox = document.getElementById("deployment-target-summary");
        if (deployBox) {
          deployBox.innerHTML =
            "<strong>خطوة البيع التالية:</strong> ربط الحسابات الحقيقية وقاعدة البيانات ثم رفع الويب على استضافة وربط نفس البيانات بتطبيق الهاتف.";
        }

        updateProductScenario();
      }

      function getNotificationCenterItems() {
        const items = getAlerts().map((alert, index) => ({
          id: `AL-${index + 1}`,
          level: alert.type,
          title: alert.msg,
          when: "الآن",
        }));
        S.savedTasks
          .filter((task) => task.status !== "done")
          .slice(0, 4)
          .forEach((task) => {
            items.push({
              id: task.id,
              level: task.priority || "info",
              title: task.title,
              when: task.date ? fmtDate(task.date) : "بدون تاريخ",
            });
          });
        return items.slice(0, 8);
      }

      function getUpcomingAgenda() {
        const agenda = [];
        S.healthRecords.forEach((record) => {
          if (!record.nextDate) return;
          agenda.push({
            date: record.nextDate,
            type: "لقاح",
            label: record.medicine,
          });
        });
        S.coopCleaning.forEach((record) => {
          if (!record.nextDate) return;
          agenda.push({
            date: record.nextDate,
            type: "تنظيف",
            label: `${record.coop} - ${getCleaningKindLabel(record.kind)}`,
          });
        });
        S.incubations
          .filter((batch) => batch.status === "incubating")
          .forEach((batch) => {
            agenda.push({
              date: batch.expectedDate,
              type: "تفقيس",
              label: `${batch.id} - ${batch.breed}`,
            });
          });
        S.savedTasks.forEach((task) => {
          if (!task.date) return;
          agenda.push({
            date: task.date,
            type: "مهمة",
            label: task.title,
          });
        });
        return agenda.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20);
      }

      function buildTodayTasks() {
        const tasks = [];
        const lowFeedDays = calcFeedDays();
        if (lowFeedDays <= (S.settings.lowFeedThresholdDays || 10)) {
          tasks.push({
            id: `TASK-FEED-${todayStr()}`,
            title: "مراجعة مخزون العلف",
            date: todayStr(),
            category: "feed",
            priority: lowFeedDays <= 3 ? "danger" : "warning",
            status: "pending",
          });
        }
        S.healthRecords.forEach((record) => {
          const diff = daysUntil(record.nextDate);
          if (record.nextDate && diff != null && diff <= 2) {
            tasks.push({
              id: `TASK-VAC-${record.id}`,
              title: `متابعة ${record.medicine}`,
              date: record.nextDate,
              category: "health",
              priority: diff < 0 ? "danger" : "warning",
              status: "pending",
            });
          }
        });
        S.coopCleaning.forEach((record) => {
          const diff = daysUntil(record.nextDate);
          if (record.nextDate && diff != null && diff <= 1) {
            tasks.push({
              id: `TASK-COOP-${record.id}`,
              title: `تنظيف ${record.coop}`,
              date: record.nextDate,
              category: "care",
              priority: diff < 0 ? "danger" : "info",
              status: "pending",
            });
          }
        });
        return tasks;
      }

      function syncDerivedTasks() {
        const derived = buildTodayTasks();
        const manual = S.savedTasks.filter((task) => !String(task.id).startsWith("TASK-"));
        const currentStatuses = new Map(
          S.savedTasks.map((task) => [task.id, task.status || "pending"]),
        );
        S.savedTasks = [
          ...manual,
          ...derived.map((task) => ({
            ...task,
            status: currentStatuses.get(task.id) || task.status,
          })),
        ];
      }

      function markTaskStatus(taskId, status) {
        const task = S.savedTasks.find((item) => item.id === taskId);
        if (!task) return;
        task.status = status;
        recordActivity("task-status", `تم تحديث المهمة ${task.title} إلى ${status}`, "task", taskId);
        save();
        renderPage(currentPage);
      }

      function runGlobalSearch(query) {
        const term = String(query || "").trim().toLowerCase();
        if (!term) return [];
        const results = [];
        S.flock.forEach((bird) => {
          const hay = [bird.id, bird.nickname, bird.breed, bird.pen].join(" ").toLowerCase();
          if (hay.includes(term))
            results.push({
              page: "flock",
              label: `طير: ${bird.id}${bird.nickname ? " - " + bird.nickname : ""}`,
              sub: `${bird.breed} | ${bird.pen || "بدون خم"}`,
            });
        });
        S.hatchChicks.forEach((chick) => {
          const hay = [chick.id, chick.breed, chick.sourceBatchId].join(" ").toLowerCase();
          if (hay.includes(term))
            results.push({
              page: "incubation",
              label: `صوص: ${chick.id}`,
              sub: `${chick.breed} | ${chick.status}`,
            });
        });
        S.incubations.forEach((batch) => {
          const hay = [batch.id, batch.breed, batch.source].join(" ").toLowerCase();
          if (hay.includes(term))
            results.push({
              page: "incubation",
              label: `دفعة تفقيس: ${batch.id}`,
              sub: `${batch.breed} | ${batch.status}`,
            });
        });
        S.healthRecords.forEach((record) => {
          const hay = [record.medicine, record.notes, record.targetDetail].join(" ").toLowerCase();
          if (hay.includes(term))
            results.push({
              page: "health",
              label: `سجل صحي: ${record.medicine}`,
              sub: `${fmtDate(record.date)} | ${record.type}`,
            });
        });
        S.feedStock.forEach((feed) => {
          const hay = [feed.type, feed.supplier, feed.notes].join(" ").toLowerCase();
          if (hay.includes(term))
            results.push({
              page: "feed",
              label: `علف: ${feed.type}`,
              sub: `${feed.balance} ${feed.unit === "package" ? "حزمة" : "كغ"}`,
            });
        });
        S.sales.forEach((sale) => {
          const hay = [sale.buyer, sale.date].join(" ").toLowerCase();
          if (hay.includes(term))
            results.push({
              page: "financials",
              label: `بيع: ${sale.buyer || "بدون اسم"}`,
              sub: `${fmtDate(sale.date)} | ${fmtNum(sale.total)} دج`,
            });
        });
        return results.slice(0, 20);
      }

      /* ============================================================
   DASHBOARD
============================================================ */
      function renderDashboard() {
        const active = getActiveFlock();
        const producing = getProducingFlock();
        const todayProd = S.production.find((p) => p.date === todayStr());
        const last30 = [...S.production]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-30);
        const totalEggs = S.production.reduce((s, p) => s + p.total, 0);
        const totalFeed = S.feedStock.reduce((s, f) => s + f.balance, 0);
        const eggStock = recalcEggStock(S.production);
        const thisMonthSales = S.sales
          .filter((s) =>
            s.date.startsWith(new Date().toISOString().slice(0, 7)),
          )
          .reduce((a, s) => a + s.total, 0);
        const thisMonthExp = S.expenses
          .filter((e) =>
            e.date.startsWith(new Date().toISOString().slice(0, 7)),
          )
          .reduce((a, e) => a + e.amount, 0);
        const profit = thisMonthSales - thisMonthExp;
        const weather = S.settings.weather || {};
        const location = S.settings.location || {};
        const advice = getWeatherAdvice()[0];
        const activeIncubations = S.incubations.filter(
          (batch) => batch.status === "incubating",
        ).length;

        // KPIs
        document.getElementById("dash-kpis").innerHTML = `
    <div class="kpi kpi-green">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">القطيع النشط</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      </div>
      <div class="kpi-value">${active.length}<span class="kpi-unit">طير</span></div>
      <div class="kpi-trend">${producing.length} في مرحلة الإنتاج</div>
    </div>
    <div class="kpi kpi-amber">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إنتاج اليوم</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg></div>
      </div>
      <div class="kpi-value">${todayProd ? todayProd.total : "--"}<span class="kpi-unit">${todayProd ? "بيضة" : ""}</span></div>
      <div class="kpi-trend">${todayProd ? "نسبة: " + (producing.length > 0 ? ((todayProd.total / producing.length) * 100).toFixed(1) + "%" : "--") : "لم يُسجَّل بعد"}</div>
    </div>
    <div class="kpi kpi-cyan">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">مخزون العلف</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
      </div>
      <div class="kpi-value">${fmtNum(totalFeed, 1)}<span class="kpi-unit">كغ</span></div>
      <div class="kpi-trend">${calcFeedDays()} يوم متبقي تقريباً</div>
    </div>
    <div class="kpi ${profit >= 0 ? "kpi-green" : "kpi-red"}">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">ربح هذا الشهر</div>
        <div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      </div>
      <div class="kpi-value">${fmtNum(Math.abs(profit))}<span class="kpi-unit">دج</span></div>
      <div class="kpi-trend">${profit >= 0 ? "صافي ربح" : "خسارة صافية"} | إيراد: ${fmtNum(thisMonthSales)} دج</div>
    </div>
  `;

        // Alerts
        const alerts = getAlerts();
        const alertHtml = alerts
          .map(
            (a) => `
    <div class="alert alert-${a.type}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${a.msg}
    </div>`,
          )
          .join("");
        document.getElementById("dash-alerts").innerHTML = alertHtml;

        // Summary
        const avgProd =
          last30.length > 0
            ? (last30.reduce((s, p) => s + p.total, 0) / last30.length).toFixed(
                1,
              )
            : "--";
        document.getElementById("dash-summary").innerHTML = `
    <div class="stat-row"><span class="stat-row-label">المدينة والطقس</span><span class="stat-row-value">${location.enabled ? `${location.city || "غير محدد"} | ${weather.temperature ?? "--"}°C` : "غير مفعل"}</span></div>
    <div class="stat-row"><span class="stat-row-label">إجمالي البيض المنتج</span><span class="stat-row-value stat-value-accent">${fmtNum(totalEggs)} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">المتاح من البيض</span><span class="stat-row-value stat-value-cyan">${eggStock.available} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">متوسط الإنتاج اليومي</span><span class="stat-row-value">${avgProd} بيضة/يوم</span></div>
    <div class="stat-row"><span class="stat-row-label">FCR (كفاءة تحويل العلف)</span><span class="stat-row-value stat-value-cyan">${calcFCR()}</span></div>
    <div class="stat-row"><span class="stat-row-label">دفعات التفقيس النشطة</span><span class="stat-row-value">${activeIncubations}</span></div>
    <div class="stat-row"><span class="stat-row-label">أولوية الطقس</span><span class="stat-row-value">${advice.title}</span></div>
    <div class="stat-row"><span class="stat-row-label">نفوق هذا الشهر</span><span class="stat-row-value stat-value-red">${getMonthlyMortality()} طير</span></div>
    <div class="stat-row"><span class="stat-row-label">أيام تسجيل</span><span class="stat-row-value">${S.production.length} يوم</span></div>
    <div class="stat-row"><span class="stat-row-label">تكلفة البيضة الواحدة</span><span class="stat-row-value stat-value-amber">${calcCostPerEgg()} دج</span></div>
  `;

        // Production line chart
        const lineLabels = last30.map((p) => p.date.slice(5));
        const lineData = last30.map((p) => p.total);
        mkChart("chart-prod-line", {
          type: "line",
          data: {
            labels: lineLabels,
            datasets: [
              {
                label: "البيض اليومي",
                data: lineData,
                borderColor: "#22c55e",
                backgroundColor: "rgba(22,163,74,.08)",
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4,
              },
            ],
          },
          options: {
            ...chartDefaults,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { ...chartDefaults.plugins, legend: { display: false } },
          },
        });

        // Flock donut
        const breedMap = {};
        getActiveFlock().forEach((b) => {
          breedMap[b.breed] = (breedMap[b.breed] || 0) + 1;
        });
        mkChart("chart-flock-donut", {
          type: "doughnut",
          data: {
            labels: Object.keys(breedMap),
            datasets: [
              {
                data: Object.values(breedMap),
                backgroundColor: [
                  "rgba(22,163,74,.7)",
                  "rgba(8,145,178,.7)",
                  "rgba(217,119,6,.7)",
                  "rgba(124,58,237,.7)",
                  "rgba(220,38,38,.7)",
                ],
                borderColor: "transparent",
                hoverOffset: 6,
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "bottom",
                labels: {
                  color: "#94a3b8",
                  font: { family: "Tajawal", size: 12 },
                  padding: 12,
                  boxWidth: 12,
                },
              },
              tooltip: { ...chartDefaults.plugins.tooltip },
            },
          },
        });

        // Breed bar chart
        const breedProd = {};
        S.production.forEach((p) => {
          // approximate by matching flock
        });
        const breedKeys = Object.keys(breedMap);
        const breedData = breedKeys.map((b) => {
          const count = breedMap[b] || 0;
          const last7 = [...S.production]
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-7);
          const avg =
            last7.length > 0
              ? last7.reduce((s, p) => s + p.total, 0) / last7.length
              : 0;
          const activeSameBreed = getActiveFlock().filter(
            (bird) => bird.breed === b,
          ).length;
          const total = getActiveFlock().length;
          return total > 0 ? Math.round((avg * activeSameBreed) / total) : 0;
        });
        mkChart("chart-breed-bar", {
          type: "bar",
          data: {
            labels: breedKeys,
            datasets: [
              {
                label: "متوسط بيض/يوم",
                data: breedData,
                backgroundColor: [
                  "rgba(22,163,74,.6)",
                  "rgba(8,145,178,.6)",
                  "rgba(217,119,6,.6)",
                  "rgba(124,58,237,.6)",
                ],
                borderColor: "transparent",
                borderRadius: 6,
              },
            ],
          },
          options: {
            ...chartDefaults,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { ...chartDefaults.plugins, legend: { display: false } },
          },
        });
        renderNotificationCenter();
        renderDailyTasks();
        renderAgendaCalendar();
        renderDecisionAssistant();
      }

      function calcFCR() {
        const totalFeedUsed = S.feedStock.reduce(
          (s, f) =>
            s + Math.max(0, (f.kgEquivalent || f.qty || 0) - (f.balance || 0)),
          0,
        );
        const totalEggs = S.production.reduce((s, p) => s + p.total, 0);
        if (!totalEggs || !totalFeedUsed) return "--";
        return (totalFeedUsed / totalEggs).toFixed(3);
      }
      function calcCostPerEgg() {
        const totalExp = S.expenses.reduce((s, e) => s + e.amount, 0);
        const totalEggs = S.production.reduce((s, p) => s + p.total, 0);
        if (!totalEggs) return "--";
        return (totalExp / totalEggs).toFixed(2);
      }
      function getMonthlyMortality() {
        const m = new Date().toISOString().slice(0, 7);
        return S.flock.filter(
          (b) =>
            !b.active &&
            b.exitReason === "Mortality" &&
            b.exitDate &&
            b.exitDate.startsWith(m),
        ).length;
      }

      /* ============================================================
   FLOCK PAGE
============================================================ */
      let flockPage = 1;
      const FLOCK_PER_PAGE = 20;

      function renderFlockPage() {
        const active = getActiveFlock();
        const producing = getProducingFlock();
        const stages = ["فرخ", "نامية", "إنتاج", "خارج إنتاج"];
        const stageCounts = {};
        stages.forEach((s) => (stageCounts[s] = 0));
        S.flock
          .filter((b) => b.active)
          .forEach((b) => {
            const st = getBirdStage(b).label;
            stageCounts[st] = (stageCounts[st] || 0) + 1;
          });
        const exchangeCount = S.flock.filter(
          (b) => b.acquisitionType === "exchange",
        ).length;

        document.getElementById("flock-kpis").innerHTML = `
    <div class="kpi kpi-green">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">القطيع النشط</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div></div>
      <div class="kpi-value">${active.length}<span class="kpi-unit">طير</span></div>
      <div class="kpi-trend">${producing.length} في مرحلة الإنتاج الآن</div>
    </div>
    <div class="kpi kpi-amber">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">مرحلة الإنتاج</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg></div></div>
      <div class="kpi-value">${stageCounts["إنتاج"] || 0}<span class="kpi-unit">طير</span></div>
      <div class="kpi-trend">نامية: ${stageCounts["نامية"] || 0} | فرخ: ${stageCounts["فرخ"] || 0}</div>
    </div>
    <div class="kpi kpi-red">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إجمالي النفوق</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></div></div>
      <div class="kpi-value">${S.flock.filter((b) => b.exitReason === "Mortality").length}<span class="kpi-unit">طير</span></div>
      <div class="kpi-trend">هذا الشهر: ${getMonthlyMortality()} طير</div>
    </div>
    <div class="kpi kpi-cyan">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إجمالي الطيور</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div></div>
      <div class="kpi-value">${S.flock.length}<span class="kpi-unit">طير</span></div>
      <div class="kpi-trend">مغادر: ${S.flock.filter((b) => !b.active).length} | تبادل: ${exchangeCount}</div>
    </div>
  `;
        renderFlockTable();
      }

      function renderFlockTable() {
        const search =
          (document.getElementById("flock-search") || {}).value || "";
        const filterBreed =
          (document.getElementById("flock-filter-breed") || {}).value || "";
        const filterStage =
          (document.getElementById("flock-filter-stage") || {}).value || "";
        const filterStatus =
          (document.getElementById("flock-filter-status") || {}).value ||
          "active";

        let birds = [...S.flock];
        if (filterStatus === "active") birds = birds.filter((b) => b.active);
        else if (filterStatus === "exited")
          birds = birds.filter((b) => !b.active);
        if (filterBreed) birds = birds.filter((b) => b.breed === filterBreed);
        if (filterStage)
          birds = birds.filter((b) => getBirdStage(b).label === filterStage);
        if (search)
          birds = birds.filter(
            (b) =>
              b.id.toLowerCase().includes(search.toLowerCase()) ||
              (b.pen || "").includes(search),
          );

        const total = birds.length;
        const pages = Math.ceil(total / FLOCK_PER_PAGE);
        if (flockPage > pages && pages > 0) flockPage = pages;
        const slice = birds.slice(
          (flockPage - 1) * FLOCK_PER_PAGE,
          flockPage * FLOCK_PER_PAGE,
        );

        const exitReasonMap = {
          Mortality: "نفوق",
          Sold: "بيع",
          Slaughtered: "ذبح",
          Exchanged: "تبادل",
        };
        const tbody = document.getElementById("flock-tbody");
        if (!slice.length) {
          tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>لا توجد نتائج</td></tr>`;
        } else {
          tbody.innerHTML = slice
            .map((b) => {
              const stage = getBirdStage(b);
              const activeCls = b.active ? "badge-green" : "badge-gray";
              const activeLbl = b.active
                ? "نشط"
                : exitReasonMap[b.exitReason] || "مغادر";
              return `<tr>
        <td>${b.image ? `<img src="${b.image}" alt="${b.id}" class="bird-thumb" />` : ""}<span class="bird-id-badge">${b.id}</span>${b.nickname ? `<div class="meta-inline">${b.nickname}</div>` : ""}</td>
        <td>${b.breed}${b.breed === "مختلط" && b.breedMixDetails ? `<div class="meta-inline">${b.breedMixDetails}</div>` : ""}</td>
        <td><span class="badge ${b.gender === "female" ? "badge-cyan" : "badge-purple"}">${b.gender === "female" ? "أنثى" : "ذكر"}</span></td>
        <td>${getBirdAgeDisplay(b)}</td>
        <td><span class="badge ${stage.cls}">${stage.label}</span></td>
        <td>${healthLabel(b.health)}</td>
        <td>${b.pen || "--"}</td>
        <td>${getAcquisitionLabel(b.acquisitionType)}${b.entryUnknown ? `<div class="meta-inline">تاريخ غير معروف</div>` : b.entry ? `<div class="meta-inline">${fmtDate(b.entry)}</div>` : ""}</td>
        <td><span class="badge ${activeCls}">${activeLbl}</span></td>
        <td class="action-cell">
          ${
            b.active
              ? `
            <button class="btn btn-xs btn-secondary" onclick="editBird('${b.id}')">تعديل</button>
            <button class="btn btn-xs btn-danger" onclick="triggerExitBird('${b.id}')">خروج</button>
          `
              : `<span class="meta-small">${fmtDate(b.exitDate)}</span>`
          }
        </td>
      </tr>`;
            })
            .join("");
        }

        renderPagination("flock-pagination", flockPage, pages, (p) => {
          flockPage = p;
          renderFlockTable();
        });
      }

      function calcBirdEggs(birdId) {
        return "--";
      }

      function showFlockExit() {
        // Switch to show only exited birds
        const sel = document.getElementById("flock-filter-status");
        if (sel) sel.value = "exited";
        renderFlockTable();
      }

      async function addBird() {
        if (!ensurePermission("flock")) return;
        const editId = document.getElementById("ab-edit-id").value;
        const breed = document.getElementById("ab-breed").value;
        const gender = document.getElementById("ab-gender").value;
        const nickname = document.getElementById("ab-nickname").value.trim();
        const breedMixDetails = document.getElementById("ab-mix-details").value.trim();
        const acquisitionType = document.getElementById("ab-acquisition").value;
        const acquisitionRef = document.getElementById("ab-exchange-bird").value;
        const entry = document.getElementById("ab-entry").value;
        const entryUnknown = document.getElementById("ab-entry-unknown").checked;
        const hatchDate = document.getElementById("ab-hatch").value;
        const ageCategory = document.getElementById("ab-age-category").value;
        const weight = document.getElementById("ab-weight").value;
        const pen = document.getElementById("ab-pen").value.trim();
        const health = document.getElementById("ab-health").value;
        const notes = document.getElementById("ab-notes").value.trim();
        const imageFile = document.getElementById("ab-image").files[0];
        const existingBird = editId
          ? S.flock.find((bird) => bird.id === editId)
          : null;

        if (!entryUnknown && !entry) {
          toast("الرجاء تحديد تاريخ الاقتناء", "error");
          return;
        }
        if (breed === "مختلط" && !breedMixDetails) {
          toast("حدد نوع الخلط بين السلالات", "error");
          return;
        }
        if (acquisitionType === "exchange" && !acquisitionRef) {
          toast("اختر الطير الذي سيخرج مقابل التبادل", "error");
          return;
        }
        if (acquisitionType === "hatching" && !hatchDate) {
          toast("الرجاء تحديد تاريخ الفقس", "error");
          return;
        }
        if (
          acquisitionType === "hatching" &&
          !entryUnknown &&
          new Date(hatchDate) > new Date(entry)
        ) {
          toast("تاريخ الفقس لا يمكن أن يكون بعد تاريخ الاقتناء", "error");
          return;
        }

        const id = existingBird
          ? existingBird.id
          : `BLH-${new Date().getFullYear()}-${String(++S.birdCounter).padStart(4, "0")}`;
        const image = imageFile
          ? await readImageAsDataUrl(imageFile)
          : existingBird?.image || "";

        if (acquisitionType === "exchange") {
          const exchangedBird = S.flock.find(
            (bird) => bird.id === acquisitionRef && bird.active,
          );
          if (exchangedBird) {
            exchangedBird.active = false;
            exchangedBird.exitReason = "Exchanged";
            exchangedBird.exitDate = todayStr();
            exchangedBird.exitNotes = `تم إخراجه مقابل إدخال ${id}`;
            recordActivity(
              "exchange-out",
              `إخراج الطير ${exchangedBird.id} مقابل إدخال ${id}`,
              "bird",
              exchangedBird.id,
            );
          }
        }

        const birdPayload = {
          id,
          breed,
          breedMixDetails,
          gender,
          nickname,
          image,
          acquisitionType,
          acquisitionRef,
          entry: entryUnknown ? "" : entry,
          entryUnknown,
          hatchDate: acquisitionType === "hatching" ? hatchDate : "",
          ageCategory: acquisitionType === "hatching" ? "chick" : ageCategory,
          weight: parseFloat(weight) || 0,
          pen,
          health,
          notes,
          active: existingBird ? existingBird.active : true,
          exitReason: existingBird ? existingBird.exitReason : null,
          exitDate: existingBird ? existingBird.exitDate : null,
          exitNotes: existingBird ? existingBird.exitNotes : "",
        };
        if (existingBird) Object.assign(existingBird, birdPayload);
        else S.flock.push(birdPayload);
        recordActivity(
          existingBird ? "update-bird" : "add-bird",
          existingBird
            ? `تحديث بيانات الطير ${id}`
            : `إضافة طير جديد ${id} (${breed})`,
          "bird",
          id,
        );
        save();
        closeModal("modal-add-bird");
        ["ab-weight", "ab-pen", "ab-notes", "ab-mix-details", "ab-nickname"].forEach((f) => {
          const el = document.getElementById(f);
          if (el) el.value = "";
        });
        document.getElementById("ab-image").value = "";
        document.getElementById("ab-entry-unknown").checked = false;
        document.getElementById("ab-acquisition").value = "purchase";
        document.getElementById("ab-breed").value = BREED_OPTIONS[0];
        document.getElementById("ab-entry").value = todayStr();
        document.getElementById("ab-hatch").value = todayStr();
        document.getElementById("ab-age-category").value = "chick";
        document.getElementById("ab-edit-id").value = "";
        document.getElementById("ab-submit-btn").textContent = "حفظ الطير";
        refreshBirdFormVisibility();
        populateExchangeBirdOptions();
        populateHenOptions();
        populateCleaningCoops();
        toast(
          (existingBird ? "تم تحديث بيانات الطير " : "تمت إضافة الطير ") + id,
          "success",
        );
        renderFlockPage();
      }

      function editBird(id) {
        if (!ensurePermission("flock")) return;
        const bird = S.flock.find((item) => item.id === id);
        if (!bird) return;
        document.getElementById("ab-edit-id").value = bird.id;
        document.getElementById("ab-breed").value = bird.breed || BREED_OPTIONS[0];
        document.getElementById("ab-gender").value = bird.gender || "female";
        document.getElementById("ab-nickname").value = bird.nickname || "";
        document.getElementById("ab-mix-details").value = bird.breedMixDetails || "";
        document.getElementById("ab-acquisition").value = bird.acquisitionType || "purchase";
        populateExchangeBirdOptions();
        document.getElementById("ab-exchange-bird").value = bird.acquisitionRef || "";
        document.getElementById("ab-entry-unknown").checked = !!bird.entryUnknown;
        document.getElementById("ab-entry").value = bird.entry || "";
        document.getElementById("ab-hatch").value = bird.hatchDate || todayStr();
        document.getElementById("ab-age-category").value = bird.ageCategory || "producing";
        document.getElementById("ab-weight").value = bird.weight || "";
        document.getElementById("ab-pen").value = bird.pen || "";
        document.getElementById("ab-health").value = bird.health || "healthy";
        document.getElementById("ab-notes").value = bird.notes || "";
        document.getElementById("ab-submit-btn").textContent = "تحديث الطير";
        refreshBirdFormVisibility();
        openModal("modal-add-bird");
      }

      function triggerExitBird(id) {
        if (!ensurePermission("flock")) return;
        const bird = S.flock.find((b) => b.id === id);
        if (!bird) return;
        document.getElementById("exit-bird-id").value = id;
        document.getElementById("exit-bird-display").textContent =
          id + " — " + bird.breed;
        document.getElementById("exit-date").value = todayStr();
        openModal("modal-exit-bird");
      }

      function confirmExitBird() {
        if (!ensurePermission("flock")) return;
        const id = document.getElementById("exit-bird-id").value;
        const reason = document.getElementById("exit-reason").value;
        const date = document.getElementById("exit-date").value;
        const notes = document.getElementById("exit-notes").value.trim();
        if (!date) {
          toast("الرجاء تحديد تاريخ الخروج", "error");
          return;
        }
        const bird = S.flock.find((b) => b.id === id);
        if (!bird) return;
        bird.active = false;
        bird.exitReason = reason;
        bird.exitDate = date;
        bird.exitNotes = notes;
        recordActivity(
          "exit-bird",
          `تسجيل خروج الطير ${id} بسبب ${reason}`,
          "bird",
          id,
        );
        save();
        populateExchangeBirdOptions();
        populateHenOptions();
        closeModal("modal-exit-bird");
        const reasonAr = { Mortality: "نفوق", Sold: "بيع", Slaughtered: "ذبح", Exchanged: "تبادل" };
        toast("تم تسجيل خروج " + id + " (" + reasonAr[reason] + ")", "warning");
        renderFlockPage();
      }

      /* ============================================================
   PRODUCTION PAGE
============================================================ */
      let prodPage = 1;
      const PROD_PER_PAGE = 20;

      function renderProductionPage() {
        const prods = [...S.production].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        const producing = getProducingFlock().length;
        const total = prods.reduce((s, p) => s + p.total, 0);
        const eggStock = recalcEggStock(prods);
        S.eggStock = eggStock;
        const last7 = prods.slice(0, 7);
        const avg7 =
          last7.length > 0
            ? (last7.reduce((s, p) => s + p.total, 0) / last7.length).toFixed(1)
            : "--";
        const todayProd = prods.find((p) => p.date === todayStr());
        const layRate =
          todayProd && producing > 0
            ? ((todayProd.total / producing) * 100).toFixed(1)
            : "--";

        document.getElementById("prod-kpis").innerHTML = `
    <div class="kpi kpi-amber"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إنتاج اليوم</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg></div></div>
      <div class="kpi-value">${todayProd ? todayProd.total : "--"}<span class="kpi-unit">بيضة</span></div>
      <div class="kpi-trend">${todayProd ? "تالف: " + todayProd.broken : "لم يُسجَّل بعد"}</div>
    </div>
    <div class="kpi kpi-green"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">نسبة الإنتاج</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div></div>
      <div class="kpi-value">${layRate}<span class="kpi-unit">${layRate != "--" ? "%" : ""}</span></div>
      <div class="kpi-trend">${producing} طير في الإنتاج</div>
    </div>
    <div class="kpi kpi-cyan"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">مخزون البيض</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg></div></div>
      <div class="kpi-value">${eggStock.available}<span class="kpi-unit">بيضة</span></div>
      <div class="kpi-trend">المتاح بعد البيع والإهداء والاستهلاك</div>
    </div>
    <div class="kpi kpi-purple"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">متوسط 7 أيام</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg></div></div>
      <div class="kpi-value">${avg7}<span class="kpi-unit">${avg7 != "--" ? "بيضة/يوم" : ""}</span></div>
      <div class="kpi-trend">إجمالي الإنتاج: ${fmtNum(total)} بيضة</div>
    </div>
  `;

        // Compare panel
        const yesterday = [...prods].filter((p) => p.date < todayStr())[0];
        const avg30 =
          prods.length > 0
            ? (
                prods.slice(0, 30).reduce((s, p) => s + p.total, 0) /
                Math.min(prods.length, 30)
              ).toFixed(1)
            : "--";
        document.getElementById("prod-compare").innerHTML = `
    <div class="stat-row"><span class="stat-row-label">اليوم</span><span class="stat-row-value stat-value-accent">${todayProd ? todayProd.total : "--"} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">أمس</span><span class="stat-row-value">${yesterday ? yesterday.total : "--"} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">متوسط 7 أيام</span><span class="stat-row-value">${avg7} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">متوسط 30 يوم</span><span class="stat-row-value">${avg30} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">أعلى يوم</span><span class="stat-row-value stat-value-amber">${prods.length ? Math.max(...prods.map((p) => p.total)) : 0} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">إجمالي تالف</span><span class="stat-row-value stat-value-red">${prods.reduce((s, p) => s + p.broken, 0)} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">مباع / مهدى / عائلة</span><span class="stat-row-value">${eggStock.sold} / ${eggStock.gifted} / ${eggStock.family}</span></div>
  `;

        // Full line chart
        const sorted = [...S.production].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        mkChart("chart-prod-full", {
          type: "line",
          data: {
            labels: sorted.map((p) => p.date.slice(5)),
            datasets: [
              {
                label: "إجمالي البيض",
                data: sorted.map((p) => p.total),
                borderColor: "#f59e0b",
                backgroundColor: "rgba(217,119,6,.07)",
                borderWidth: 2,
                pointRadius: 2.5,
                fill: true,
                tension: 0.4,
              },
              {
                label: "البيض التالف",
                data: sorted.map((p) => p.broken),
                borderColor: "rgba(220,38,38,.6)",
                backgroundColor: "transparent",
                borderWidth: 1.5,
                pointRadius: 1.5,
                fill: false,
                tension: 0.4,
                borderDash: [4, 3],
              },
            ],
          },
          options: {
            ...chartDefaults,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              ...chartDefaults.plugins,
              legend: {
                display: true,
                labels: {
                  color: "#94a3b8",
                  font: { family: "Tajawal", size: 11 },
                  boxWidth: 12,
                  padding: 10,
                },
              },
            },
          },
        });

        renderProdTable();
      }

      function renderProdTable() {
        const monthFilter =
          (document.getElementById("prod-filter-month") || {}).value || "";
        let prods = [...S.production].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        if (monthFilter)
          prods = prods.filter((p) => p.date.startsWith(monthFilter));

        const total = prods.length;
        const pages = Math.ceil(total / PROD_PER_PAGE);
        if (prodPage > pages && pages > 0) prodPage = pages;
        const slice = prods.slice(
          (prodPage - 1) * PROD_PER_PAGE,
          prodPage * PROD_PER_PAGE,
        );
        const producing = getProducingFlock().length;

        const tbody = document.getElementById("prod-tbody");
        if (!slice.length) {
          tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg>لا توجد سجلات إنتاج</td></tr>`;
        } else {
          tbody.innerHTML = slice
            .map((p) => {
              const lr = producing > 0 ? ((p.total / producing) * 100).toFixed(1) + "%" : "--";
              const eggDisplay = getEggSummaryDisplay(p);
              return `<tr>
        <td>${fmtDate(p.date)}</td>
        <td><strong class="text-accent-soft">${p.total}</strong></td>
        <td class="text-red-light">${p.broken}</td>
        <td>${eggDisplay.sizes}</td>
        <td>${eggDisplay.colors}</td>
        <td>${eggDisplay.usage}</td>
        <td><span class="badge badge-green">${eggDisplay.available}</span></td>
        <td>${p.producingBirds || producing}</td>
        <td class="table-note-muted">${p.notes || "--"}</td>
        <td><button class="btn btn-xs btn-danger" onclick="deleteProd('${p.id}')">حذف</button></td>
      </tr>`;
            })
            .join("");
        }
        renderPagination("prod-pagination", prodPage, pages, (p) => {
          prodPage = p;
          renderProdTable();
        });
      }

      function addProduction() {
        if (!ensurePermission("production")) return;
        const date = document.getElementById("ap-date").value;
        const total = parseInt(document.getElementById("ap-total").value) || 0;
        const broken =
          parseInt(document.getElementById("ap-broken").value) || 0;
        const sizes = {
          large: parseInt(document.getElementById("ap-gradeA").value) || 0,
          medium: parseInt(document.getElementById("ap-gradeB").value) || 0,
          small: parseInt(document.getElementById("ap-gradeC").value) || 0,
        };
        const colors = {
          whitePure: parseInt(document.getElementById("ap-white").value) || 0,
          cream: parseInt(document.getElementById("ap-cream").value) || 0,
          speckled: parseInt(document.getElementById("ap-speckled").value) || 0,
          lightBrown: parseInt(document.getElementById("ap-light-brown").value) || 0,
        };
        const usage = {
          sold: parseInt(document.getElementById("ap-sold").value) || 0,
          gifted: parseInt(document.getElementById("ap-gifted").value) || 0,
          family: parseInt(document.getElementById("ap-family").value) || 0,
          hatching: parseInt(document.getElementById("ap-hatching").value) || 0,
        };
        const notes = document.getElementById("ap-notes").value.trim();

        if (!date) {
          toast("الرجاء تحديد التاريخ", "error");
          return;
        }
        if (!total) {
          toast("الرجاء إدخال عدد البيض", "error");
          return;
        }
        if (broken > total) {
          toast("البيض التالف لا يمكن أن يكون أكبر من الإجمالي", "error");
          return;
        }
        const totalSizes = sizes.large + sizes.medium + sizes.small;
        const totalColors = colors.whitePure + colors.cream + colors.speckled + colors.lightBrown;
        const totalUsage = usage.sold + usage.gifted + usage.family + usage.hatching;
        if (totalSizes > total) {
          toast("مجموع الأحجام لا يمكن أن يتجاوز إجمالي البيض", "error");
          return;
        }
        if (totalColors > total) {
          toast("مجموع الألوان لا يمكن أن يتجاوز إجمالي البيض", "error");
          return;
        }
        if (totalUsage + broken > total) {
          toast("البيع والإهداء والاستهلاك مع التالف لا يمكن أن يتجاوز الإجمالي", "error");
          return;
        }
        if (S.production.find((p) => p.date === date)) {
          toast("يوجد سجل لهذا التاريخ مسبقاً", "warning");
          return;
        }

        const producing = getProducingFlock().length;
        const prodId = "P" + uid();
        S.production.push({
          id: prodId,
          date,
          total,
          broken,
          sizes,
          colors,
          usage,
          producingBirds: producing,
          notes,
        });
        // Auto-deduct feed
        const dailyFeedUse = getActiveFlock().length * S.settings.feedRate;
        let remaining = dailyFeedUse;
        for (let i = 0; i < S.feedStock.length && remaining > 0; i++) {
          const deduct = Math.min(S.feedStock[i].balance, remaining);
          S.feedStock[i].balance = Math.max(
            0,
            parseFloat((S.feedStock[i].balance - deduct).toFixed(2)),
          );
          remaining -= deduct;
        }
        S.eggStock = recalcEggStock(S.production);
        recordActivity(
          "add-production",
          `تسجيل إنتاج ${total} بيضة بتاريخ ${date}`,
          "production",
          prodId,
        );
        save();
        closeModal("modal-add-prod");
        document.getElementById("ap-date").value = todayStr();
        [
          "ap-total",
          "ap-broken",
          "ap-gradeA",
          "ap-gradeB",
          "ap-gradeC",
          "ap-white",
          "ap-cream",
          "ap-speckled",
          "ap-light-brown",
          "ap-sold",
          "ap-gifted",
          "ap-family",
          "ap-hatching",
          "ap-notes",
        ].forEach((f) => {
          const el = document.getElementById(f);
          if (el) el.value = el.type === "number" ? "0" : "";
        });
        toast(
          "تم تسجيل إنتاج " +
            date +
            " (" +
            total +
            " بيضة) وخصم العلف تلقائياً",
          "success",
        );
        renderProductionPage();
      }

      function quickLogProduction() {
        if (!ensurePermission("production")) return;
        const date = document.getElementById("qp-date").value;
        const total = parseInt(document.getElementById("qp-total").value) || 0;
        const broken =
          parseInt(document.getElementById("qp-broken").value) || 0;
        const sizes = {
          large: parseInt(document.getElementById("qp-large").value) || 0,
          medium: parseInt(document.getElementById("qp-medium").value) || 0,
          small: parseInt(document.getElementById("qp-small").value) || 0,
        };
        const colors = {
          whitePure: parseInt(document.getElementById("qp-white").value) || 0,
          cream: parseInt(document.getElementById("qp-cream").value) || 0,
          speckled: parseInt(document.getElementById("qp-speckled").value) || 0,
          lightBrown: parseInt(document.getElementById("qp-light-brown").value) || 0,
        };
        const usage = {
          sold: 0,
          gifted: parseInt(document.getElementById("qp-gifted").value) || 0,
          family: parseInt(document.getElementById("qp-family").value) || 0,
          hatching: parseInt(document.getElementById("qp-hatching").value) || 0,
        };
        const note = document.getElementById("qp-note").value.trim();
        if (!date) {
          toast("الرجاء تحديد التاريخ", "error");
          return;
        }
        if (!total) {
          toast("الرجاء إدخال عدد البيض", "error");
          return;
        }
        if (broken > total) {
          toast("البيض التالف لا يمكن أن يكون أكبر من الإجمالي", "error");
          return;
        }
        const totalSizes = sizes.large + sizes.medium + sizes.small;
        const totalColors =
          colors.whitePure + colors.cream + colors.speckled + colors.lightBrown;
        const totalUsage = usage.gifted + usage.family + usage.hatching;
        if (totalSizes > total) {
          toast("مجموع الأحجام لا يمكن أن يتجاوز إجمالي البيض", "error");
          return;
        }
        if (totalColors > total) {
          toast("مجموع الألوان لا يمكن أن يتجاوز إجمالي البيض", "error");
          return;
        }
        if (totalUsage + broken > total) {
          toast("الإهداء واستهلاك العائلة مع التالف لا يمكن أن يتجاوز الإجمالي", "error");
          return;
        }
        if (S.production.find((p) => p.date === date)) {
          toast("يوجد سجل لهذا التاريخ مسبقاً", "warning");
          return;
        }
        const producing = getProducingFlock().length;
        const prodId = "P" + uid();
        S.production.push({
          id: prodId,
          date,
          total,
          broken,
          sizes,
          colors,
          usage,
          producingBirds: producing,
          notes: note,
        });
        const dailyFeedUse = getActiveFlock().length * S.settings.feedRate;
        let rem = dailyFeedUse;
        for (let i = 0; i < S.feedStock.length && rem > 0; i++) {
          const d = Math.min(S.feedStock[i].balance, rem);
          S.feedStock[i].balance = Math.max(
            0,
            parseFloat((S.feedStock[i].balance - d).toFixed(2)),
          );
          rem -= d;
        }
        S.eggStock = recalcEggStock(S.production);
        recordActivity(
          "quick-production",
          `تسجيل سريع لإنتاج ${total} بيضة بتاريخ ${date}`,
          "production",
          prodId,
        );
        save();
        closeModal("modal-quick-prod");
        document.getElementById("qp-date").value = todayStr();
        document.getElementById("qp-total").value = "";
        document.getElementById("qp-broken").value = "0";
        [
          "qp-large",
          "qp-medium",
          "qp-small",
          "qp-white",
          "qp-cream",
          "qp-speckled",
          "qp-light-brown",
          "qp-gifted",
          "qp-family",
          "qp-hatching",
        ].forEach((id) => {
          document.getElementById(id).value = "0";
        });
        document.getElementById("qp-note").value = "";
        toast("تم تسجيل الإنتاج وخصم العلف تلقائياً", "success");
        renderDashboard();
        updateNavBadges();
      }

      function deleteProd(id) {
        if (!ensurePermission("production")) return;
        if (!confirm("هل تريد حذف هذا السجل؟")) return;
        const entry = S.production.find((p) => p.id === id);
        S.production = S.production.filter((p) => p.id !== id);
        S.eggStock = recalcEggStock(S.production);
        recordActivity(
          "delete-production",
          `حذف سجل الإنتاج ${entry?.date || id}`,
          "production",
          id,
        );
        save();
        toast("تم الحذف", "warning");
        renderProductionPage();
      }

      /* ============================================================
   FEED PAGE
============================================================ */
      let feedPage = 1;
      const FEED_PER_PAGE = 20;

      function renderFeedPage() {
        const active = getActiveFlock().length;
        const dailyUse = parseFloat((active * S.settings.feedRate).toFixed(2));
        const totalFeed = parseFloat(
          S.feedStock.reduce((s, f) => s + f.balance, 0).toFixed(2),
        );
        const totalQty = S.feedStock.reduce((s, f) => s + (f.kgEquivalent || f.qty || 0), 0);
        const daysLeft = calcFeedDays();
        const fcr = calcFCR();

        // Alerts
        const feedAlerts = [];
        if (daysLeft < 5)
          feedAlerts.push({
            type: "danger",
            msg: `خطر: العلف سينتهي خلال ${daysLeft} أيام!`,
          });
        else if (daysLeft < 10)
          feedAlerts.push({
            type: "warning",
            msg: `تنبيه: ${daysLeft} أيام متبقية من العلف`,
          });
        S.feedStock.forEach((f) => {
          if (!f.expiry) return;
          const d = daysUntil(f.expiry);
          if (d != null && d <= 7 && d >= 0)
            feedAlerts.push({
              type: "warning",
              msg: `علف "${f.type}" ينتهي صلاحيته خلال ${d} أيام`,
            });
          else if (d != null && d < 0)
            feedAlerts.push({
              type: "danger",
              msg: `علف "${f.type}" انتهت صلاحيته منذ ${Math.abs(d)} أيام!`,
            });
        });
        document.getElementById("feed-alerts").innerHTML = feedAlerts
          .map(
            (a) =>
              `<div class="alert alert-${a.type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${a.msg}</div>`,
          )
          .join("");

        document.getElementById("feed-kpis").innerHTML = `
    <div class="kpi kpi-cyan"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إجمالي المخزون</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div></div>
      <div class="kpi-value">${fmtNum(totalFeed, 1)}<span class="kpi-unit">كغ</span></div>
      <div class="kpi-trend">${getFeedNames().length} أنواع علف معروفة</div>
    </div>
    <div class="kpi ${daysLeft < 5 ? "kpi-red" : daysLeft < 10 ? "kpi-amber" : "kpi-green"}"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">الأيام المتبقية</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div></div>
      <div class="kpi-value">${daysLeft}<span class="kpi-unit">يوم</span></div>
      <div class="kpi-trend">استهلاك يومي: ${dailyUse} كغ</div>
    </div>
    <div class="kpi kpi-purple"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">معامل FCR</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div></div>
      <div class="kpi-value">${fcr}<span class="kpi-unit">${fcr != "--" ? "كغ/بيضة" : ""}</span></div>
      <div class="kpi-trend">كفاءة تحويل العلف</div>
    </div>
    <div class="kpi kpi-amber"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إجمالي ما اشتري</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div></div>
      <div class="kpi-value">${fmtNum(totalQty)}<span class="kpi-unit">كغ</span></div>
      <div class="kpi-trend">منذ بداية التسجيل</div>
    </div>
  `;

        // Feed stock cards
        const stockHtml = S.feedStock
          .map((f) => {
            const baseQty = f.kgEquivalent || f.qty || 0;
            const pct =
              baseQty > 0 ? Math.min(100, (f.balance / baseQty) * 100) : 0;
            const barCls =
              pct > 40 ? "prog-green" : pct > 20 ? "prog-amber" : "prog-red";
            const dLeft =
              dailyUse > 0 ? Math.floor(f.balance / dailyUse) : "--";
            const expiryDays = f.expiry ? daysUntil(f.expiry) : null;
            return `<div class="card">
      <div class="card-header">
        <div><div class="card-title">${f.type}</div><div class="card-subtitle">مورد: ${f.supplier || "غير محدد"}</div></div>
        <span class="badge ${dLeft < 10 ? "badge-red" : dLeft < 20 ? "badge-amber" : "badge-green"}">${dLeft} يوم</span>
      </div>
      <div class="card-body">
        <div class="metric-hero">${fmtNum(f.balance, 1)} <span class="metric-hero-unit">كغ متبقي</span></div>
        <div class="caption-line">إجمالي الدفعة: ${f.unit === "package" ? `${f.qty} حزمة` : f.unit === "kitchen" ? "بقايا مطبخ" : `${f.qty} كغ`} | سعر: ${f.price || "--"} ${f.unit === "package" ? "دج/حزمة" : "دج/كغ"}</div>
        <div class="prog-wrap">
          <div class="prog-labels"><span>0 كغ</span><span>${fmtNum(baseQty, 1)} كغ</span></div>
          <div class="prog-track"><div class="prog-fill ${barCls}" data-progress-width="${pct}"></div></div>
        </div>
        ${expiryDays != null ? `<div class="note-expiry ${expiryDays < 7 ? "feed-expiry-danger" : "feed-expiry-normal"}">الصلاحية: ${fmtDate(f.expiry)} (${expiryDays >= 0 ? expiryDays + " يوم" : "منتهية"})</div>` : ""}
      </div>
    </div>`;
          })
          .join("");
        document.getElementById("feed-stock-cards").innerHTML =
          stockHtml ||
          '<div class="empty-state-box">لا يوجد مخزون علف مسجل</div>';
        hydrateDynamicWidths(document.getElementById("feed-stock-cards"));
        document.getElementById("feed-meals-list").innerHTML =
          S.mealRecipes.length === 0
            ? '<div class="field-note">لم يتم إنشاء أي وجبة محفوظة بعد.</div>'
            : S.mealRecipes
                .map(
                  (meal) => `
                <div class="mini-stack-item">
                  <div class="mini-stack-title">${meal.name}</div>
                  <div class="mini-stack-meta">${meal.items.map((item) => `${item.feed}: ${item.qty} كغ`).join(" | ")}</div>
                </div>`,
                )
                .join("");

        // FCR and efficiency
        document.getElementById("feed-efficiency").innerHTML = `
    <div class="stat-row"><span class="stat-row-label">معامل FCR</span><span class="stat-row-value stat-value-cyan">${fcr}</span></div>
    <div class="stat-row"><span class="stat-row-label">الاستهلاك اليومي</span><span class="stat-row-value">${dailyUse} كغ/يوم</span></div>
    <div class="stat-row"><span class="stat-row-label">الاستهلاك الشهري المتوقع</span><span class="stat-row-value">${(dailyUse * 30).toFixed(1)} كغ</span></div>
    <div class="stat-row"><span class="stat-row-label">تكلفة العلف/بيضة</span><span class="stat-row-value">${calcCostPerEgg()} دج</span></div>
    <div class="stat-row"><span class="stat-row-label">تاريخ انتهاء المخزون المتوقع</span><span class="stat-row-value ${daysLeft < 10 ? "stat-value-red" : "stat-value-amber"}">${daysLeft < 999 ? fmtDate(new Date(Date.now() + daysLeft * 86400000).toISOString().split("T")[0]) : "--"}</span></div>
  `;

        // Feed bar chart (monthly consumption estimate)
        const months = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          months.push(
            d.toLocaleString("ar-DZ", { month: "short", year: "2-digit" }),
          );
        }
        mkChart("chart-feed-bar", {
          type: "bar",
          data: {
            labels: months,
            datasets: [
              {
                label: "استهلاك العلف كغ",
                data: months.map((_, i) =>
                  Math.round(dailyUse * 30 * (0.85 + Math.random() * 0.3)),
                ),
                backgroundColor: "rgba(8,145,178,.5)",
                borderColor: "rgba(8,145,178,.8)",
                borderWidth: 1,
                borderRadius: 5,
              },
            ],
          },
          options: {
            ...chartDefaults,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { ...chartDefaults.plugins, legend: { display: false } },
          },
        });

        renderFeedTable();
      }

      function renderFeedTable() {
        const tbody = document.getElementById("feed-tbody");
        const entries = [...S.feedStock].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        if (!entries.length) {
          tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>لا توجد حركات علف</td></tr>`;
          return;
        }
        tbody.innerHTML = entries
          .map(
            (f) => `<tr>
    <td>${fmtDate(f.date)}</td>
    <td>${f.type}</td>
    <td>${f.supplier || "--"}</td>
    <td><strong>${f.unit === "package" ? `${f.qty} حزمة` : f.unit === "kitchen" ? "بدون كمية" : `${f.qty} كغ`}</strong></td>
    <td>${f.price || "--"}</td>
    <td>${f.price && f.unit !== "kitchen" ? fmtNum(f.price * (f.qty || 0)) + " دج" : "--"}</td>
    <td>${fmtDate(f.expiry)}</td>
    <td><span class="badge ${f.balance < (f.kgEquivalent || f.qty || 1) * 0.2 ? "badge-red" : f.balance < (f.kgEquivalent || f.qty || 1) * 0.5 ? "badge-amber" : "badge-green"}">${fmtNum(f.balance, 1)} كغ</span></td>
    <td class="table-note-muted">${f.notes || "--"}</td>
  </tr>`,
          )
          .join("");
      }

      function addFeed() {
        if (!ensurePermission("feed")) return;
        const type = document.getElementById("af-type").value.trim();
        const supplier = document.getElementById("af-supplier").value.trim();
        const qty = parseFloat(document.getElementById("af-qty").value) || 0;
        const unit = document.getElementById("af-unit").value;
        const packageWeight =
          parseFloat(document.getElementById("af-package-weight").value) || 0;
        const price =
          parseFloat(document.getElementById("af-price").value) || 0;
        const date = document.getElementById("af-date").value;
        const expiry = document.getElementById("af-expiry").value;
        const notes = document.getElementById("af-notes").value.trim();
        if (!type) {
          toast("الرجاء إدخال نوع العلف", "error");
          return;
        }
        if (unit !== "kitchen" && !qty) {
          toast("الرجاء إدخال الكمية", "error");
          return;
        }
        if (unit === "package" && !packageWeight) {
          toast("حدد وزن الحزمة الواحدة", "error");
          return;
        }
        if (!date) {
          toast("الرجاء تحديد تاريخ الشراء", "error");
          return;
        }
        const kgEquivalent =
          unit === "kitchen" ? 0 : unit === "package" ? qty * packageWeight : qty;
        const feedId = "F" + uid();
        S.feedStock.push({
          id: feedId,
          type,
          supplier,
          qty: unit === "kitchen" ? 0 : qty,
          unit,
          packageWeight,
          kgEquivalent,
          price,
          date,
          expiry,
          notes,
          balance: kgEquivalent,
        });
        recordActivity(
          "add-feed",
          `إضافة ${type} إلى المخزون (${unit === "package" ? `${qty} حزمة` : unit === "kitchen" ? "بقايا مطبخ" : `${qty} كغ`})`,
          "feed",
          feedId,
        );
        save();
        closeModal("modal-add-feed");
        ["af-supplier", "af-qty", "af-price", "af-expiry", "af-notes", "af-package-weight"].forEach((f) => {
          const el = document.getElementById(f);
          if (el) el.value = "";
        });
        document.getElementById("af-date").value = todayStr();
        document.getElementById("af-unit").value = "kg";
        populateFeedOptions();
        refreshFeedFormVisibility();
        renderMealIngredientFields();
        toast("تمت إضافة " + type + " إلى المخزون", "success");
        renderFeedPage();
        updateNavBadges();
      }

      function addMealRecipe() {
        if (!ensurePermission("feed")) return;
        const name = document.getElementById("meal-name").value.trim();
        if (!name) {
          toast("اسم الوجبة مطلوب", "error");
          return;
        }
        const items = [];
        document.querySelectorAll("[data-meal-feed]").forEach((checkbox) => {
          if (!checkbox.checked) return;
          const feed = checkbox.getAttribute("data-meal-feed");
          const qty = parseFloat(
            document.querySelector(`[data-meal-qty="${feed}"]`)?.value || "0",
          );
          if (qty > 0) items.push({ feed, qty });
        });
        if (!items.length) {
          toast("اختر مكونًا واحدًا على الأقل للوجبة", "error");
          return;
        }
        const recipeId = "M" + uid();
        S.mealRecipes.push({ id: recipeId, name, items });
        recordActivity(
          "add-meal-recipe",
          `حفظ الوجبة ${name} بعدد ${items.length} مكونات`,
          "meal",
          recipeId,
        );
        save();
        document.getElementById("meal-name").value = "";
        closeModal("modal-add-meal");
        renderFeedPage();
        toast("تم حفظ الوجبة بنجاح", "success");
      }

      /* ============================================================
   INCUBATION & CARE
============================================================ */
      function refreshIncubationFormVisibility() {
        const type = document.getElementById("inc-type")?.value;
        const henWrap = document.getElementById("inc-hen-wrap");
        if (henWrap) henWrap.classList.toggle("hidden", type !== "natural");
      }
      function addIncubationBatch() {
        if (!ensurePermission("incubation")) return;
        const type = document.getElementById("inc-type").value;
        const breed = document.getElementById("inc-breed").value;
        const startDate = document.getElementById("inc-start-date").value;
        const eggCount =
          parseInt(document.getElementById("inc-egg-count").value) || 0;
        const henId = document.getElementById("inc-hen-id").value;
        const source = document.getElementById("inc-source").value.trim();
        const temp = parseFloat(document.getElementById("inc-temp").value);
        const humidity = parseFloat(
          document.getElementById("inc-humidity").value,
        );
        const notes = document.getElementById("inc-notes").value.trim();
        if (!startDate || !breed || !eggCount) {
          toast("أكمل بيانات دفعة التفقيس الأساسية", "error");
          return;
        }
        if (type === "natural" && !henId) {
          toast("اختر الدجاجة الحاضنة للتفقيس الطبيعي", "error");
          return;
        }
        const batchId = `INC-${String(S.incubations.length + 1).padStart(3, "0")}`;
        const batch = {
          id: batchId,
          type,
          breed,
          startDate,
          eggCount,
          henId,
          source,
          notes,
          expectedDate: getIncubationExpectedDate(startDate),
          status: "incubating",
          logs: [],
          result: { hatched: 0, male: 0, female: 0, unknown: 0, successRate: 0 },
          chickIds: [],
        };
        if (!Number.isNaN(temp) || !Number.isNaN(humidity)) {
          batch.logs.push({
            date: startDate,
            temp: Number.isNaN(temp) ? null : temp,
            humidity: Number.isNaN(humidity) ? null : humidity,
            notes: "قراءة البداية",
          });
        }
        S.incubations.push(batch);
        recordActivity(
          "add-incubation",
          `إضافة دفعة ${batch.id} (${type === "artificial" ? "آلية" : "طبيعية"})`,
          "incubation",
          batch.id,
        );
        save();
        closeModal("modal-add-incubation");
        ["inc-egg-count", "inc-source", "inc-temp", "inc-humidity", "inc-notes"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        document.getElementById("inc-start-date").value = todayStr();
        populateIncubationBatchOptions();
        renderIncubationPage();
        toast("تمت إضافة دفعة التفقيس", "success");
      }
      function addIncubationLog() {
        if (!ensurePermission("incubation")) return;
        const batchId = document.getElementById("ilog-batch").value;
        const date = document.getElementById("ilog-date").value;
        const temp = parseFloat(document.getElementById("ilog-temp").value);
        const humidity = parseFloat(
          document.getElementById("ilog-humidity").value,
        );
        const notes = document.getElementById("ilog-notes").value.trim();
        const batch = S.incubations.find((item) => item.id === batchId);
        if (!batch || !date) {
          toast("اختر دفعة وحدد التاريخ", "error");
          return;
        }
        batch.logs.push({
          date,
          temp: Number.isNaN(temp) ? null : temp,
          humidity: Number.isNaN(humidity) ? null : humidity,
          notes,
        });
        recordActivity(
          "incubation-reading",
          `إضافة قراءة لدفعة ${batch.id} بتاريخ ${date}`,
          "incubation",
          batch.id,
        );
        save();
        populateIncubationBatchOptions();
        closeModal("modal-incubation-log");
        ["ilog-temp", "ilog-humidity", "ilog-notes"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        renderIncubationPage();
        toast("تم حفظ قراءة التفقيس", "success");
      }
      function openFinalizeIncubationModal(batchId) {
        if (!ensurePermission("incubation")) return;
        const batch = S.incubations.find((item) => item.id === batchId);
        if (!batch) return;
        document.getElementById("final-batch-id").value = batchId;
        document.getElementById("final-batch-info").textContent =
          `${batch.id} | ${batch.type === "artificial" ? "فقاسة آلية" : "تفقيس طبيعي"} | ${batch.eggCount} بيضة`;
        document.getElementById("final-hatched").value = "";
        document.getElementById("final-male").value = "0";
        document.getElementById("final-female").value = "0";
        document.getElementById("final-unknown").value = "0";
        openModal("modal-finalize-incubation");
      }
      function finalizeIncubationBatch() {
        if (!ensurePermission("incubation")) return;
        const batchId = document.getElementById("final-batch-id").value;
        const batch = S.incubations.find((item) => item.id === batchId);
        if (!batch) return;
        const hatched = parseInt(document.getElementById("final-hatched").value) || 0;
        const male = parseInt(document.getElementById("final-male").value) || 0;
        const female = parseInt(document.getElementById("final-female").value) || 0;
        const unknown = parseInt(document.getElementById("final-unknown").value) || 0;
        if (!hatched && hatched !== 0) {
          toast("أدخل عدد الصيصان الناتجة", "error");
          return;
        }
        if (male + female + unknown > hatched) {
          toast("مجموع الذكور والإناث وغير المحدد لا يجب أن يتجاوز الناتج", "error");
          return;
        }
        batch.status = "hatched";
        batch.result = {
          hatched,
          male,
          female,
          unknown,
          successRate: batch.eggCount > 0 ? ((hatched / batch.eggCount) * 100).toFixed(1) : 0,
        };
        batch.chickIds = [];
        for (let i = 1; i <= hatched; i++) {
          const chickId = createChickIdentifier(batch.id, i);
          batch.chickIds.push(chickId);
          S.hatchChicks.push({
            id: chickId,
            batchId: batch.id,
            breed: batch.breed,
            hatchDate: todayStr(),
            gender:
              i <= female
                ? "female"
                : i <= female + male
                  ? "male"
                  : "unknown",
            status: "brooder",
            sourceType: batch.type,
          });
        }
        recordActivity(
          "finalize-incubation",
          `إغلاق دفعة ${batch.id} وإنتاج ${hatched} صوص`,
          "incubation",
          batch.id,
        );
        save();
        populateIncubationBatchOptions();
        closeModal("modal-finalize-incubation");
        renderIncubationPage();
        toast("تم إغلاق دفعة التفقيس وإنشاء معرفات الصيصان", "success");
      }
      function openChickActionModal(chickId) {
        if (!ensurePermission("incubation")) return;
        const chick = S.hatchChicks.find((item) => item.id === chickId);
        if (!chick) return;
        document.getElementById("chick-action-id").value = chickId;
        document.getElementById("chick-action-gender").value = chick.gender || "unknown";
        document.getElementById("chick-action-info").textContent =
          `${chick.id} | ${chick.breed} | عمر ${getChickAgeDays(chick)} يوم`;
        document.getElementById("chick-action-pen").value = "";
        document.getElementById("chick-action-type").value = "flock";
        openModal("modal-chick-action");
      }
      function applyChickAction() {
        const chickId = document.getElementById("chick-action-id").value;
        const action = document.getElementById("chick-action-type").value;
        if (!ensurePermission(action === "flock" ? "flock" : "incubation")) return;
        const gender = document.getElementById("chick-action-gender").value;
        const pen = document.getElementById("chick-action-pen").value.trim();
        const chick = S.hatchChicks.find((item) => item.id === chickId);
        if (!chick) return;
        chick.gender = gender;
        if (action === "flock") {
          S.birdCounter++;
          const id = `BLH-${new Date().getFullYear()}-${String(S.birdCounter).padStart(4, "0")}`;
          const ageDays = getChickAgeDays(chick);
          const ageCategory =
            ageDays < 42 ? "chick" : ageDays < 140 ? "growing" : "producing";
          S.flock.push({
            id,
            breed: chick.breed,
            breedMixDetails: "",
            gender: gender === "unknown" ? "female" : gender,
            nickname: chick.id,
            image: "",
            acquisitionType: "hatching",
            acquisitionRef: chick.batchId,
            entryUnknown: false,
            entry: todayStr(),
            hatchDate: chick.hatchDate,
            ageCategory,
            weight: 0,
            pen,
            health: "healthy",
            notes: `أُدخل من دفعة تفقيس ${chick.batchId}`,
            active: true,
            exitReason: null,
            exitDate: null,
            exitNotes: "",
          });
        }
        chick.status = action;
        recordActivity(
          "update-chick-status",
          `تحديث الصوص ${chick.id} إلى الحالة ${action}`,
          "chick",
          chick.id,
        );
        save();
        closeModal("modal-chick-action");
        populateExchangeBirdOptions();
        populateHenOptions();
        populateCleaningCoops();
        renderIncubationPage();
        if (currentPage === "flock") renderFlockPage();
        toast("تم تحديث حالة الصوص", "success");
      }
      function renderIncubationPage() {
        const activeBatches = S.incubations.filter((batch) => batch.status === "incubating");
        const hatchedBatches = S.incubations.filter((batch) => batch.status === "hatched");
        const chicks = S.hatchChicks.filter((chick) => chick.status === "brooder");
        const successRates = hatchedBatches
          .map((batch) => parseFloat(batch.result?.successRate || 0))
          .filter((value) => !Number.isNaN(value));
        const avgSuccess =
          successRates.length > 0
            ? (successRates.reduce((sum, value) => sum + value, 0) / successRates.length).toFixed(1)
            : "--";
        document.getElementById("incubation-kpis").innerHTML = `
          <div class="kpi kpi-cyan"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">دفعات نشطة</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg></div></div><div class="kpi-value">${activeBatches.length}<span class="kpi-unit">دفعة</span></div><div class="kpi-trend">آلية وطبيعية</div></div>
          <div class="kpi kpi-green"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">صيصان بالحضانة</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/></svg></div></div><div class="kpi-value">${chicks.length}<span class="kpi-unit">صوص</span></div><div class="kpi-trend">تحت المتابعة اليومية</div></div>
          <div class="kpi kpi-amber"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">متوسط النجاح</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div></div><div class="kpi-value">${avgSuccess}<span class="kpi-unit">${avgSuccess !== "--" ? "%" : ""}</span></div><div class="kpi-trend">من الدفعات المغلقة</div></div>
          <div class="kpi kpi-purple"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">جاهزة للنقل</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18"/></svg></div></div><div class="kpi-value">${chicks.filter((chick) => getChickAgeDays(chick) >= 45).length}<span class="kpi-unit">صوص</span></div><div class="kpi-trend">عمر مناسب للفرز أو الإدخال</div></div>
        `;
        document.getElementById("incubation-tbody").innerHTML =
          activeBatches.length === 0
            ? `<tr class="empty-row"><td colspan="8">لا توجد دفعات تفقيس نشطة</td></tr>`
            : activeBatches
                .map((batch) => {
                  const lastLog = getLastIncubationLog(batch);
                  return `<tr>
                    <td><strong>${batch.id}</strong></td>
                    <td>${batch.type === "artificial" ? "فقاسة آلية" : "تحت دجاجة"}</td>
                    <td>${batch.breed}</td>
                    <td>${fmtDate(batch.startDate)}</td>
                    <td>${batch.eggCount}</td>
                    <td>${fmtDate(batch.expectedDate)}</td>
                    <td>${lastLog ? `${lastLog.temp ?? "--"}° / ${lastLog.humidity ?? "--"}%` : "--"}</td>
                    <td><div class="action-cell"><button class="btn btn-xs btn-secondary" onclick="openModal('modal-incubation-log');document.getElementById('ilog-batch').value='${batch.id}'">قراءة</button><button class="btn btn-xs btn-primary" onclick="openFinalizeIncubationModal('${batch.id}')">إغلاق</button></div></td>
                  </tr>`;
                })
                .join("");
        document.getElementById("chicks-tbody").innerHTML =
          chicks.length === 0
            ? `<tr class="empty-row"><td colspan="7">لا توجد صيصان تحت الحضانة</td></tr>`
            : chicks
                .map((chick) => {
                  const stage = getChickStage(chick);
                  return `<tr>
                    <td><strong>${chick.id}</strong></td>
                    <td>${chick.breed}</td>
                    <td>${getChickAgeDays(chick)} يوم</td>
                    <td>${chick.gender === "female" ? "أنثى" : chick.gender === "male" ? "ذكر" : "غير محدد"}</td>
                    <td><span class="badge badge-cyan">${stage.label}</span></td>
                    <td class="table-note-muted">${stage.feed}<br>${stage.vaccine}</td>
                    <td><button class="btn btn-xs btn-primary" onclick="openChickActionModal('${chick.id}')">تحديث</button></td>
                  </tr>`;
                })
                .join("");
        document.getElementById("incubation-results").innerHTML =
          hatchedBatches.length === 0
            ? `<div class="field-note">لم تغلق أي دفعة تفقيس بعد.</div>`
            : hatchedBatches
                .slice(-6)
                .reverse()
                .map(
                  (batch) => `<div class="stat-row"><span class="stat-row-label">${batch.id} | ${batch.breed}</span><span class="stat-row-value">${batch.result.hatched}/${batch.eggCount} (${batch.result.successRate}%)</span></div>`,
                )
                .join("");
      }
      function addCleaningRecord() {
        if (!ensurePermission("care")) return;
        const coop = document.getElementById("cl-coop").value;
        const date = document.getElementById("cl-date").value;
        const kind = document.getElementById("cl-kind").value;
        const doneBy = document.getElementById("cl-done-by").value.trim();
        const nextDate = document.getElementById("cl-next-date").value;
        const notes = document.getElementById("cl-notes").value.trim();
        if (!coop || !date) {
          toast("حدد الخم والتاريخ", "error");
          return;
        }
        const cleaningId = "CL" + uid();
        S.coopCleaning.push({
          id: cleaningId,
          coop,
          date,
          kind,
          doneBy,
          nextDate,
          notes,
        });
        recordActivity(
          "add-cleaning",
          `تسجيل تنظيف للخم ${coop} (${kind})`,
          "cleaning",
          cleaningId,
        );
        save();
        closeModal("modal-add-cleaning");
        ["cl-done-by", "cl-next-date", "cl-notes"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        renderCarePage();
        toast("تم تسجيل تنظيف الخم", "success");
      }
      function renderCarePage() {
        const advice = getWeatherAdvice();
        const cleaning = [...S.coopCleaning].sort((a, b) => b.date.localeCompare(a.date));
        const overdue = cleaning.filter((record) => record.nextDate && daysUntil(record.nextDate) < 0).length;
        document.getElementById("care-kpis").innerHTML = `
          <div class="kpi kpi-cyan"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">خموم معروفة</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18"/></svg></div></div><div class="kpi-value">${getCoopNames().length}<span class="kpi-unit">خم</span></div><div class="kpi-trend">من القطيع وسجل التنظيف</div></div>
          <div class="kpi ${overdue ? "kpi-red" : "kpi-green"}"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">تنظيف متأخر</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86L1.82 18"/></svg></div></div><div class="kpi-value">${overdue}<span class="kpi-unit">خم</span></div><div class="kpi-trend">بحاجة للتدخل</div></div>
          <div class="kpi kpi-amber"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">نصائح وقائية</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/></svg></div></div><div class="kpi-value">${advice.length}<span class="kpi-unit">تنبيه</span></div><div class="kpi-trend">${S.settings.location.city || "الموقع غير مفعل"}</div></div>
          <div class="kpi kpi-purple"><div class="kpi-accent-bar"></div><div class="kpi-top"><div class="kpi-label">التنظيفات المسجلة</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></div></div><div class="kpi-value">${cleaning.length}<span class="kpi-unit">سجل</span></div><div class="kpi-trend">آخر متابعة صحية للخموم</div></div>
        `;
        document.getElementById("weather-advice-list").innerHTML = advice
          .map(
            (item) => `<div class="alert alert-${item.type === "danger" ? "danger" : item.type === "warning" ? "warning" : item.type === "success" ? "success" : "info"}"><div><strong>${item.title}</strong><div class="advice-copy">${item.text}</div></div></div>`,
          )
          .join("");
        const coopNames = getCoopNames();
        document.getElementById("coop-cleaning-summary").innerHTML = coopNames
          .map((coop) => {
            const latest = cleaning.find((record) => record.coop === coop);
            return `<div class="stat-row"><span class="stat-row-label">${coop}</span><span class="stat-row-value">${latest ? `${fmtDate(latest.date)} | القادم ${latest.nextDate ? fmtDate(latest.nextDate) : "--"}` : "لا يوجد سجل"}</span></div>`;
          })
          .join("");
        document.getElementById("cleaning-tbody").innerHTML =
          cleaning.length === 0
            ? `<tr class="empty-row"><td colspan="6">لا توجد عمليات تنظيف مسجلة</td></tr>`
            : cleaning
                .map(
                  (record) => `<tr><td>${fmtDate(record.date)}</td><td>${record.coop}</td><td>${getCleaningKindLabel(record.kind)}</td><td>${record.doneBy || "--"}</td><td>${fmtDate(record.nextDate)}</td><td class="table-note-muted">${record.notes || "--"}</td></tr>`,
                )
                .join("");
      }
      function printBirdLabels() {
        printIdentifierLabels(
          getActiveFlock().map((bird) => ({
            id: bird.id,
            breed: bird.breed,
            extra: bird.nickname || getBirdStage(bird).label,
          })),
          "معرفات الطيور",
        );
      }
      function printChickLabels() {
        printIdentifierLabels(
          S.hatchChicks
            .filter((chick) => chick.status === "brooder")
            .map((chick) => ({
              id: chick.id,
              breed: chick.breed,
              extra: `${getChickAgeDays(chick)} يوم`,
            })),
          "معرفات الصيصان",
        );
      }

      /* ============================================================
   HEALTH PAGE
============================================================ */
      let healthPage = 1;
      const HEALTH_PER_PAGE = 20;

      function renderHealthPage() {
        const records = [...S.healthRecords].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        const vaccines = records.filter((r) => r.type === "vaccine").length;
        const treatments = records.filter((r) => r.type === "treatment").length;
        const checkups = records.filter((r) => r.type === "checkup").length;
        const upcoming = records.filter(
          (r) =>
            r.nextDate &&
            daysUntil(r.nextDate) <= 30 &&
            daysUntil(r.nextDate) >= 0,
        );

        document.getElementById("health-kpis").innerHTML = `
    <div class="kpi kpi-green"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">تطعيمات</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div></div>
      <div class="kpi-value">${vaccines}<span class="kpi-unit">تطعيم</span></div>
      <div class="kpi-trend">إجمالي سجلات التطعيم</div>
    </div>
    <div class="kpi kpi-amber"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">مواعيد قادمة</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div></div>
      <div class="kpi-value">${upcoming.length}<span class="kpi-unit">موعد</span></div>
      <div class="kpi-trend">خلال 30 يوم القادمة</div>
    </div>
    <div class="kpi kpi-red"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">معدل النفوق</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></div></div>
      <div class="kpi-value">${S.flock.filter((b) => b.exitReason === "Mortality").length}<span class="kpi-unit">طير</span></div>
      <div class="kpi-trend">هذا الشهر: ${getMonthlyMortality()} طير</div>
    </div>
    <div class="kpi kpi-cyan"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إجمالي السجلات</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div></div>
      <div class="kpi-value">${records.length}<span class="kpi-unit">سجل</span></div>
      <div class="kpi-trend">علاج: ${treatments} | فحص: ${checkups}</div>
    </div>
  `;

        // Upcoming vaccines
        const upcomingHtml =
          upcoming.length === 0
            ? `<div class="empty-row"><td colspan="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="vaccine-empty-icon"><rect x="3" y="4" width="18" height="18" rx="2"/></svg>لا توجد مواعيد قادمة</td></div>`
            : upcoming
                .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
                .map((r) => {
                  const d = daysUntil(r.nextDate);
                  return `<div class="vaccine-row">
        <div>
          <div class="vaccine-name">${r.medicine}</div>
          <div class="vaccine-meta">${r.target === "all" ? "القطيع كاملاً" : r.targetDetail || r.target}</div>
        </div>
        <div class="vaccine-side">
          <span class="badge ${d <= 3 ? "badge-red" : d <= 7 ? "badge-amber" : "badge-cyan"}">${d === 0 ? "اليوم" : d + " يوم"}</span>
          <div class="meta-inline">${fmtDate(r.nextDate)}</div>
        </div>
      </div>`;
                })
                .join("");
        document.getElementById("upcoming-vaccines").innerHTML = upcomingHtml;
        document.getElementById("vaccine-library-list").innerHTML =
          VACCINE_LIBRARY.map(
            (item) => `
              <details class="details-note">
                <summary>${item.name}</summary>
                <div class="details-note-body">
                  <div><strong>الفائدة:</strong> ${item.purpose}</div>
                  <div><strong>لماذا يستعمل:</strong> ${item.why}</div>
                  <div><strong>الجرعة:</strong> ${item.dose}</div>
                  <div><strong>العمر المناسب:</strong> ${item.ageHint}</div>
                  <div><strong>طريقة الإعطاء:</strong> ${item.method}</div>
                  <div><strong>الجدولة:</strong> ${item.intervalDays ? `كل ${item.intervalDays} يوم` : "مرة واحدة أو حسب الحاجة"}</div>
                </div>
              </details>`,
          ).join("");

        // Health donut
        const typeMap = { vaccine: "تطعيم", treatment: "علاج", checkup: "فحص" };
        mkChart("chart-health-donut", {
          type: "doughnut",
          data: {
            labels: ["تطعيم", "علاج", "فحص"],
            datasets: [
              {
                data: [vaccines, treatments, checkups],
                backgroundColor: [
                  "rgba(22,163,74,.7)",
                  "rgba(220,38,38,.7)",
                  "rgba(8,145,178,.7)",
                ],
                borderColor: "transparent",
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "bottom",
                labels: {
                  color: "#94a3b8",
                  font: { family: "Tajawal", size: 12 },
                  padding: 12,
                  boxWidth: 12,
                },
              },
              tooltip: { ...chartDefaults.plugins.tooltip },
            },
          },
        });

        renderHealthTable();
      }

      function renderHealthTable() {
        const records = [...S.healthRecords].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        const total = records.length;
        const pages = Math.ceil(total / HEALTH_PER_PAGE);
        const slice = records.slice(
          (healthPage - 1) * HEALTH_PER_PAGE,
          healthPage * HEALTH_PER_PAGE,
        );
        const typeMap = {
          vaccine: '<span class="badge badge-green">تطعيم</span>',
          treatment: '<span class="badge badge-red">علاج</span>',
          checkup: '<span class="badge badge-cyan">فحص</span>',
        };
        const targetMap = {
          all: "القطيع كاملاً",
          pen: "خم محدد",
          individual: "طير محدد",
        };
        const tbody = document.getElementById("health-tbody");
        if (!slice.length) {
          tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>لا توجد سجلات صحية</td></tr>`;
          return;
        }
        tbody.innerHTML = slice
          .map((r) => {
            const nextDays = r.nextDate ? daysUntil(r.nextDate) : null;
            const nextLabel =
              nextDays != null
                ? nextDays < 0
                  ? `<span class="badge badge-gray">منتهي</span>`
                  : `<span class="badge ${nextDays <= 3 ? "badge-red" : nextDays <= 7 ? "badge-amber" : "badge-cyan"}">${nextDays} يوم</span>`
                : "--";
            return `<tr>
      <td>${fmtDate(r.date)}</td>
      <td>${typeMap[r.type] || r.type}</td>
      <td><strong>${r.medicine}</strong></td>
      <td>${r.dose || "--"}</td>
      <td>${targetMap[r.target] || r.target}${r.targetDetail ? " (" + r.targetDetail + ")" : ""}</td>
      <td>${nextLabel}</td>
      <td class="table-note-muted">${r.notes || "--"}</td>
      <td><button class="btn btn-xs btn-danger" onclick="deleteHealth('${r.id}')">حذف</button></td>
    </tr>`;
          })
          .join("");
        renderPagination("health-pagination", healthPage, pages, (p) => {
          healthPage = p;
          renderHealthTable();
        });
      }

      function addHealthRecord() {
        if (!ensurePermission("health")) return;
        const date = document.getElementById("ah-date").value;
        const type = document.getElementById("ah-type").value;
        const medicine = document.getElementById("ah-medicine").value.trim();
        const dose = document.getElementById("ah-dose").value.trim();
        const target = document.getElementById("ah-target").value;
        const targetDetail = document
          .getElementById("ah-target-detail")
          .value.trim();
        const nextDate = document.getElementById("ah-next").value;
        const notes = document.getElementById("ah-notes").value.trim();
        const templateId = document.getElementById("ah-template").value;
        if (!date) {
          toast("الرجاء تحديد التاريخ", "error");
          return;
        }
        if (!medicine) {
          toast("الرجاء إدخال اسم اللقاح أو الدواء", "error");
          return;
        }
        const recordId = "H" + uid();
        S.healthRecords.push({
          id: recordId,
          date,
          type,
          medicine,
          dose,
          target,
          targetDetail,
          nextDate:
            nextDate ||
            calculateNextDate(
              date,
              getVaccineTemplate(templateId)?.intervalDays || 0,
            ),
          notes,
          templateId,
        });
        recordActivity(
          "add-health-record",
          `إضافة سجل صحي ${medicine} بتاريخ ${date}`,
          "health",
          recordId,
        );
        save();
        closeModal("modal-add-health");
        ["ah-medicine", "ah-dose", "ah-target-detail", "ah-notes", "ah-next"].forEach(
          (f) => {
            const el = document.getElementById(f);
            if (el) el.value = "";
          },
        );
        document.getElementById("ah-template").value = "";
        document.getElementById("ah-template-info").textContent = "";
        toast("تم إضافة السجل الصحي", "success");
        renderHealthPage();
      }

      function deleteHealth(id) {
        if (!ensurePermission("health")) return;
        if (!confirm("هل تريد حذف هذا السجل؟")) return;
        const record = S.healthRecords.find((r) => r.id === id);
        S.healthRecords = S.healthRecords.filter((r) => r.id !== id);
        recordActivity(
          "delete-health-record",
          `حذف سجل صحي ${record?.medicine || id}`,
          "health",
          id,
        );
        save();
        toast("تم الحذف", "warning");
        renderHealthPage();
      }

      function renderPartnerSummary(containerId, items, emptyLabel, kind = "partner") {
        const box = document.getElementById(containerId);
        if (!box) return;
        if (!items.length) {
          box.innerHTML = `<div class="empty-box">${emptyLabel}</div>`;
          return;
        }
        box.innerHTML = `<div class="mini-list">${items
          .map(
            (item) => `
              <div class="mini-list-item">
                <div class="mini-list-head"><strong>${item.name}</strong><span class="badge ${
                  kind === "vendor" ? "badge-amber" : "badge-green"
                }">${kind === "vendor" ? "مورد" : "عميل"}</span></div>
                <div class="mini-meta">${
                  kind === "vendor"
                    ? `آخر تعامل: ${item.lastSeenAt ? fmtDate(item.lastSeenAt) : "--"}`
                    : `إجمالي الشراء: ${fmtNum(item.totalSpent || 0)} دج`
                }</div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function renderBackupList() {
        const box = document.getElementById("backup-list");
        if (!box) return;
        const items = getBackupIndex();
        if (!items.length) {
          box.innerHTML = '<div class="empty-box">لا توجد نسخ احتياطية محلية بعد.</div>';
          return;
        }
        box.innerHTML = `<div class="mini-list">${items
          .map(
            (item) => `
              <div class="mini-list-item">
                <div class="mini-list-head">
                  <strong>${item.reason || "backup"}</strong>
                  <span class="badge badge-purple">${item.version || "unknown"}</span>
                </div>
                <div class="mini-meta">${fmtDate(item.createdAt?.split("T")[0] || "")} | ${item.createdAt?.split("T")[1]?.slice(0, 5) || ""}</div>
                <div class="task-actions">
                  <button class="btn btn-xs btn-secondary" onclick="restoreBackup('${item.key}')">استعادة</button>
                </div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function backupNow() {
        if (!ensurePermission("settings")) return;
        syncStateForSave();
        createBackup(S, "manual");
        recordActivity("manual-backup", "إنشاء نسخة احتياطية محلية يدويًا", "backup", "manual");
        save();
        renderBackupList();
        renderActivityLog();
        toast("تم إنشاء نسخة احتياطية محلية", "success");
      }

      function restoreBackup(key) {
        const backup = Store.getRaw(key);
        if (!backup) {
          toast("تعذر العثور على النسخة الاحتياطية", "error");
          return;
        }
        if (!confirm("سيتم استبدال الحالة الحالية بهذه النسخة الاحتياطية. هل تريد المتابعة؟")) return;
        createBackup(S, "pre-restore");
        S = normalizeState(backup);
        recordActivity("restore-backup", `تمت استعادة النسخة ${key}`, "backup", key);
        save();
        refreshDynamicUIState();
        renderPage(currentPage);
        toast("تمت استعادة النسخة الاحتياطية", "success");
      }

      function renderActivityLog() {
        const box = document.getElementById("activity-log");
        if (!box) return;
        const items = S.activityLog.slice(0, 12);
        if (!items.length) {
          box.innerHTML = '<div class="empty-box">لا توجد أنشطة مسجلة بعد.</div>';
          return;
        }
        box.innerHTML = `<div class="mini-list">${items
          .map(
            (item) => `
              <div class="mini-list-item">
                <div class="mini-list-head"><strong>${item.action}</strong><span class="badge badge-cyan">${ROLE_OPTIONS[item.role] || item.role}</span></div>
                <div class="mini-meta">${item.details}</div>
                <div class="mini-meta">${fmtDate(item.at?.split("T")[0] || "")} | ${item.at?.split("T")[1]?.slice(0, 5) || ""}</div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function renderSystemErrorsLog() {
        const box = document.getElementById("system-errors-log");
        if (!box) return;
        const items = S.systemErrors.slice(0, 10);
        if (!items.length) {
          box.innerHTML = '<div class="empty-box">لم تُسجل أخطاء تشغيل حديثة.</div>';
          return;
        }
        box.innerHTML = `<div class="mini-list">${items
          .map(
            (item) => `
              <div class="mini-list-item">
                <div class="mini-list-head"><strong>${item.source}</strong><span class="badge badge-red">خطأ</span></div>
                <div class="mini-meta">${item.message}</div>
              </div>`,
          )
          .join("")}</div>`;
      }

      function renderRolesSummary() {
        const box = document.getElementById("roles-summary");
        if (!box) return;
        box.innerHTML = Object.entries(ROLE_OPTIONS)
          .map(([role, label]) => {
            const pages = ROLE_PERMISSIONS[role] || [];
            return `<div class="stat-row"><span class="stat-row-label">${label}</span><span class="stat-row-value">${pages.map((page) => PAGE_TITLES[page]).join("، ")}</span></div>`;
          })
          .join("");
      }

      function changeActiveRole(role) {
        if (!ROLE_OPTIONS[role]) return;
        S.settings.activeRole = role;
        recordActivity("change-role", `تم تغيير الدور النشط إلى ${ROLE_OPTIONS[role]}`, "settings", role);
        save();
        applyRolePermissions();
        if (!hasPageAccess(currentPage)) currentPage = "dashboard";
        renderPage(currentPage);
        toast(`تم تفعيل دور ${ROLE_OPTIONS[role]}`, "success");
      }

      /* ============================================================
   FINANCIALS PAGE
============================================================ */
      function renderFinancialsPage() {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const thisYear = new Date().getFullYear().toString();
        const monthSales = S.sales
          .filter((s) => s.date.startsWith(thisMonth))
          .reduce((a, s) => a + s.total, 0);
        const monthExp = S.expenses
          .filter((e) => e.date.startsWith(thisMonth))
          .reduce((a, e) => a + e.amount, 0);
        const monthProfit = monthSales - monthExp;
        const yearSales = S.sales
          .filter((s) => s.date.startsWith(thisYear))
          .reduce((a, s) => a + s.total, 0);
        const yearExp = S.expenses
          .filter((e) => e.date.startsWith(thisYear))
          .reduce((a, e) => a + e.amount, 0);
        const yearProfit = yearSales - yearExp;
        const totalEggs = S.production.reduce((s, p) => s + p.total, 0);
        const totalExp = S.expenses.reduce((s, e) => s + e.amount, 0);
        const costPerEgg =
          totalEggs > 0 ? (totalExp / totalEggs).toFixed(2) : "--";

        document.getElementById("fin-kpis").innerHTML = `
    <div class="kpi kpi-green"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">إيراد هذا الشهر</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div></div>
      <div class="kpi-value">${fmtNum(monthSales)}<span class="kpi-unit">دج</span></div>
      <div class="kpi-trend">هذا العام: ${fmtNum(yearSales)} دج</div>
    </div>
    <div class="kpi kpi-red"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">مصاريف هذا الشهر</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></div></div>
      <div class="kpi-value">${fmtNum(monthExp)}<span class="kpi-unit">دج</span></div>
      <div class="kpi-trend">هذا العام: ${fmtNum(yearExp)} دج</div>
    </div>
    <div class="kpi ${monthProfit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">صافي الربح الشهري</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div></div>
      <div class="kpi-value">${fmtNum(Math.abs(monthProfit))}<span class="kpi-unit">دج</span></div>
      <div class="kpi-trend ${monthProfit >= 0 ? "trend-up" : "trend-down"}">${monthProfit >= 0 ? "ربح" : "خسارة"} | سنوي: ${fmtNum(Math.abs(yearProfit))} دج</div>
    </div>
    <div class="kpi kpi-amber"><div class="kpi-accent-bar"></div>
      <div class="kpi-top"><div class="kpi-label">تكلفة البيضة</div><div class="kpi-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="7" ry="10"/></svg></div></div>
      <div class="kpi-value">${costPerEgg}<span class="kpi-unit">${costPerEgg != "--" ? "دج" : "  "}</span></div>
      <div class="kpi-trend">تكلفة تشغيلية لكل بيضة</div>
    </div>
  `;

        // Monthly charts
        const months = [];
        const monthRevs = [],
          monthExps = [],
          monthProfits = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const ym = d.toISOString().slice(0, 7);
          months.push(d.toLocaleString("ar-DZ", { month: "short" }));
          const rev = S.sales
            .filter((s) => s.date.startsWith(ym))
            .reduce((a, s) => a + s.total, 0);
          const exp = S.expenses
            .filter((e) => e.date.startsWith(ym))
            .reduce((a, e) => a + e.amount, 0);
          monthRevs.push(rev);
          monthExps.push(exp);
          monthProfits.push(rev - exp);
        }

        mkChart("chart-fin-bar", {
          type: "bar",
          data: {
            labels: months,
            datasets: [
              {
                label: "إيرادات",
                data: monthRevs,
                backgroundColor: "rgba(22,163,74,.6)",
                borderRadius: 4,
              },
              {
                label: "مصاريف",
                data: monthExps,
                backgroundColor: "rgba(220,38,38,.5)",
                borderRadius: 4,
              },
            ],
          },
          options: {
            ...chartDefaults,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              ...chartDefaults.plugins,
              legend: {
                display: true,
                labels: {
                  color: "#94a3b8",
                  font: { family: "Tajawal", size: 12 },
                  boxWidth: 12,
                  padding: 10,
                },
              },
            },
          },
        });

        mkChart("chart-profit-line", {
          type: "line",
          data: {
            labels: months,
            datasets: [
              {
                label: "صافي الربح",
                data: monthProfits,
                borderColor: "#22c55e",
                backgroundColor: "rgba(22,163,74,.06)",
                borderWidth: 2.5,
                pointRadius: 4,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: monthProfits.map((v) =>
                  v >= 0 ? "#22c55e" : "#ef4444",
                ),
              },
            ],
          },
          options: {
            ...chartDefaults,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              ...chartDefaults.plugins,
              tooltip: {
                ...chartDefaults.plugins.tooltip,
                callbacks: {
                  label: (ctx) =>
                    `${ctx.raw >= 0 ? "ربح" : "خسارة"}: ${fmtNum(Math.abs(ctx.raw))} دج`,
                },
              },
            },
          },
        });

        // Sales table
        const salesTbody = document.getElementById("sales-tbody");
        const sortedSales = [...S.sales].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        salesTbody.innerHTML =
          sortedSales.length === 0
            ? `<tr class="empty-row"><td colspan="6"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon-sm"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>لا توجد مبيعات</td></tr>`
            : sortedSales
                .slice(0, 15)
                .map(
                  (s) => `<tr>
      <td>${fmtDate(s.date)}</td><td>${fmtNum(s.qty)} بيضة<br><span class="meta-small">${s.items ? `كبير ${s.items.large.qty} | متوسط ${s.items.medium.qty} | صغير ${s.items.small.qty}` : "--"}</span></td>
      <td>${s.items ? `كبير ${fmtNum(s.items.large.price)} | متوسط ${fmtNum(s.items.medium.price)} | صغير ${fmtNum(s.items.small.price)}` : fmtNum(s.price)} دج</td><td>${s.buyer || "--"}</td>
      <td><strong class="text-accent-soft">${fmtNum(s.total)} دج</strong></td>
      <td><button class="btn btn-xs btn-danger" onclick="deleteSale('${s.id}')">حذف</button></td>
    </tr>`,
                )
                .join("");

        // Expenses table
        const expTbody = document.getElementById("expense-tbody");
        const sortedExp = [...S.expenses].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        const catMap = {
          feed: "علف",
          medicine: "دواء",
          electricity: "كهرباء",
          labor: "عمالة",
          maintenance: "صيانة",
          chicks: "شراء طيور",
          other: "أخرى",
        };
        expTbody.innerHTML =
          sortedExp.length === 0
            ? `<tr class="empty-row"><td colspan="5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon-sm"><line x1="12" y1="1" x2="12" y2="23"/></svg>لا توجد مصاريف</td></tr>`
            : sortedExp
                .slice(0, 15)
                .map(
                  (e) => `<tr>
      <td>${fmtDate(e.date)}</td>
      <td><span class="badge badge-amber">${catMap[e.category] || e.category}</span></td>
      <td><strong class="text-red-light">${fmtNum(e.amount)} دج</strong></td>
      <td class="table-note-muted">${e.notes || "--"}</td>
      <td><button class="btn btn-xs btn-danger" onclick="deleteExpense('${e.id}')">حذف</button></td>
                </tr>`,
              )
              .join("");
        renderPartnerSummary("vendors-summary", S.vendors, "لا يوجد موردون مسجلون بعد.", "vendor");
        renderPartnerSummary("customers-summary", S.customers, "لا يوجد عملاء مسجلون بعد.", "customer");
      }

      function addSale() {
        if (!ensurePermission("financials")) return;
        const date = document.getElementById("as-date").value;
        const items = {
          large: {
            qty: parseInt(document.getElementById("as-large-qty").value) || 0,
            price:
              parseFloat(document.getElementById("as-large-price").value) || 0,
          },
          medium: {
            qty: parseInt(document.getElementById("as-medium-qty").value) || 0,
            price:
              parseFloat(document.getElementById("as-medium-price").value) || 0,
          },
          small: {
            qty: parseInt(document.getElementById("as-small-qty").value) || 0,
            price:
              parseFloat(document.getElementById("as-small-price").value) || 0,
          },
        };
        const buyer = document.getElementById("as-buyer").value.trim();
        const notes = document.getElementById("as-notes").value.trim();
        const qty = items.large.qty + items.medium.qty + items.small.qty;
        const total =
          items.large.qty * items.large.price +
          items.medium.qty * items.medium.price +
          items.small.qty * items.small.price;
        if (!date) {
          toast("الرجاء تحديد التاريخ", "error");
          return;
        }
        if (!qty) {
          toast("الرجاء إدخال الكمية", "error");
          return;
        }
        if (!total) {
          toast("الرجاء إدخال السعر حسب الأحجام المباعة", "error");
          return;
        }
        const currentStock = recalcEggStock(S.production);
        if (qty > currentStock.available) {
          toast("كمية البيع تتجاوز المخزون المتاح من البيض", "error");
          return;
        }
        const saleId = "S" + uid();
        S.sales.push({
          id: saleId,
          date,
          qty,
          price: qty > 0 ? total / qty : 0,
          items,
          buyer,
          notes,
          total,
        });
        S.eggStock = recalcEggStock(S.production);
        recordActivity(
          "add-sale",
          `تسجيل بيع ${qty} بيضة للمشتري ${buyer || "غير محدد"}`,
          "sale",
          saleId,
        );
        save();
        closeModal("modal-add-sale");
        [
          "as-large-qty",
          "as-large-price",
          "as-medium-qty",
          "as-medium-price",
          "as-small-qty",
          "as-small-price",
          "as-buyer",
          "as-notes",
        ].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = id.includes("qty") || id.includes("price") ? "0" : "";
        });
        toast(
          "تم تسجيل بيع " + qty + " بيضة بمبلغ " + fmtNum(total) + " دج",
          "success",
        );
        renderFinancialsPage();
      }

      function addExpense() {
        if (!ensurePermission("financials")) return;
        const date = document.getElementById("ae-date").value;
        const category = document.getElementById("ae-category").value;
        const amount =
          parseFloat(document.getElementById("ae-amount").value) || 0;
        const notes = document.getElementById("ae-notes").value.trim();
        if (!date) {
          toast("الرجاء تحديد التاريخ", "error");
          return;
        }
        if (!amount) {
          toast("الرجاء إدخال المبلغ", "error");
          return;
        }
        const expenseId = "E" + uid();
        S.expenses.push({ id: expenseId, date, category, amount, notes });
        recordActivity(
          "add-expense",
          `تسجيل مصروف ${category} بقيمة ${fmtNum(amount)} دج`,
          "expense",
          expenseId,
        );
        save();
        closeModal("modal-add-expense");
        toast("تم تسجيل المصروف: " + fmtNum(amount) + " دج", "warning");
        renderFinancialsPage();
      }

      function deleteSale(id) {
        if (!ensurePermission("financials")) return;
        if (!confirm("هل تريد حذف هذا السجل؟")) return;
        const sale = S.sales.find((s) => s.id === id);
        S.sales = S.sales.filter((s) => s.id !== id);
        S.eggStock = recalcEggStock(S.production);
        recordActivity(
          "delete-sale",
          `حذف عملية بيع ${sale?.buyer || id}`,
          "sale",
          id,
        );
        save();
        toast("تم الحذف", "warning");
        renderFinancialsPage();
      }

      function deleteExpense(id) {
        if (!ensurePermission("financials")) return;
        if (!confirm("هل تريد حذف هذا السجل؟")) return;
        const expense = S.expenses.find((e) => e.id === id);
        S.expenses = S.expenses.filter((e) => e.id !== id);
        recordActivity(
          "delete-expense",
          `حذف مصروف ${expense?.category || id}`,
          "expense",
          id,
        );
        save();
        toast("تم الحذف", "warning");
        renderFinancialsPage();
      }

      /* ============================================================
   SETTINGS PAGE
============================================================ */
      function renderSettingsPage() {
        const st = S.settings;
        document.getElementById("set-farm-name").value = st.farmName;
        document.getElementById("set-owner").value = st.owner;
        document.getElementById("set-egg-price").value = st.eggPrice;
        document.getElementById("set-feed-rate").value = st.feedRate;
        document.getElementById("set-theme-mode").value = normalizeThemeMode(
          st.themeMode || getThemeMode(),
        );
        document.getElementById("set-active-role").value = st.activeRole || "manager";
        document.getElementById("set-feed-threshold").value = st.lowFeedThresholdDays || 10;
        document.getElementById("set-heat-threshold").value = st.highHeatThreshold || 34;
        document.getElementById("set-cold-threshold").value = st.coldThreshold || 10;
        updateWeatherUI();

        const totalEggs = S.production.reduce((s, p) => s + p.total, 0);
        const totalFeed = S.feedStock.reduce(
          (s, f) => s + (f.kgEquivalent || f.qty || 0),
          0,
        );
        const totalSales = S.sales.reduce((a, s) => a + s.total, 0);
        const totalExp = S.expenses.reduce((a, e) => a + e.amount, 0);
        const loc = st.location || {};
        const weather = st.weather || {};
        document.getElementById("sys-summary").innerHTML = `
    <div class="stat-row"><span class="stat-row-label">إجمالي الطيور المسجلة</span><span class="stat-row-value">${S.flock.length}</span></div>
    <div class="stat-row"><span class="stat-row-label">القطيع النشط</span><span class="stat-row-value stat-value-accent">${getActiveFlock().length}</span></div>
    <div class="stat-row"><span class="stat-row-label">إجمالي البيض المنتج</span><span class="stat-row-value">${fmtNum(totalEggs)} بيضة</span></div>
    <div class="stat-row"><span class="stat-row-label">أيام الإنتاج المسجلة</span><span class="stat-row-value">${S.production.length}</span></div>
    <div class="stat-row"><span class="stat-row-label">إجمالي العلف المشترى</span><span class="stat-row-value">${fmtNum(totalFeed)} كغ</span></div>
    <div class="stat-row"><span class="stat-row-label">دفعات التفقيس</span><span class="stat-row-value">${S.incubations.length}</span></div>
    <div class="stat-row"><span class="stat-row-label">صيصان بالحضانة</span><span class="stat-row-value">${S.hatchChicks.filter((chick) => chick.status === "brooder").length}</span></div>
    <div class="stat-row"><span class="stat-row-label">سجلات تنظيف الخم</span><span class="stat-row-value">${S.coopCleaning.length}</span></div>
    <div class="stat-row"><span class="stat-row-label">إجمالي الإيرادات</span><span class="stat-row-value stat-value-accent">${fmtNum(totalSales)} دج</span></div>
    <div class="stat-row"><span class="stat-row-label">إجمالي المصاريف</span><span class="stat-row-value stat-value-red">${fmtNum(totalExp)} دج</span></div>
    <div class="stat-row"><span class="stat-row-label">الموقع الحالي</span><span class="stat-row-value">${loc.enabled ? `${loc.city || "غير محدد"}${loc.country ? "، " + loc.country : ""}` : "غير مفعل"}</span></div>
    <div class="stat-row"><span class="stat-row-label">الطقس الحالي</span><span class="stat-row-value">${weather.temperature == null ? "غير متاح" : `${weather.temperature}°C - ${weatherCodeLabel(weather.code)}`}</span></div>
    <div class="stat-row"><span class="stat-row-label">صافي الربح الكلي</span><span class="stat-row-value ${totalSales - totalExp >= 0 ? "trend-up" : "trend-down"}">${fmtNum(Math.abs(totalSales - totalExp))} دج</span></div>
    <div class="stat-row"><span class="stat-row-label">إصدار النظام</span><span class="stat-row-value text-muted-soft">V2.0</span></div>
    `;
        renderBackupList();
        renderActivityLog();
        renderSystemErrorsLog();
        renderRolesSummary();
      }

      function saveSettings() {
        if (!ensurePermission("settings")) return;
        const farmName = document.getElementById("set-farm-name").value.trim();
        const owner = document.getElementById("set-owner").value.trim();
        const eggPrice = parseFloat(
          document.getElementById("set-egg-price").value,
        );
        const feedRate = parseFloat(
          document.getElementById("set-feed-rate").value,
        );
        const themeMode = normalizeThemeMode(
          document.getElementById("set-theme-mode").value,
        );
        const lowFeedThresholdDays = parseInt(
          document.getElementById("set-feed-threshold").value,
        );
        const highHeatThreshold = parseFloat(
          document.getElementById("set-heat-threshold").value,
        );
        const coldThreshold = parseFloat(
          document.getElementById("set-cold-threshold").value,
        );

        if (!farmName) {
          toast("اسم المزرعة مطلوب", "error");
          return;
        }
        if (!owner) {
          toast("اسم المالك مطلوب", "error");
          return;
        }
        if (!eggPrice || eggPrice <= 0) {
          toast("سعر البيضة يجب أن يكون أكبر من صفر", "error");
          return;
        }
        if (!feedRate || feedRate <= 0) {
          toast("استهلاك العلف يجب أن يكون أكبر من صفر", "error");
          return;
        }
        if (!lowFeedThresholdDays || lowFeedThresholdDays <= 0) {
          toast("حد تنبيه العلف يجب أن يكون أكبر من صفر", "error");
          return;
        }

        S.settings.farmName = farmName;
        S.settings.owner = owner;
        S.settings.eggPrice = eggPrice;
        S.settings.feedRate = feedRate;
        S.settings.themeMode = themeMode;
        S.settings.lowFeedThresholdDays = lowFeedThresholdDays;
        S.settings.highHeatThreshold = highHeatThreshold || 34;
        S.settings.coldThreshold = coldThreshold || 10;
        applyThemeMode(themeMode, true);
        if (currentAccount) {
          currentAccount.farmName = farmName;
          currentAccount.fullName = owner;
          const accounts = getAccounts().map((account) =>
            account.id === currentAccount.id ? { ...account, farmName, fullName: owner } : account,
          );
          setAccounts(accounts);
        }
        recordActivity("save-settings", "تم تحديث إعدادات النظام", "settings", "main");
        save();
        document.querySelector(".brand-name").textContent = S.settings.farmName;
        updateAuthUI();
        updateWeatherUI();
        applyRolePermissions();
        renderPage(currentPage);
        toast("تم حفظ الإعدادات", "success");
        if (currentAccount) {
          apiRequest("/auth/profile", {
            method: "PUT",
            body: JSON.stringify({ fullName: owner, farmName }),
          })
            .then((payload) => {
              currentAccount = payload.user;
              const accounts = getAccounts().map((account) =>
                account.id === currentAccount.id ? payload.user : account,
              );
              setAccounts(accounts);
              updateAuthUI();
            })
            .catch((error) => recordSystemError("profile-sync", error));
        }
      }

      /* ============================================================
   PAGINATION HELPER
============================================================ */
      function renderPagination(containerId, current, total, onPageChange) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (total <= 1) {
          el.innerHTML = "";
          return;
        }
        let html = `<button class="pag-btn" ${current === 1 ? "disabled" : ""} onclick="(${onPageChange.toString()})(${current - 1})">&laquo;</button>`;
        for (let i = 1; i <= total; i++) {
          if (
            total > 7 &&
            i > 2 &&
            i < total - 1 &&
            Math.abs(i - current) > 1
          ) {
            if (i === 3 || i === total - 2)
              html += `<span class="ellipsis-separator">…</span>`;
            continue;
          }
          html += `<button class="pag-btn ${i === current ? "active" : ""}" onclick="(${onPageChange.toString()})(${i})">${i}</button>`;
        }
        html += `<button class="pag-btn" ${current === total ? "disabled" : ""} onclick="(${onPageChange.toString()})(${current + 1})">&raquo;</button>`;
        el.innerHTML = html;
      }

      /* ============================================================
   EXPORT / IMPORT
============================================================ */
      const App = {
        export: {
          json() {
            const blob = new Blob([JSON.stringify(S, null, 2)], {
              type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `balhadj_farm_backup_${todayStr()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            recordActivity("export-json", "تصدير نسخة JSON كاملة من البيانات", "export", "json");
            save();
            toast("تم تصدير النسخة الاحتياطية", "success");
          },
          csvProduction() {
            const header = [
              "التاريخ",
              "إجمالي البيض",
              "البيض التالف",
              "كبير",
              "متوسط",
              "صغير",
              "أبيض ناصع",
              "كريمي",
              "منقط",
              "بني فاتح",
              "مباع",
              "مهدى",
              "مائدة العائلة",
              "مخصص للتفقيس",
              "المتاح بالمخزون",
              "الطيور المنتجة",
              "ملاحظات",
            ];
            const rows = S.production.map((p) => [
              p.date,
              p.total,
              p.broken,
              p.sizes?.large || 0,
              p.sizes?.medium || 0,
              p.sizes?.small || 0,
              p.colors?.whitePure || 0,
              p.colors?.cream || 0,
              p.colors?.speckled || 0,
              p.colors?.lightBrown || 0,
              p.usage?.sold || 0,
              p.usage?.gifted || 0,
              p.usage?.family || 0,
              p.usage?.hatching || 0,
              Math.max(
                0,
                p.total -
                  (p.broken || 0) -
                  (p.usage?.sold || 0) -
                  (p.usage?.gifted || 0) -
                  (p.usage?.family || 0) -
                  (p.usage?.hatching || 0),
              ),
              p.producingBirds || 0,
              p.notes || "",
            ]);
            downloadCSV([header, ...rows], `production_${todayStr()}.csv`);
            recordActivity("export-production-csv", "تصدير تقرير CSV للإنتاج", "export", "production");
            save();
            toast("تم تصدير بيانات الإنتاج", "success");
          },
          csvFinancials() {
            const header = ["التاريخ", "النوع", "الفئة", "المبلغ", "ملاحظة"];
            const rows = [
              ...S.sales.map((s) => [
                s.date,
                "بيع",
                "",
                s.total,
                s.items
                  ? `بيع ${s.qty} بيضة | كبير ${s.items.large.qty}×${s.items.large.price} - متوسط ${s.items.medium.qty}×${s.items.medium.price} - صغير ${s.items.small.qty}×${s.items.small.price} | ${s.buyer || ""}`
                  : `بيع ${s.qty} بيضة - ${s.buyer || ""}`,
              ]),
              ...S.expenses.map((e) => [
                e.date,
                "مصروف",
                e.category,
                e.amount,
                e.notes || "",
              ]),
            ].sort((a, b) => b[0].localeCompare(a[0]));
            downloadCSV([header, ...rows], `financials_${todayStr()}.csv`);
            recordActivity("export-financials-csv", "تصدير تقرير CSV للمالية", "export", "financials");
            save();
            toast("تم تصدير البيانات المالية", "success");
          },
        },
        import: {
          json(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const imported = JSON.parse(e.target.result);
                if (!imported.flock) throw new Error("ملف غير صالح");
                createBackup(S, "pre-import");
                S = normalizeState(imported);
                recordActivity("import-json", "استيراد بيانات من ملف JSON", "import", "json");
                save();
                refreshDynamicUIState();
                renderPage(currentPage);
                toast("تم استيراد البيانات بنجاح", "success");
              } catch (err) {
                toast("خطأ: ملف JSON غير صالح", "error");
              }
              event.target.value = "";
            };
            reader.readAsText(file);
          },
        },
      };

      function downloadCSV(rows, filename) {
        const csv =
          "\uFEFF" +
          rows
            .map((r) =>
              r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","),
            )
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      function confirmReset() {
        if (!ensurePermission("settings")) return;
        if (!confirm("تحذير: سيتم حذف جميع البيانات نهائياً. هل أنت متأكد؟"))
          return;
        if (!confirm("تأكيد أخير: سيتم مسح كل البيانات ولا يمكن التراجع."))
          return;
        createBackup(S, "pre-reset");
        Store.clear();
        S = normalizeState(defaultState());
        recordActivity("reset-system", "إعادة ضبط النظام بالكامل إلى الحالة الافتراضية", "settings", "reset");
        save();
        refreshDynamicUIState();
        renderPage(currentPage);
        toast("تم مسح جميع البيانات", "warning");
      }

      /* ============================================================
   INITIALIZE
============================================================ */
      (async function init() {
        cleanupBrokenSessionScopedStorage();
        applyThemeMode(getSavedThemeMode(), false);
        bindThemePreferenceListener();
        updateAuthSupportInfo();
        // Set today as default for all date inputs
        const today = todayStr();
        [
          "qp-date",
          "ap-date",
          "ab-entry",
          "ab-hatch",
          "exit-date",
          "af-date",
          "ah-date",
          "inc-start-date",
          "ilog-date",
          "cl-date",
          "as-date",
          "ae-date",
        ].forEach((id) => {
          const el = document.getElementById(id);
          if (el && !el.value) el.value = today;
        });

        updateAuthUI();
        switchAuthMode("login");
        const authServiceReady = await checkAuthService();
        if (await handleAuthUrlActions()) {
          // handled by token-based auth flow already
        } else {
          setAuthMessage(
            authServiceReady
              ? (getLegacyCandidate()
                ? "يمكنك إنشاء أول حساب، وسيتم ربط البيانات المحلية الحالية بهذه المزرعة تلقائيًا."
                : "سجّل الدخول للوصول إلى مزرعتك، أو أنشئ حسابًا جديدًا إذا كانت هذه أول مرة.")
              : "خدمة الحسابات غير متاحة الآن. تحقق من إعدادات الخادم أو أعد المحاولة بعد قليل.",
            authServiceReady ? "info" : "warning",
          );
        }

        ["ab-breed", "ab-acquisition"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.addEventListener("change", refreshBirdFormVisibility);
        });
        const entryUnknownCheckbox = document.getElementById("ab-entry-unknown");
        if (entryUnknownCheckbox) {
          entryUnknownCheckbox.addEventListener(
            "change",
            refreshBirdFormVisibility,
          );
        }
        ["af-type", "af-unit"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.addEventListener("change", refreshFeedFormVisibility);
        });
        const incubationType = document.getElementById("inc-type");
        if (incubationType) {
          incubationType.addEventListener("change", refreshIncubationFormVisibility);
        }
        const healthTemplate = document.getElementById("ah-template");
        if (healthTemplate) {
          healthTemplate.addEventListener("change", syncHealthTemplateFields);
        }
        const healthDate = document.getElementById("ah-date");
        if (healthDate) {
          healthDate.addEventListener("change", syncHealthTemplateFields);
        }

        const accountPill = document.getElementById("current-account-name");
        if (accountPill) accountPill.textContent = "ضيف";
        registerPWA();
        updateInstallButtons();

        // Start clock
        startClock();

        // Overlay event delegation
        document.querySelectorAll(".overlay").forEach((ov) => {
          ov.addEventListener("click", (e) => {
            if (e.target === ov) closeModal(ov.id);
          });
        });

        const token = getAuthToken();
        if (!token) return;

        try {
          const payload = await apiRequest("/auth/me");
          await bootstrapAccountSession(payload.user);
          ensureAccountState(payload.user, "init");
          if (S.settings.location?.enabled) {
            refreshWeather();
          }
          const hash = window.location.hash.replace("#", "");
          if (hash && PAGE_TITLES[hash]) navTo(hash);
          else renderPage("dashboard");
          if (bootNotice) toast(bootNotice, "info");
        } catch (error) {
          setAuthToken("");
          setActiveAccountId("");
          currentAccount = null;
          S = null;
          updateAuthUI();
          setAuthMessage("تعذر استعادة الجلسة الحالية. سجّل الدخول من جديد.", "warning");
        }
      })();
