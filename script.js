// حالة النظام المركزية
let state = {
    birds: JSON.parse(localStorage.getItem('birds')) || [],
    production: JSON.parse(localStorage.getItem('production')) || [],
    stock: parseFloat(localStorage.getItem('stock')) || 0,
    settings: { darkMode: false, feedPrice: 0 }
};

// وظائف التبويبات
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    render();
}

// إضافة إنتاج وخصم العلف تلقائياً (Logic 1 & 18)
function saveProduction() {
    const qty = parseInt(document.getElementById('prodQty').value);
    const date = document.getElementById('prodDate').value;
    const color = document.getElementById('prodColor').value;
    
    if(!qty || !date) return alert("أدخل البيانات كاملة!");

    // خصم العلف (120ج لكل طائر)
    const consumption = state.birds.length * 0.12;
    state.stock -= consumption;
    
    state.production.push({ id: Date.now(), qty, date, color, note: document.getElementById('prodNote').value });
    saveToDisk();
    render();
}

// حفظ البيانات في LocalStorage
function saveToDisk() {
    localStorage.setItem('birds', JSON.stringify(state.birds));
    localStorage.setItem('production', JSON.stringify(state.production));
    localStorage.setItem('stock', state.stock.toString());
}

// تحديث الواجهة والرسوم البيانية
function render() {
    // تحديث الإحصائيات (KPIs)
    document.getElementById('current-stock').innerText = state.stock.toFixed(2);
    document.getElementById('birdTotal') ? document.getElementById('birdTotal').innerText = state.birds.length : null;
    
    const daysLeft = state.birds.length > 0 ? (state.stock / (state.birds.length * 0.12)).toFixed(0) : 0;
    document.getElementById('days-left').innerText = daysLeft;
    
    renderChart();
    renderTables();
}

// رسم بياني متطور
function renderChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if(window.myChart) window.myChart.destroy();
    
    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: state.production.map(p => p.date),
            datasets: [{
                label: 'إنتاج البيض',
                data: state.production.map(p => p.qty),
                borderColor: '#27ae60',
                tension: 0.3,
                fill: true
            }]
        }
    });
}

// تصدير البيانات الشامل (JSON)
function exportFullData() {
    const blob = new Blob([JSON.stringify(state)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ouargla_farm_backup_${new Date().toLocaleDateString()}.json`;
    a.click();
}

// الوضع الليلي
function toggleDarkMode() {
    state.settings.darkMode = !state.settings.darkMode;
    document.body.setAttribute('data-theme', state.settings.darkMode ? 'dark' : 'light');
}

// استدعاء أولي
render();