// Data model stored in localStorage under key 'ibrahimAccountingV1'
// Structure:
// {
//   items: {
//     [nameLower]: {
//       name: string,
//       priceHistory: [{ price: number, date: 'YYYY-MM-DD' }],
//       quantities: { 'YYYY-MM': number }
//     }
//   }
// }

(function(){
  const STORAGE_KEY = 'ibrahimAccountingV1';

  function loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { items: {}, sales: [], monthlySnapshots: {} };
      const data = JSON.parse(raw);
      if(!data.items) data.items = {};
      if(!data.sales) data.sales = [];
      if(!data.monthlySnapshots) data.monthlySnapshots = {};
      return data;
    } catch (e) {
      console.error('Failed to load state', e);
      return { items: {}, sales: [], monthlySnapshots: {} };
    }
  }

  function saveState(state){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeName(name){
    return name.trim().toLowerCase();
  }

  function formatCurrency(n){
    return Number(n || 0).toFixed(2);
  }

  function ymd(date){
    if(!date) return new Date().toISOString().slice(0,10);
    return date;
  }

  function ym(date){
    return ymd(date).slice(0,7);
  }

  function getLatestPrice(item){
    const hist = item.priceHistory || [];
    if(hist.length === 0) return 0;
    return hist.slice().sort((a,b)=>a.date.localeCompare(b.date)).pop().price;
  }

  function logQuantityChange(item, month, dateStr, delta, source){
    if(!item.qtyHistory) item.qtyHistory = [];
    if(delta === 0) return;
    item.qtyHistory.push({ month, date: dateStr, delta, source });
  }

  // Views switching
  const menu = document.querySelector('.menu');
  const views = document.querySelectorAll('.view');
  if(menu){
    menu.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-view]');
      if(!btn) return;
      const id = btn.getAttribute('data-view');
      views.forEach(v=>v.classList.remove('active'));
      document.getElementById(`view-${id}`).classList.add('active');
      if(id === 'update') refreshDatalist();
      if(id === 'report') renderMonthlyReport();
      if(id === 'yearly') renderYearly();
      if(id === 'add') renderItemsTable();
      if(id === 'sale') { refreshDatalist(); renderSalesTable(); initSaleDefaults(); }
      if(id === 'sales-report') { initSalesReportDefaults(); renderSalesReport(); }
    });
  }

  // Add item
  const addForm = document.getElementById('add-form');
  addForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = document.getElementById('add-name').value.trim();
    const price = parseFloat(document.getElementById('add-price').value);
    const qty = parseInt(document.getElementById('add-qty').value,10);
    const date = document.getElementById('add-date').value;
    if(!name || isNaN(price) || isNaN(qty) || qty <= 0){
      alert('Please provide valid name, price, and quantity.');
      return;
    }
    const monthKey = ym(date);
    const key = normalizeName(name);
    const state = loadState();
    if(!state.items[key]){
      state.items[key] = {
        name: name.trim(),
        priceHistory: [{ price, date: ymd(date) }],
        quantities: { [monthKey]: qty },
        qtyHistory: [{ month: monthKey, date: ymd(date), delta: qty, source: 'addForm' }]
      };
    } else {
      const item = state.items[key];
      // Update latest price if new price differs
      const latestPrice = getLatestPrice(item);
      if(latestPrice !== price){
        item.priceHistory.push({ price, date: ymd(date) });
      }
      item.quantities[monthKey] = (item.quantities[monthKey] || 0) + qty;
      logQuantityChange(item, monthKey, ymd(date), qty, 'addForm');
    }
    saveState(state);
    addForm.reset();
    document.getElementById('add-qty').value = 1;
    const today = new Date().toISOString().slice(0,10);
    document.getElementById('add-date').value = today;
    renderItemsTable();
    refreshDatalist();
  });

  // Update price
  const updateForm = document.getElementById('update-form');
  updateForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = document.getElementById('update-name').value.trim();
    const price = parseFloat(document.getElementById('update-price').value);
    const date = document.getElementById('update-date').value;
    if(!name || isNaN(price)){
      alert('Please select item and enter a valid price.');
      return;
    }
    const key = normalizeName(name);
    const state = loadState();
    if(!state.items[key]){
      alert('Item not found.');
      return;
    }
    state.items[key].priceHistory.push({ price, date: ymd(date) });
    saveState(state);
    document.getElementById('update-price').value = '';
    renderPriceHistory();
    renderItemsTable();
  });

  // Delete selected items
  const deleteBtn = document.getElementById('delete-selected');
  deleteBtn.addEventListener('click', ()=>{
    const checkboxes = document.querySelectorAll('#items-table tbody input[type="checkbox"]:checked');
    if(checkboxes.length === 0){ alert('Select items to delete.'); return; }
    if(!confirm('Delete selected items? This cannot be undone.')) return;
    const state = loadState();
    checkboxes.forEach(cb=>{
      const key = cb.getAttribute('data-key');
      delete state.items[key];
    });
    saveState(state);
    renderItemsTable();
    refreshDatalist();
  });

  // Select all checkbox
  const selectAll = document.getElementById('select-all');
  selectAll.addEventListener('change', ()=>{
    const checked = selectAll.checked;
    document.querySelectorAll('#items-table tbody input[type="checkbox"]').forEach(cb=>cb.checked = checked);
  });

  // Search
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', ()=>{
    renderItemsTable();
  });

  function refreshDatalist(){
    const dl = document.getElementById('items-datalist');
    const state = loadState();
    dl.innerHTML = '';
    Object.values(state.items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(item=>{
      const opt = document.createElement('option');
      opt.value = item.name;
      dl.appendChild(opt);
    });
    renderPriceHistory();
  }

  function renderItemsTable(){
    const tbody = document.querySelector('#items-table tbody');
    const state = loadState();
    const month = document.getElementById('report-month')?.value || new Date().toISOString().slice(0,7);
    const filter = searchInput.value.trim().toLowerCase();
    let grand = 0;
    tbody.innerHTML = '';
    Object.entries(state.items)
      .map(([key, item])=>({ key, item }))
      .filter(({item})=> item.name.toLowerCase().includes(filter))
      .sort((a,b)=>a.item.name.localeCompare(b.item.name))
      .forEach(({key, item})=>{
        const price = getLatestPrice(item);
        const qty = item.quantities[month] || 0;
        const total = price * qty;
        grand += total;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" data-key="${key}"></td>
          <td>${item.name}</td>
          <td><input type="number" class="inline-price" data-key="${key}" value="${Number(price).toFixed(2)}" min="0" step="0.01" style="width:100px"></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" class="qty-dec" data-key="${key}">-</button>
              <input type="number" class="inline-qty" data-key="${key}" value="${qty}" min="0" step="1" style="width:90px">
              <button type="button" class="qty-inc" data-key="${key}">+</button>
            </div>
          </td>
          <td>${formatCurrency(total)}</td>
        `;
        tbody.appendChild(tr);
      });
    document.getElementById('add-grand-total').textContent = formatCurrency(grand);
  }

  // Inline quantity editing handler
  document.getElementById('items-table').addEventListener('input', (e)=>{
    const input = e.target.closest('input.inline-qty');
    if(!input) return;
    const key = input.getAttribute('data-key');
    let qty = parseInt(input.value, 10);
    if(isNaN(qty) || qty < 0) qty = 0;
    const month = document.getElementById('report-month')?.value || new Date().toISOString().slice(0,7);
    const state = loadState();
    if(!state.items[key]) return;
    const current = state.items[key].quantities[month] || 0;
    const delta = qty - current;
    state.items[key].quantities[month] = qty;
    logQuantityChange(state.items[key], month, new Date().toISOString().slice(0,10), delta, 'inlineEdit');
    saveState(state);
    renderItemsTable();
  });

  // Inline price change (save latest price with today's date) on change to avoid excessive writes
  document.getElementById('items-table').addEventListener('change', (e)=>{
    const input = e.target.closest('input.inline-price');
    if(!input) return;
    const key = input.getAttribute('data-key');
    const price = parseFloat(input.value);
    if(isNaN(price) || price < 0) { input.value = '0.00'; return; }
    const state = loadState();
    if(!state.items[key]) return;
    const today = new Date().toISOString().slice(0,10);
    const latest = getLatestPrice(state.items[key]);
    if(latest !== price){
      state.items[key].priceHistory.push({ price, date: today });
      saveState(state);
      renderItemsTable();
      renderPriceHistory();
    }
  });

  // +/- buttons for quantity
  document.getElementById('items-table').addEventListener('click', (e)=>{
    const decBtn = e.target.closest('button.qty-dec');
    const incBtn = e.target.closest('button.qty-inc');
    if(!decBtn && !incBtn) return;
    const key = (decBtn || incBtn).getAttribute('data-key');
    const month = document.getElementById('report-month')?.value || new Date().toISOString().slice(0,7);
    const state = loadState();
    if(!state.items[key]) return;
    const current = state.items[key].quantities[month] || 0;
    const next = decBtn ? Math.max(0, current - 1) : current + 1;
    const delta = next - current;
    state.items[key].quantities[month] = next;
    logQuantityChange(state.items[key], month, new Date().toISOString().slice(0,10), delta, decBtn ? 'minus' : 'plus');
    saveState(state);
    renderItemsTable();
  });

  // Add view month selector
  const addMonthEl = document.getElementById('add-month');
  if(addMonthEl){
    const m = new Date().toISOString().slice(0,7);
    if(!addMonthEl.value) addMonthEl.value = m;
    addMonthEl.addEventListener('change', ()=>{
      renderItemsTable();
    });
  }

  function renderPriceHistory(){
    const tbody = document.querySelector('#price-history-table tbody');
    const state = loadState();
    const rows = [];
    Object.values(state.items).forEach(item=>{
      (item.priceHistory||[]).forEach(ph=>{
        rows.push({ name: item.name, price: ph.price, date: ph.date });
      });
    });
    rows.sort((a,b)=> a.name.localeCompare(b.name) || a.date.localeCompare(b.date));
    tbody.innerHTML = '';
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${formatCurrency(r.price)}</td><td>${r.date}</td>`;
      tbody.appendChild(tr);
    });
  }

  // --- Sales ---
  function initSaleDefaults(){
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const saleDate = document.getElementById('sale-date');
    const salesMonth = document.getElementById('sales-month');
    if(saleDate && !saleDate.value) saleDate.value = dateStr;
    if(salesMonth && !salesMonth.value) salesMonth.value = `${yyyy}-${mm}`;
  }

  // Autofill sale price when product chosen
  const saleItemInput = document.getElementById('sale-item');
  const salePriceInput = document.getElementById('sale-price');
  if(saleItemInput){
    saleItemInput.addEventListener('change', ()=>{
      const key = normalizeName(saleItemInput.value || '');
      const state = loadState();
      const item = state.items[key];
      if(item){
        salePriceInput.value = Number(getLatestPrice(item)).toFixed(2);
      }
    });
  }

  const saleForm = document.getElementById('sale-form');
  if(saleForm){
    saleForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const date = document.getElementById('sale-date').value;
      const buyer = document.getElementById('sale-buyer').value.trim();
      const address = document.getElementById('sale-address').value.trim();
      const contact = document.getElementById('sale-contact').value.trim();
      const itemName = document.getElementById('sale-item').value.trim();
      const price = parseFloat(document.getElementById('sale-price').value);
      const qty = parseInt(document.getElementById('sale-qty').value,10);
      const manualProfitInput = document.getElementById('sale-profit');
      const manualProfitVal = manualProfitInput && manualProfitInput.value !== '' ? parseFloat(manualProfitInput.value) : null;
      if(!date || !buyer || !address || !contact || !itemName || isNaN(price) || isNaN(qty) || qty <= 0){
        alert('Please fill all fields correctly.');
        return;
      }
      const monthKey = ym(date);
      const key = normalizeName(itemName);
      const state = loadState();
      if(!state.items[key]){
        alert('Item not found. Please add item first.');
        return;
      }
      // Save sale with profit = manual(per piece) * qty or (sale price - item cost) * qty
      const costPerUnit = getLatestPrice(state.items[key]);
      const total = price * qty;
      const autoProfit = (price - costPerUnit) * qty;
      const profit = manualProfitVal !== null && !isNaN(manualProfitVal) ? manualProfitVal * qty : autoProfit;
      state.sales.push({ date: ymd(date), buyer, address, contact, item: state.items[key].name, price, qty, total, profit, profitIsManual: manualProfitVal !== null });
      // Reduce stock for the month and log delta
      const current = state.items[key].quantities[monthKey] || 0;
      state.items[key].quantities[monthKey] = Math.max(0, current - qty);
      logQuantityChange(state.items[key], monthKey, ymd(date), -qty, 'sale');
      saveState(state);
      saleForm.reset();
      initSaleDefaults();
      renderItemsTable();
      renderSalesTable();
    });
  }

  const salesMonthEl = document.getElementById('sales-month');
  if(salesMonthEl){
    salesMonthEl.addEventListener('change', renderSalesTable);
  }

  function renderSalesTable(){
    const tbody = document.querySelector('#sales-table tbody');
    if(!tbody) return;
    const state = loadState();
    const month = document.getElementById('sales-month')?.value || new Date().toISOString().slice(0,7);
    const rows = state.sales.filter(s=> ym(s.date) === month).sort((a,b)=> a.date.localeCompare(b.date));
    tbody.innerHTML = '';
    rows.forEach(s=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.date}</td><td>${s.buyer}</td><td>${s.contact}</td><td>${s.address}</td><td>${s.item}</td><td class=\"right\">${formatCurrency(s.price)}</td><td class=\"right\">${s.qty}</td><td class=\"right\">${formatCurrency(s.total)}</td><td class=\"right\">${formatCurrency(s.profit || 0)}</td>`;
      tbody.appendChild(tr);
    });
  }

  // Monthly report
  const refreshReportBtn = document.getElementById('refresh-report');
  refreshReportBtn.addEventListener('click', renderMonthlyReport);

  function renderMonthlyReport(){
    const output = document.getElementById('report-output');
    const month = document.getElementById('report-month').value || new Date().toISOString().slice(0,7);
    const state = loadState();
    const rows = [];
    let grand = 0;
    Object.values(state.items).forEach(item=>{
      const qty = item.quantities[month] || 0;
      if(qty <= 0) return;
      const price = getLatestPrice(item);
      const total = price * qty;
      grand += total;
      rows.push({ name: item.name, price, qty, total });
    });
    rows.sort((a,b)=>a.name.localeCompare(b.name));
    const monthLabel = month;
    // Include sales of the month summary
    const monthSales = (state.sales || []).filter(s=> ym(s.date) === month);
    const salesTotal = monthSales.reduce((sum, s)=> sum + s.total, 0);
    const salesProfit = monthSales.reduce((sum, s)=> sum + (s.profit || 0), 0);
    const salesCount = monthSales.length;

    const html = [`<div class=\"receipt\">`,
      `<h3>Receipt - ${monthLabel}</h3>`,
      `<table>`,
      `<thead><tr><th>Item</th><th class=\"right\">Price</th><th class=\"right\">Qty</th><th class=\"right\">Total</th></tr></thead>`,
      `<tbody>`,
      ...rows.map(r=>`<tr><td>${r.name}</td><td class=\"right\">${formatCurrency(r.price)}</td><td class=\"right\">${r.qty}</td><td class=\"right\">${formatCurrency(r.total)}</td></tr>`),
      `</tbody>`,
      `<tfoot><tr><td colspan=\"3\" class=\"right\">Grand Total</td><td class=\"right\"><strong>${formatCurrency(grand)}</strong></td></tr></tfoot>`,
      `</table>`,
      `<div style=\"margin-top:12px;\">Sales this month: <strong>${salesCount}</strong> | Revenue: <strong>${formatCurrency(salesTotal)}</strong> | Profit: <strong>${formatCurrency(salesProfit)}</strong></div>`,
      monthSales.length ? [`<h4 style=\"margin-top:16px;\">Sales Details</h4>`,
        `<table>`,
        `<thead><tr><th>Date</th><th>Buyer</th><th>Contact</th><th>Address</th><th>Product</th><th class=\"right\">Price</th><th class=\"right\">Qty</th><th class=\"right\">Total</th><th class=\"right\">Profit</th></tr></thead>`,
        `<tbody>`,
        ...monthSales.map(s=>`<tr><td>${s.date}</td><td>${s.buyer}</td><td>${s.contact}</td><td>${s.address}</td><td>${s.item}</td><td class=\"right\">${formatCurrency(s.price)}</td><td class=\"right\">${s.qty}</td><td class=\"right\">${formatCurrency(s.total)}</td><td class=\"right\">${formatCurrency(s.profit || 0)}</td></tr>`),
        `</tbody>`,
        `<tfoot><tr><td colspan=\"7\" class=\"right\">Sales Total</td><td class=\"right\"><strong>${formatCurrency(salesTotal)}</strong></td><td class=\"right\"><strong>${formatCurrency(salesProfit)}</strong></td></tr></tfoot>`,
        `</table>`].join('') : '' ,
      `</div>`].join('');
    output.innerHTML = html;

    // Save monthly snapshot for Yearly Summary
    const newState = loadState();
    if(!newState.monthlySnapshots) newState.monthlySnapshots = {};
    newState.monthlySnapshots[month] = {
      generatedAt: new Date().toISOString(),
      itemsTotal: grand,
      salesTotal: salesTotal,
      salesProfit: salesProfit,
      salesCount: salesCount
    };
    saveState(newState);
  }

  // --- Sales Report View ---
  function initSalesReportDefaults(){
    const el = document.getElementById('sales-report-month');
    if(el && !el.value){ el.value = new Date().toISOString().slice(0,7); }
  }
  const refreshSalesReportBtn = document.getElementById('refresh-sales-report');
  if(refreshSalesReportBtn){ refreshSalesReportBtn.addEventListener('click', renderSalesReport); }
  const printSalesBtn = document.getElementById('print-sales-pdf');
  if(printSalesBtn){ printSalesBtn.addEventListener('click', ()=>{ renderSalesReport(); window.print(); }); }
  const exportSalesTextBtn = document.getElementById('export-sales-text');
  if(exportSalesTextBtn){ exportSalesTextBtn.addEventListener('click', exportSalesText); }

  function renderSalesReport(){
    const output = document.getElementById('sales-report-output');
    if(!output) return;
    const state = loadState();
    const month = document.getElementById('sales-report-month').value || new Date().toISOString().slice(0,7);
    const rows = (state.sales || []).filter(s=> ym(s.date) === month).sort((a,b)=> a.date.localeCompare(b.date));
    const salesTotal = rows.reduce((sum, s)=> sum + s.total, 0);
    const profitTotal = rows.reduce((sum, s)=> sum + (s.profit || 0), 0);
    const html = [`<div class=\"receipt\">`,
      `<h3>Sales Report - ${month}</h3>`,
      `<table>`,
      `<thead><tr><th>Date</th><th>Buyer</th><th>Contact</th><th>Address</th><th>Product</th><th class=\"right\">Price</th><th class=\"right\">Qty</th><th class=\"right\">Total</th><th class=\"right\">Profit</th></tr></thead>`,
      `<tbody>`,
      ...rows.map(s=>`<tr><td>${s.date}</td><td>${s.buyer}</td><td>${s.contact}</td><td>${s.address}</td><td>${s.item}</td><td class=\"right\">${formatCurrency(s.price)}</td><td class=\"right\">${s.qty}</td><td class=\"right\">${formatCurrency(s.total)}</td><td class=\"right\">${formatCurrency(s.profit || 0)}</td></tr>`),
      `</tbody>`,
      `<tfoot><tr><td colspan=\"7\" class=\"right\">Sales Total</td><td class=\"right\"><strong>${formatCurrency(salesTotal)}</strong></td><td class=\"right\"><strong>${formatCurrency(profitTotal)}</strong></td></tr></tfoot>`,
      `</table>`,
      `</div>`].join('');
    output.innerHTML = html;
  }

  function exportSalesText(){
    const state = loadState();
    const month = document.getElementById('sales-report-month').value || new Date().toISOString().slice(0,7);
    const rows = (state.sales || []).filter(s=> ym(s.date) === month).sort((a,b)=> a.date.localeCompare(b.date));
    const total = rows.reduce((sum, s)=> sum + s.total, 0);
    const profit = rows.reduce((sum, s)=> sum + (s.profit || 0), 0);
    const lines = [];
    lines.push(`Ibrahim Accounting - Sales Report for ${month}`);
    lines.push('');
    lines.push('Date\tBuyer\tContact\tAddress\tProduct\tPrice\tQty\tTotal\tProfit');
    rows.forEach(s=>{
      lines.push(`${s.date}\t${s.buyer}\t${s.contact}\t${s.address}\t${s.item}\t${formatCurrency(s.price)}\t${s.qty}\t${formatCurrency(s.total)}\t${formatCurrency(s.profit || 0)}`);
    });
    lines.push('');
    lines.push(`Sales Total\t\t\t\t\t\t\t${formatCurrency(total)}\t${formatCurrency(profit)}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales_${month}.txt`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  // Export TXT
  const exportTextBtn = document.getElementById('export-text');
  exportTextBtn.addEventListener('click', ()=>{
    const month = document.getElementById('report-month').value || new Date().toISOString().slice(0,7);
    const state = loadState();
    const lines = [];
    lines.push(`Ibrahim Accounting - Receipt for ${month}`);
    lines.push('');
    lines.push('Item\tPrice\tQty\tTotal');
    let grand = 0;
    Object.values(state.items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(item=>{
      const qty = item.quantities[month] || 0;
      if(qty <= 0) return;
      const price = getLatestPrice(item);
      const total = price * qty;
      grand += total;
      lines.push(`${item.name}\t${formatCurrency(price)}\t${qty}\t${formatCurrency(total)}`);
    });
    lines.push('');
    lines.push(`Grand Total\t\t\t${formatCurrency(grand)}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `receipt_${month}.txt`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  });

  // Print/PDF
  const printBtn = document.getElementById('print-pdf');
  printBtn.addEventListener('click', ()=>{
    // Render latest report then print
    renderMonthlyReport();
    window.print();
  });

  // Yearly summary
  const showYearBtn = document.getElementById('show-year');
  showYearBtn.addEventListener('click', renderYearly);

  function renderYearly(){
    const output = document.getElementById('yearly-output');
    const year = parseInt(document.getElementById('year-input').value,10) || new Date().getFullYear();
    const months = Array.from({length:12}, (_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
    const state = loadState();
    const rows = months.map(m=>{
      const snap = (state.monthlySnapshots || {})[m];
      if(snap){
        return { month: m, itemsTotal: snap.itemsTotal || 0, salesTotal: snap.salesTotal || 0, salesProfit: snap.salesProfit || 0, combined: (snap.itemsTotal||0) + (snap.salesTotal||0) };
      }
      // Fallback compute if no snapshot
      let itemsTotal = 0;
      Object.values(state.items).forEach(item=>{
        const qty = item.quantities[m] || 0;
        if(qty > 0) itemsTotal += qty * getLatestPrice(item);
      });
      const salesRows = (state.sales || []).filter(s=> ym(s.date) === m);
      const salesTotal = salesRows.reduce((s, r)=> s + r.total, 0);
      const salesProfit = salesRows.reduce((s, r)=> s + (r.profit || 0), 0);
      return { month: m, itemsTotal, salesTotal, salesProfit, combined: itemsTotal + salesTotal };
    });
    const totals = rows.reduce((acc,r)=>({
      items: acc.items + r.itemsTotal,
      sales: acc.sales + r.salesTotal,
      profit: acc.profit + (r.salesProfit || 0),
      combined: acc.combined + r.combined
    }), { items:0, sales:0, profit:0, combined:0 });

    const html = [`<div class=\"receipt\">`,
      `<h3>Yearly Summary - ${year}</h3>`,
      `<table>`,
      `<thead><tr><th>Month</th><th class=\"right\">Items Total</th><th class=\"right\">Sales Revenue</th><th class=\"right\">Sales Profit</th><th class=\"right\">Combined</th></tr></thead>`,
      `<tbody>`,
      ...rows.map(r=>`<tr><td>${r.month}</td><td class=\"right\">${formatCurrency(r.itemsTotal)}</td><td class=\"right\">${formatCurrency(r.salesTotal)}</td><td class=\"right\">${formatCurrency(r.salesProfit || 0)}</td><td class=\"right\">${formatCurrency(r.combined)}</td></tr>`),
      `</tbody>`,
      `<tfoot><tr><td class=\"right\">Totals</td><td class=\"right\"><strong>${formatCurrency(totals.items)}</strong></td><td class=\"right\"><strong>${formatCurrency(totals.sales)}</strong></td><td class=\"right\"><strong>${formatCurrency(totals.profit)}</strong></td><td class=\"right\"><strong>${formatCurrency(totals.combined)}</strong></td></tr></tfoot>`,
      `</table>`,
      `</div>`].join('');
    output.innerHTML = html;
  }

  // Initial renders
  renderItemsTable();
  refreshDatalist();
  renderMonthlyReport();
  renderYearly();
})();


