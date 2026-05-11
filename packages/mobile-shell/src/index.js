const React = require("react");
const { PRODUCT_PLANS, MOBILE_FEATURES } = require("@farm/core");

function AppShell({ platformName, ReactNative }) {
  const {
    SafeAreaView,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
  } = ReactNative;
  const h = React.createElement;

  const [mode, setMode] = React.useState("login");
  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [registerName, setRegisterName] = React.useState("");
  const [registerFarm, setRegisterFarm] = React.useState("");
  const [registerEmail, setRegisterEmail] = React.useState("");
  const [registerPassword, setRegisterPassword] = React.useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [account, setAccount] = React.useState(null);
  const [summary, setSummary] = React.useState(null);
  const [token, setToken] = React.useState("");

  // In local emulator runs we use adb reverse, so localhost is the most stable
  // address for both the Expo bundle and the auth API.
  const apiBase = "http://127.0.0.1:8787/api";

  const styles = StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: "#060e1a",
    },
    container: {
      flexGrow: 1,
      padding: 20,
      gap: 18,
    },
    brandBox: {
      backgroundColor: "#0d1829",
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.07)",
      gap: 8,
    },
    title: {
      color: "#f1f5f9",
      fontSize: 26,
      fontWeight: "800",
      textAlign: "right",
    },
    subtitle: {
      color: "#94a3b8",
      fontSize: 14,
      lineHeight: 22,
      textAlign: "right",
    },
    card: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.07)",
      gap: 10,
    },
    cardTitle: {
      color: "#f1f5f9",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "right",
    },
    input: {
      backgroundColor: "rgba(255,255,255,0.05)",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: "#f1f5f9",
      textAlign: "right",
    },
    button: {
      backgroundColor: "#16a34a",
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonSecondary: {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    buttonText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 15,
    },
    buttonSecondaryText: {
      color: "#cbd5e1",
      fontWeight: "700",
      fontSize: 14,
    },
    sectionLabel: {
      color: "#22c55e",
      fontSize: 13,
      fontWeight: "700",
      textAlign: "right",
    },
    listItem: {
      color: "#cbd5e1",
      lineHeight: 24,
      textAlign: "right",
    },
    planPrice: {
      color: "#22c55e",
      fontSize: 20,
      fontWeight: "800",
      textAlign: "right",
    },
    tabs: {
      flexDirection: "row-reverse",
      gap: 8,
    },
    tab: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.05)",
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.07)",
    },
    tabActive: {
      backgroundColor: "rgba(22,163,74,0.15)",
      borderColor: "rgba(22,163,74,0.3)",
    },
    tabText: {
      color: "#94a3b8",
      fontWeight: "700",
    },
    tabTextActive: {
      color: "#22c55e",
    },
    message: {
      color: "#fcd34d",
      lineHeight: 22,
      textAlign: "right",
    },
    metricsRow: {
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 12,
    },
    metric: {
      flexBasis: "47%",
      backgroundColor: "rgba(255,255,255,0.03)",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.07)",
      gap: 6,
    },
    metricLabel: {
      color: "#94a3b8",
      fontSize: 12,
      textAlign: "right",
    },
    metricValue: {
      color: "#f1f5f9",
      fontSize: 20,
      fontWeight: "800",
      textAlign: "right",
    },
  });

  async function request(path, options = {}, authToken = token) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "تعذر إكمال الطلب");
    return payload;
  }

  function buildSummary(state) {
    const flock = Array.isArray(state?.flock) ? state.flock : [];
    const production = Array.isArray(state?.production) ? state.production : [];
    const incubations = Array.isArray(state?.incubations) ? state.incubations : [];
    const expenses = Array.isArray(state?.expenses) ? state.expenses : [];
    const sales = Array.isArray(state?.sales) ? state.sales : [];
    return {
      activeBirds: flock.filter((bird) => bird.active).length,
      productionDays: production.length,
      incubating: incubations.filter((batch) => batch.status === "incubating").length,
      financialRecords: expenses.length + sales.length,
    };
  }

  async function loadDashboard(nextToken) {
    const payload = await request("/state", {}, nextToken);
    setSummary(buildSummary(payload.state || {}));
  }

  async function handleLogin() {
    if (!loginEmail || !loginPassword) {
      setMessage("أدخل البريد وكلمة المرور أولًا.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const payload = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      }, "");
      setToken(payload.token);
      setAccount(payload.user);
      await loadDashboard(payload.token);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!registerName || !registerFarm || !registerEmail || !registerPassword) {
      setMessage("أكمل بيانات إنشاء الحساب قبل المتابعة.");
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      setMessage("تأكيد كلمة المرور غير مطابق.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const payload = await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: registerName,
          farmName: registerFarm,
          email: registerEmail,
          password: registerPassword,
          initialState: {
            meta: { version: "2.0" },
            settings: {
              farmName: registerFarm,
              owner: registerName,
              eggPrice: 12,
              feedRate: 0.12,
            },
            flock: [],
            production: [],
            incubations: [],
            expenses: [],
            sales: [],
          },
        }),
      }, "");
      setToken(payload.token);
      setAccount(payload.user);
      await loadDashboard(payload.token);
      setMode("login");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken("");
    setAccount(null);
    setSummary(null);
    setMessage("");
  }

  function renderMetric(label, value) {
    return h(
      View,
      { style: styles.metric, key: label },
      h(Text, { style: styles.metricLabel }, label),
      h(Text, { style: styles.metricValue }, String(value)),
    );
  }

  function renderAuthCard() {
    return h(
      View,
      { style: styles.card },
      h(
        View,
        { style: styles.tabs },
        h(
          TouchableOpacity,
          {
            style: [styles.tab, mode === "login" && styles.tabActive],
            onPress: () => setMode("login"),
          },
          h(Text, { style: [styles.tabText, mode === "login" && styles.tabTextActive] }, "تسجيل الدخول"),
        ),
        h(
          TouchableOpacity,
          {
            style: [styles.tab, mode === "register" && styles.tabActive],
            onPress: () => setMode("register"),
          },
          h(Text, { style: [styles.tabText, mode === "register" && styles.tabTextActive] }, "إنشاء حساب"),
        ),
      ),
      h(Text, { style: styles.cardTitle }, mode === "login" ? "الدخول إلى المزرعة" : "إنشاء حساب جديد"),
      message ? h(Text, { style: styles.message }, message) : null,
      mode === "login"
        ? [
            h(TextInput, {
              key: "login-email",
              style: styles.input,
              placeholder: "البريد الإلكتروني",
              placeholderTextColor: "#64748b",
              value: loginEmail,
              onChangeText: setLoginEmail,
              autoCapitalize: "none",
              textAlign: "right",
            }),
            h(TextInput, {
              key: "login-password",
              style: styles.input,
              placeholder: "كلمة المرور",
              placeholderTextColor: "#64748b",
              value: loginPassword,
              onChangeText: setLoginPassword,
              secureTextEntry: true,
              textAlign: "right",
            }),
            h(
              TouchableOpacity,
              {
                key: "login-button",
                style: styles.button,
                onPress: handleLogin,
                disabled: loading,
              },
              h(Text, { style: styles.buttonText }, loading ? "جارٍ الدخول..." : "دخول"),
            ),
          ]
        : [
            h(TextInput, {
              key: "register-name",
              style: styles.input,
              placeholder: "اسم صاحب المزرعة",
              placeholderTextColor: "#64748b",
              value: registerName,
              onChangeText: setRegisterName,
              textAlign: "right",
            }),
            h(TextInput, {
              key: "register-farm",
              style: styles.input,
              placeholder: "اسم المزرعة",
              placeholderTextColor: "#64748b",
              value: registerFarm,
              onChangeText: setRegisterFarm,
              textAlign: "right",
            }),
            h(TextInput, {
              key: "register-email",
              style: styles.input,
              placeholder: "البريد الإلكتروني",
              placeholderTextColor: "#64748b",
              value: registerEmail,
              onChangeText: setRegisterEmail,
              autoCapitalize: "none",
              textAlign: "right",
            }),
            h(TextInput, {
              key: "register-password",
              style: styles.input,
              placeholder: "كلمة المرور",
              placeholderTextColor: "#64748b",
              value: registerPassword,
              onChangeText: setRegisterPassword,
              secureTextEntry: true,
              textAlign: "right",
            }),
            h(TextInput, {
              key: "register-password-confirm",
              style: styles.input,
              placeholder: "تأكيد كلمة المرور",
              placeholderTextColor: "#64748b",
              value: registerPasswordConfirm,
              onChangeText: setRegisterPasswordConfirm,
              secureTextEntry: true,
              textAlign: "right",
            }),
            h(
              TouchableOpacity,
              {
                key: "register-button",
                style: styles.button,
                onPress: handleRegister,
                disabled: loading,
              },
              h(Text, { style: styles.buttonText }, loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"),
            ),
          ],
    );
  }

  function renderDashboard() {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.cardTitle }, `مرحبًا ${account.fullName}`),
      h(Text, { style: styles.subtitle }, `${account.farmName} | ${platformName}`),
      h(
        View,
        { style: styles.metricsRow },
        renderMetric("القطيع النشط", summary?.activeBirds ?? 0),
        renderMetric("أيام الإنتاج", summary?.productionDays ?? 0),
        renderMetric("دفعات التفقيس", summary?.incubating ?? 0),
        renderMetric("سجلات مالية", summary?.financialRecords ?? 0),
      ),
      h(
        TouchableOpacity,
        { style: styles.buttonSecondary, onPress: () => loadDashboard(token) },
        h(Text, { style: styles.buttonSecondaryText }, "تحديث الملخص"),
      ),
      h(
        TouchableOpacity,
        { style: styles.buttonSecondary, onPress: logout },
        h(Text, { style: styles.buttonSecondaryText }, "تسجيل الخروج"),
      ),
    );
  }

  return h(
    SafeAreaView,
    { style: styles.safe },
    h(
      ScrollView,
      { contentContainerStyle: styles.container },
      h(
        View,
        { style: styles.brandBox },
        h(Text, { style: styles.title }, `تطبيق المزرعة - ${platformName}`),
        h(
          Text,
          { style: styles.subtitle },
          "نسخة هاتفية مرتبطة بنفس نظام الحسابات، مصممة لتسجيل البيانات والمتابعة السريعة من الهاتف.",
        ),
      ),
      account ? renderDashboard() : renderAuthCard(),
      h(
        View,
        { style: styles.card },
        h(Text, { style: styles.sectionLabel }, "ما الذي سيجده المستخدم داخل التطبيق"),
        ...MOBILE_FEATURES.map((feature) => h(Text, { key: feature, style: styles.listItem }, `• ${feature}`)),
      ),
      h(
        View,
        { style: styles.card },
        h(Text, { style: styles.sectionLabel }, "نماذج البيع المقترحة"),
        ...PRODUCT_PLANS.map((plan) =>
          h(
            View,
            { key: plan.id, style: { gap: 4, marginBottom: 10 } },
            h(Text, { style: styles.cardTitle }, plan.name),
            h(Text, { style: styles.planPrice }, `${plan.priceDzd} دج`),
            h(Text, { style: styles.listItem }, plan.subtitle),
          ),
        ),
      ),
    ),
  );
}

module.exports = {
  AppShell,
};
