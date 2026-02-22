document.addEventListener('DOMContentLoaded', async () => {

    // --- Supabase Client Initialization ---
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

    // --- Global State ---
    let settlements = {};
    let currentSettlement = null;
    let currentLang = 'ko';
    let currentEditingExpenseId = null;
    const exchangeRatesCache = {};
    const SUPPORTED_CURRENCIES = ['JPY', 'KRW', 'USD'];

    // --- Element References ---
    const languageSwitcher = document.getElementById('language-switcher');
    const sidebar = document.getElementById('left-pane');
    const appTitle = document.querySelector('.brand-container');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mainDatePicker = document.getElementById('main-date-picker');
    const customDateDisplay = document.getElementById('custom-date-display');
    const settlementListContainer = document.getElementById('settlement-list-container');
    const addSettlementFab = document.getElementById('add-settlement-fab');
    const placeholderRightPane = document.getElementById('placeholder-right-pane');
    const calculatorView = document.getElementById('calculator');
    
    const addSettlementModal = document.getElementById('add-settlement-modal');
    const exchangeRateModal = document.getElementById('exchange-rate-modal');
    const editExpenseModal = document.getElementById('edit-expense-modal');
    const expenseRateModal = document.getElementById('expense-rate-modal');

    const modalDateDisplay = document.getElementById('modal-date-display');
    const newSettlementTitleInput = document.getElementById('new-settlement-title');
    const newParticipantAInput = document.getElementById('new-participant-a');
    const newParticipantBInput = document.getElementById('new-participant-b');
    const baseCurrencySelect = document.getElementById('base-currency');
    const createSettlementBtn = document.getElementById('create-settlement-btn');

    const exchangeRateInfoBtn = document.getElementById('exchange-rate-info-btn'); 
    const exchangeRateDate = document.getElementById('exchange-rate-date');
    const exchangeRateInfo = document.getElementById('exchange-rate-info');
    
    const editExpenseIdInput = document.getElementById('edit-expense-id');
    const editItemNameInput = document.getElementById('edit-item-name');
    const editItemAmountInput = document.getElementById('edit-item-amount');
    const editItemCurrencySelect = document.getElementById('edit-item-currency');
    const editItemPayerSelect = document.getElementById('edit-item-payer');
    const editSplitMethodSelect = document.getElementById('edit-split-method');
    const editSplitAmountInputs = document.getElementById('edit-split-amount-inputs');
    const editSplitAmountAInput = document.getElementById('edit-split-amount-a');
    const editSplitAmountBInput = document.getElementById('edit-split-amount-b');
    const saveExpenseChangesBtn = document.getElementById('save-expense-changes-btn');

    const settlementDisplay = document.getElementById('settlement-display');
    const expenseFormCard = document.getElementById('expense-form-card');
    const itemPayerSelect = document.getElementById('item-payer');
    const itemCurrencySelect = document.getElementById('item-currency');
    const splitMethodSelect = document.getElementById('split-method');
    const splitAmountAInput = document.getElementById('split-amount-a');
    const splitAmountBInput = document.getElementById('split-amount-b');
    const expenseTableBody = document.querySelector('#expense-table tbody');
    const totalExpenseP = document.getElementById('total-expense');
    const finalSettlementP = document.getElementById('final-settlement');
    const completeSettlementBtn = document.getElementById('complete-settlement-btn');
    const downloadExcelBtn = document.getElementById('download-excel-btn');
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const itemNameInput = document.getElementById('item-name');
    const itemAmountInput = document.getElementById('item-amount');
    const splitAmountInputs = document.getElementById('split-amount-inputs');

    // --- Utility Functions ---
    const formatNumber = (num, decimals = 2) => isNaN(num) ? '0' : num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const parseFormattedNumber = (str) => parseFloat(String(str).replace(/,/g, '')) || 0;

    function updateDateDisplay() {
        if (!mainDatePicker.value) return;
        const [year, month, day] = mainDatePicker.value.split('-');
        const date = new Date(year, month - 1, day); 
        let localeString = 'ko-KR';
        if (currentLang === 'en') localeString = 'en-US';
        if (currentLang === 'ja') localeString = 'ja-JP';
        const options = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' };
        customDateDisplay.textContent = new Intl.DateTimeFormat(localeString, options).format(date);
    }

    function updateUI(lang) {
        currentLang = lang;
        const translations = locales[lang];
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[key]) el.innerHTML = translations[key];
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
             if (translations[key]) el.placeholder = translations[key];
        });
        
        document.querySelectorAll('[data-i18n-options]').forEach(el => {
            const keys = el.getAttribute('data-i18n-options').split(',');
            el.innerHTML = '';
            keys.forEach(key => {
                const option = document.createElement('option');
                const value = key.trim();
                if (value === 'splitEqually') option.value = 'equal';
                else if (value === 'splitByAmount') option.value = 'amount';
                option.textContent = translations[value];
                el.appendChild(option);
            });
        });
        
        if (currentSettlement) {
            updateParticipantNames(currentSettlement.participants);
            render();
        }
        updateDateDisplay(); 
        renderSettlementList(mainDatePicker.value);
    }

    function setLanguage(lang) {
        localStorage.setItem('preferredLang', lang);
        languageSwitcher.value = lang;
        updateUI(lang);
    }

    async function getExchangeRate(date, base, target) {
        if (base === target) return 1;
        const cacheKey = `${date}_${base}_${target}`;
        if (exchangeRatesCache[cacheKey]) return exchangeRatesCache[cacheKey];
        const requestDate = new Date(date) > new Date() ? 'latest' : date;

        try {
            const response = await fetch(`https://api.frankfurter.app/${requestDate}?from=${base}&to=${target}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            const rate = data.rates[target];
            if(!rate) throw new Error(`Rate not found for ${target}`);
            exchangeRatesCache[cacheKey] = rate;
            return rate;
        } catch (error) { console.error('Error fetching exchange rate:', error); alert(`Failed to fetch exchange rate for ${date}.`); return null; }
    }

    async function initialize() {
        const preferredLang = localStorage.getItem('preferredLang');
        const browserLang = navigator.language.split('-')[0];
        const initialLang = preferredLang || (['ko', 'en', 'ja'].includes(browserLang) ? browserLang : 'en');
        
        setupEventListeners();
        setInitialDate();
        await loadData();
        setLanguage(initialLang);
    }

    async function loadData() {
        const { data, error } = await supabaseClient.from('settlements').select(`* , expenses (*)`).order('created_at');
        if (error) { console.error('Error loading data:', error); return; }
        settlements = {};
        data.forEach(s => {
            const settlementDate = s.date;
            if (!settlements[settlementDate]) settlements[settlementDate] = [];
            settlements[settlementDate].push(s);
        });
        renderSettlementList(mainDatePicker.value);
    }

    function setInitialDate() {
        const todayString = new Date().toLocaleDateString('fr-CA', { timeZone: 'Asia/Tokyo' });
        mainDatePicker.value = todayString;
        updateDateDisplay(); 
        mainDatePicker.dispatchEvent(new Event('change'));
    }

    // 💡 환율을 불러오고 UI를 업데이트하는 공통 함수
    async function fetchAndSetRate(fetchType, currencyFrom, currencyTo, inputEl, previewUpdater) {
        if (!currentSettlement) return;
        // fetchType이 'latest'면 오늘(실시간), 'settlement'면 정산일 기준
        const fetchDate = fetchType === 'latest' ? 'latest' : currentSettlement.date;
        const rate = await getExchangeRate(fetchDate, currencyFrom, currencyTo);
        if (rate !== null) {
            inputEl.value = rate.toFixed(4);
            previewUpdater();
        }
    }

    // 통화가 바뀔 때 기본적으로 정산일(settlement) 기준을 불러옴
    async function handleAddCurrencyChange() {
        if (!currentSettlement) return;
        const currency = itemCurrencySelect.value;
        const base = currentSettlement.base_currency;
        const wrapper = document.getElementById('add-rate-config-wrapper');

        if (currency === base) {
            wrapper.classList.add('hidden');
            return;
        }
        wrapper.classList.remove('hidden');
        document.getElementById('add-currency-from').textContent = currency;
        document.getElementById('add-currency-to').textContent = base;

        if (!document.getElementById('add-custom-rate').value) { 
            await fetchAndSetRate('settlement', currency, base, document.getElementById('add-custom-rate'), updateAddPreview);
        } else {
            updateAddPreview();
        }
    }

    function updateAddPreview() {
        const amount = parseFormattedNumber(itemAmountInput.value);
        const rate = parseFloat(document.getElementById('add-custom-rate').value) || 0;
        const base = currentSettlement ? currentSettlement.base_currency : '';
        document.getElementById('add-converted-total').textContent = `${formatNumber(amount * rate, 2)} ${base}`;
    }

    async function handleEditCurrencyChange() {
        if (!currentSettlement) return;
        const currency = editItemCurrencySelect.value;
        const base = currentSettlement.base_currency;
        const wrapper = document.getElementById('edit-rate-config-wrapper');

        if (currency === base) {
            wrapper.classList.add('hidden');
            return;
        }
        wrapper.classList.remove('hidden');
        document.getElementById('edit-currency-from').textContent = currency;
        document.getElementById('edit-currency-to').textContent = base;

        if (!document.getElementById('edit-custom-rate').value) { 
            await fetchAndSetRate('settlement', currency, base, document.getElementById('edit-custom-rate'), updateEditPreview);
        } else {
            updateEditPreview();
        }
    }

    function updateEditPreview() {
        const amount = parseFormattedNumber(editItemAmountInput.value);
        const rate = parseFloat(document.getElementById('edit-custom-rate').value) || 0;
        const base = currentSettlement ? currentSettlement.base_currency : '';
        document.getElementById('edit-converted-total').textContent = `${formatNumber(amount * rate, 2)} ${base}`;
    }

    function setupEventListeners() {
        languageSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));
        appTitle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        mainDatePicker.addEventListener('change', () => { updateDateDisplay(); renderSettlementList(mainDatePicker.value); });
        
        addSettlementFab.addEventListener('click', () => {
            modalDateDisplay.textContent = mainDatePicker.value;
            addSettlementModal.classList.remove('hidden');
            newSettlementTitleInput.focus();
        });
        
        [addSettlementModal, exchangeRateModal, editExpenseModal, expenseRateModal].forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
            modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
        });

        createSettlementBtn.addEventListener('click', createSettlement);
        addExpenseBtn.addEventListener('click', addExpense);
        saveExpenseChangesBtn.addEventListener('click', handleSaveExpenseChanges);
        exchangeRateInfoBtn.addEventListener('click', showExchangeRateModal);

        // 💡 [지출 추가 폼] 통화 및 환율 버튼 이벤트
        itemCurrencySelect.addEventListener('change', () => {
            document.getElementById('add-custom-rate').value = ''; 
            handleAddCurrencyChange();
        });
        itemAmountInput.addEventListener('input', updateAddPreview);
        document.getElementById('add-custom-rate').addEventListener('input', updateAddPreview);
        document.getElementById('add-settlement-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('settlement', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview);
        });
        document.getElementById('add-live-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('latest', itemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('add-custom-rate'), updateAddPreview);
        });

        // 💡 [지출 수정 폼] 통화 및 환율 버튼 이벤트
        editItemCurrencySelect.addEventListener('change', () => {
            document.getElementById('edit-custom-rate').value = ''; 
            handleEditCurrencyChange();
        });
        editItemAmountInput.addEventListener('input', updateEditPreview);
        document.getElementById('edit-custom-rate').addEventListener('input', updateEditPreview);
        document.getElementById('edit-settlement-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('settlement', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview);
        });
        document.getElementById('edit-live-rate-btn').addEventListener('click', () => {
            fetchAndSetRate('latest', editItemCurrencySelect.value, currentSettlement.base_currency, document.getElementById('edit-custom-rate'), updateEditPreview);
        });


        completeSettlementBtn.addEventListener('click', async () => {
            if (currentSettlement) {
                currentSettlement.is_settled = !currentSettlement.is_settled;
                const { error } = await supabaseClient.from('settlements').update({ is_settled: currentSettlement.is_settled }).eq('id', currentSettlement.id);
                if (error) console.error('Error:', error);
                render(); renderSettlementList(mainDatePicker.value);
            }
        });
        
        splitMethodSelect.addEventListener('change', () => handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs, splitAmountAInput, splitAmountBInput));
        editSplitMethodSelect.addEventListener('change', () => handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs, editSplitAmountAInput, editSplitAmountBInput));

        const allAmountInputs = [itemAmountInput, splitAmountAInput, splitAmountBInput, editItemAmountInput, editSplitAmountAInput, editSplitAmountBInput];
        allAmountInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                const hasDecimal = value.includes('.');
                let numericValue = parseFormattedNumber(value);
                if (hasDecimal) {
                    const parts = value.split('.');
                    e.target.value = formatNumber(parseFloat(parts[0]), 0) + '.' + (parts[1] || '');
                } else { e.target.value = formatNumber(numericValue, 0); }
            });
        });

        [splitAmountAInput, splitAmountBInput].forEach(input => {
            input.addEventListener('input', () => {
                 if (splitMethodSelect.value === 'amount') {
                    const amountA = parseFormattedNumber(splitAmountAInput.value);
                    const amountB = parseFormattedNumber(splitAmountBInput.value);
                    itemAmountInput.value = formatNumber(amountA + amountB, 0);
                    updateAddPreview();
                 }
            });
        });

        [editSplitAmountAInput, editSplitAmountBInput].forEach(input => {
            input.addEventListener('input', () => {
                 if (editSplitMethodSelect.value === 'amount') {
                    const amountA = parseFormattedNumber(editSplitAmountAInput.value);
                    const amountB = parseFormattedNumber(editSplitAmountBInput.value);
                    editItemAmountInput.value = formatNumber(amountA + amountB, 0);
                    updateEditPreview();
                 }
            });
        });

        downloadExcelBtn.addEventListener('click', downloadExcel);
    }

    function handleSplitMethodChange(selectEl, amountEl, splitInputsEl, splitAEl, splitBEl) {
        const isManualAmount = selectEl.value === 'amount';
        splitInputsEl.classList.toggle('hidden', !isManualAmount);
        amountEl.readOnly = isManualAmount;
        if (isManualAmount) {
            const amountA = parseFormattedNumber(splitAEl.value);
            const amountB = parseFormattedNumber(splitBEl.value);
            amountEl.value = formatNumber(amountA + amountB, 0);
        } else {
            amountEl.value = amountEl.dataset.originalValue || '';
        }
        if (selectEl === splitMethodSelect) updateAddPreview();
        else updateEditPreview();
    }

    async function createSettlement() {
        const title = newSettlementTitleInput.value.trim();
        const date = mainDatePicker.value;
        const participantA = newParticipantAInput.value.trim() || 'A';
        const participantB = newParticipantBInput.value.trim() || 'B';
        const baseCurrency = baseCurrencySelect.value;
        if (!title || !date) return;

        const { data, error } = await supabaseClient.from('settlements')
            .insert([{ title, date, participants: [participantA, participantB], base_currency: baseCurrency, is_settled: false }]).select('*, expenses (*)');

        if (error) { console.error('Error creating settlement:', error); return; }
        
        const newSettlement = data[0];
        if (!settlements[date]) settlements[date] = [];
        settlements[date].push(newSettlement);
        
        renderSettlementList(date); selectSettlement(newSettlement);
        addSettlementModal.classList.add('hidden');
        newSettlementTitleInput.value = ''; newParticipantAInput.value = 'A'; newParticipantBInput.value = 'B';
    }
    
    async function deleteSettlement(date, settlementId) {
        if (confirm(locales[currentLang]?.deleteSettlementConfirm)) {
            await supabaseClient.from('expenses').delete().eq('settlement_id', settlementId);
            const { error: settlementError } = await supabaseClient.from('settlements').delete().eq('id', settlementId);
            if (settlementError) { alert('Error: ' + settlementError.message); return; }
            
            settlements[date] = settlements[date].filter(s => s.id !== settlementId);
            if (currentSettlement && currentSettlement.id === settlementId) {
                currentSettlement = null; calculatorView.classList.add('hidden'); placeholderRightPane.classList.remove('hidden');
            }
            renderSettlementList(date);
        }
    }

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        placeholderRightPane.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        settlementDisplay.textContent = settlement.title;
        itemCurrencySelect.value = settlement.base_currency;
        document.getElementById('add-rate-config-wrapper').classList.add('hidden'); 
        updateParticipantNames(settlement.participants);
        document.querySelectorAll('.settlement-item').forEach(item => item.classList.toggle('active', item.dataset.id == settlement.id));
        if (window.innerWidth <= 768) sidebar.classList.add('collapsed');
        render();
    }

    function renderSettlementList(date) {
        const list = settlements[date] || [];
        settlementListContainer.innerHTML = list.length === 0 
            ? `<p class="subtitle">${locales[currentLang]?.noHistory || 'History does not exist.'}</p>`
            : list.map(s => `
                <div class="settlement-item-wrapper">
                    <button class="settlement-item ${s.is_settled ? 'is-settled' : ''}" data-id="${s.id}">
                        <div class="item-content">
                            ${s.is_settled ? '<i class="fas fa-check-circle settled-icon"></i>' : ''}
                            <span class="item-title">${s.title}</span>
                            <span class="item-participants">(${(s.participants || []).join(', ')}) - ${s.base_currency}</span>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button class="delete-settlement-btn" data-date="${date}" data-id="${s.id}"><i class="fas fa-trash-alt"></i></button>
                </div>`).join('');
        
        document.querySelectorAll('.settlement-item').forEach(btn => {
            const settlementId = parseInt(btn.dataset.id);
            const settlement = list.find(s => s.id === settlementId);
            if(settlement) btn.addEventListener('click', () => selectSettlement(settlement));
        });

        document.querySelectorAll('.delete-settlement-btn').forEach(btn => btn.addEventListener('click', (e) => {
            e.stopPropagation(); deleteSettlement(e.currentTarget.dataset.date, parseInt(e.currentTarget.dataset.id))
        }));
        
        if(currentSettlement) {
            const currentItem = document.querySelector(`.settlement-item[data-id='${currentSettlement.id}']`);
            if (currentItem) currentItem.classList.add('active');
        }
    }

    function updateParticipantNames(participants) {
        const [userA, userB] = participants || ['A', 'B'];
        const paidByString = locales[currentLang]?.paidBy || 'Paid by {payer}';
        const shareOfString = locales[currentLang]?.shareOf || "{name}'s share";

        [itemPayerSelect, editItemPayerSelect].forEach(select => {
            select.innerHTML = `<option value="${userA}">${paidByString.replace('{payer}', userA)}</option><option value="${userB}">${paidByString.replace('{payer}', userB)}</option>`;
        });
        
        document.getElementById('table-header-user-a').textContent = shareOfString.replace('{name}', userA);
        document.getElementById('table-header-user-b').textContent = shareOfString.replace('{name}', userB);

        [splitAmountAInput, editSplitAmountAInput].forEach(input => input.placeholder = shareOfString.replace('{name}', userA));
        [splitAmountBInput, editSplitAmountBInput].forEach(input => input.placeholder = shareOfString.replace('{name}', userB));
    }

    async function addExpense() {
        if (!currentSettlement) return;
        const name = itemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(itemAmountInput.value);
        const currency = itemCurrencySelect.value;
        if (!name || originalAmount <= 0) { alert(locales[currentLang]?.invalidInput); return; }

        let rate = 1;
        if (currency !== currentSettlement.base_currency) {
            rate = parseFloat(document.getElementById('add-custom-rate').value);
            if (!rate || rate <= 0) { alert(locales[currentLang]?.invalidInput); return; }
        }

        const convertedAmount = originalAmount * rate;
        const [userA, userB] = currentSettlement.participants;
        const payer = itemPayerSelect.value;
        const splitMethod = splitMethodSelect.value;
        let shares = { [userA]: 0, [userB]: 0 };

        if (splitMethod === 'equal') {
            shares[userA] = shares[userB] = convertedAmount / 2;
        } else if (splitMethod === 'amount') {
            const shareA_original = parseFormattedNumber(splitAmountAInput.value);
            const shareB_original = parseFormattedNumber(splitAmountBInput.value);
            if (Math.abs(shareA_original + shareB_original - originalAmount) > 0.01) { alert(locales[currentLang]?.amountMismatch); return; }
            shares[userA] = shareA_original * rate;
            shares[userB] = shareB_original * rate;
        }

        const { data, error } = await supabaseClient.from('expenses')
            .insert([{ settlement_id: currentSettlement.id, name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares }]).select();

        if (error) { console.error('Error adding expense:', error); return; }
        
        currentSettlement.expenses.push(data[0]);

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
        }
        
        render(); renderSettlementList(mainDatePicker.value); clearInputs();
    }

    function openEditExpenseModal(expenseId) {
        const expense = currentSettlement.expenses.find(e => e.id === expenseId);
        if (!expense) return;

        currentEditingExpenseId = expenseId;

        editExpenseIdInput.value = expense.id;
        editItemNameInput.value = expense.name;
        editItemAmountInput.value = formatNumber(expense.original_amount, 0);
        editItemAmountInput.dataset.originalValue = formatNumber(expense.original_amount, 0);
        
        editItemCurrencySelect.innerHTML = SUPPORTED_CURRENCIES.map(c => `<option value="${c}" ${c === expense.currency ? 'selected' : ''}>${c}</option>`).join('');
        editItemPayerSelect.value = expense.payer;
        editSplitMethodSelect.value = expense.split;

        if (expense.currency !== currentSettlement.base_currency) {
            const appliedRate = expense.amount / expense.original_amount;
            document.getElementById('edit-custom-rate').value = appliedRate.toFixed(4);
            handleEditCurrencyChange(); 
        } else {
            document.getElementById('edit-rate-config-wrapper').classList.add('hidden');
        }

        if (expense.split === 'amount') {
            const rate = expense.amount / expense.original_amount;
            const [userA, userB] = currentSettlement.participants;
            const originalShareA = (expense.shares[userA] || 0) / rate;
            const originalShareB = (expense.shares[userB] || 0) / rate;
            editSplitAmountAInput.value = formatNumber(originalShareA, 0);
            editSplitAmountBInput.value = formatNumber(originalShareB, 0);
        }

        handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs, editSplitAmountAInput, editSplitAmountBInput);
        editExpenseModal.classList.remove('hidden');
    }

    async function handleSaveExpenseChanges() {
        if (!currentSettlement || currentEditingExpenseId === null) return;

        const name = editItemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(editItemAmountInput.value);
        const currency = editItemCurrencySelect.value;
        if (!name || originalAmount <= 0) { alert(locales[currentLang]?.invalidInput); return; }

        let rate = 1;
        if (currency !== currentSettlement.base_currency) {
            rate = parseFloat(document.getElementById('edit-custom-rate').value);
            if (!rate || rate <= 0) { alert(locales[currentLang]?.invalidInput); return; }
        }

        const convertedAmount = originalAmount * rate;
        const [userA, userB] = currentSettlement.participants;
        const payer = editItemPayerSelect.value;
        const splitMethod = editSplitMethodSelect.value;
        let shares = { [userA]: 0, [userB]: 0 };

        if (splitMethod === 'equal') {
            shares[userA] = shares[userB] = convertedAmount / 2;
        } else if (splitMethod === 'amount') {
            const shareA_original = parseFormattedNumber(editSplitAmountAInput.value);
            const shareB_original = parseFormattedNumber(editSplitAmountBInput.value);
            if (Math.abs(shareA_original + shareB_original - originalAmount) > 0.01) { alert(locales[currentLang]?.amountMismatch); return; }
            shares[userA] = shareA_original * rate;
            shares[userB] = shareB_original * rate;
        }
        
        const { data, error } = await supabaseClient.from('expenses')
            .update({ name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares })
            .eq('id', currentEditingExpenseId).select();

        if (error) { console.error('Error saving:', error); return; }
        
        const expenseIndex = currentSettlement.expenses.findIndex(e => e.id === currentEditingExpenseId);
        if (expenseIndex > -1) currentSettlement.expenses[expenseIndex] = data[0];

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
        }

        render(); renderSettlementList(mainDatePicker.value);
        editExpenseModal.classList.add('hidden'); currentEditingExpenseId = null;
    }
    
    async function deleteExpense(expenseId) {
        if (confirm(locales[currentLang]?.deleteConfirm)) {
             const { error } = await supabaseClient.from('expenses').delete().eq('id', expenseId);
            if (error) { console.error('Error:', error); return; }
            currentSettlement.expenses = currentSettlement.expenses.filter(exp => exp.id !== expenseId);
            if (currentSettlement.is_settled) {
                currentSettlement.is_settled = false;
                await supabaseClient.from('settlements').update({ is_settled: false }).eq('id', currentSettlement.id);
            }
            render(); renderSettlementList(mainDatePicker.value);
        }
    }

    function showExpenseExchangeRate(expenseId) {
        if (!currentSettlement) return;
        const expense = currentSettlement.expenses.find(e => e.id === expenseId);
        if (!expense) return;

        const appliedRate = expense.amount / expense.original_amount;

        document.getElementById('calc-foreign-currency').textContent = expense.currency;
        document.getElementById('calc-base-currency').textContent = currentSettlement.base_currency;
        document.getElementById('calc-base-amount').textContent = formatNumber(appliedRate, 4);

        document.getElementById('calc-total-foreign').textContent = `${formatNumber(expense.original_amount, 2)} ${expense.currency}`;
        document.getElementById('calc-total-base').textContent = `${formatNumber(expense.amount, 2)} ${currentSettlement.base_currency}`;

        expenseRateModal.classList.remove('hidden');
    }

    async function showExchangeRateModal() {
        if (!currentSettlement) return;
        const { date, base_currency } = currentSettlement;
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const settlementDate = new Date(date);
        const isFuture = settlementDate > today;
        
        exchangeRateDate.textContent = `${date} ${locales[currentLang].baseDate}`;
        if (isFuture) {
            let futureNotice = "미래 날짜이므로 현재(최신) 환율이 적용되었습니다.";
            if (currentLang === 'en') futureNotice = "Future date: using current latest rates.";
            if (currentLang === 'ja') futureNotice = "未来の日付のため、現在の最新レートが適用されています。";
            
            exchangeRateDate.innerHTML += `<br><span style="color: var(--danger); font-size: 0.85rem; display: inline-block; margin-top: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> ${futureNotice}</span>`;
        }

        let ratesInfoHTML = `<div class="rate-item"><span class="base">1 ${base_currency}</span> =</div>`;
        const targetCurrencies = SUPPORTED_CURRENCIES.filter(c => c !== base_currency);

        for (const target of targetCurrencies) {
            const rate = await getExchangeRate(date, base_currency, target);
            if (rate !== null) ratesInfoHTML += `<div class="rate-item"><span>${formatNumber(rate, 4)}</span><span>${target}</span></div>`;
        }
        exchangeRateInfo.innerHTML = ratesInfoHTML;
        exchangeRateModal.classList.remove('hidden');
    }

    function render() { 
        if (currentSettlement) { 
            renderExpenses(); updateSummary(); toggleExpenseForm(currentSettlement.is_settled);
        }
    }

    function renderExpenses() {
        expenseTableBody.innerHTML = '';
        if (!currentSettlement || !currentSettlement.expenses) return;
        const [userA, userB] = currentSettlement.participants;
        const isLocked = currentSettlement.is_settled;

        currentSettlement.expenses.forEach(exp => {
            const row = expenseTableBody.insertRow();
            row.dataset.id = exp.id;
            row.classList.toggle('is-settled', isLocked);

            let amountHtml = `${formatNumber(exp.original_amount, 2)} ${exp.currency}`;
            if (exp.currency !== currentSettlement.base_currency) {
                amountHtml = `<span class="clickable-amount" data-id="${exp.id}" title="적용 환율 보기"><i class="fas fa-info-circle"></i> ${amountHtml}</span>`;
            }

            row.innerHTML = `
                <td>${exp.name}</td>
                <td>${amountHtml}</td>
                <td>${exp.payer}</td>
                <td>${formatNumber(exp.shares[userA] || 0, 2)} ${currentSettlement.base_currency}</td>
                <td>${formatNumber(exp.shares[userB] || 0, 2)} ${currentSettlement.base_currency}</td>
                <td><button class="delete-expense-btn" data-id="${exp.id}"><i class="fas fa-trash-alt"></i></button></td>
            `;
            
            const clickableAmountSpan = row.querySelector('.clickable-amount');
            if (clickableAmountSpan) {
                clickableAmountSpan.addEventListener('click', (e) => {
                    e.stopPropagation(); showExpenseExchangeRate(exp.id);
                });
            }

            if (!isLocked) {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-expense-btn') || e.target.closest('.clickable-amount')) return;
                    openEditExpenseModal(exp.id);
                });
            }
        });

        expenseTableBody.querySelectorAll('.delete-expense-btn').forEach(btn => 
            btn.addEventListener('click', (e) => { e.stopPropagation(); deleteExpense(parseInt(e.currentTarget.dataset.id)) })
        );
    }
    
    function updateSummary() {
        if (!currentSettlement) return;
        const { expenses, participants, base_currency, is_settled } = currentSettlement;
        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        totalExpenseP.textContent = `${locales[currentLang]?.totalExpense || 'Total Expense'}: ${formatNumber(totalAmount, 2)} ${base_currency}`;

        finalSettlementP.textContent = ''; completeSettlementBtn.classList.add('hidden');

        if (is_settled) {
            const [userA, userB] = participants;
            const amountPaidByA = expenses.filter(exp => exp.payer === userA).reduce((sum, exp) => sum + (exp.amount || 0), 0);
            const totalOwedByA = expenses.reduce((sum, exp) => sum + (exp.shares[userA] || 0), 0);
            const balanceA = amountPaidByA - totalOwedByA;

            let settlementText = locales[currentLang]?.settlementDone || 'Settlement complete';
            if (balanceA > 0.01) settlementText = `${userB} → ${userA}: ${formatNumber(balanceA, 2)} ${base_currency}`;
            else if (balanceA < -0.01) settlementText = `${userA} → ${userB}: ${formatNumber(Math.abs(balanceA), 2)} ${base_currency}`;
            
            finalSettlementP.textContent = settlementText;
            completeSettlementBtn.textContent = locales[currentLang]?.editSettlement || 'Reopen Settlement';
            completeSettlementBtn.classList.add('edit-mode'); completeSettlementBtn.classList.remove('hidden');
        } else {
            finalSettlementP.textContent = locales[currentLang]?.settlementInProgress || 'Settlement in progress...';
            if (expenses.length > 0) {
                completeSettlementBtn.textContent = locales[currentLang]?.completeSettlement || 'Complete Settlement';
                completeSettlementBtn.classList.remove('edit-mode'); completeSettlementBtn.classList.remove('hidden');
            }
        }
    }
    
    function toggleExpenseForm(isLocked) {
        expenseFormCard.classList.toggle('is-settled', isLocked);
        expenseFormCard.querySelectorAll('input, select, button').forEach(el => { el.disabled = isLocked; });
    }

    function clearInputs() {
        itemNameInput.value = ''; itemAmountInput.value = '';
        splitAmountAInput.value = ''; splitAmountBInput.value = '';
        document.getElementById('add-custom-rate').value = '';
        document.getElementById('add-rate-config-wrapper').classList.add('hidden');
        splitMethodSelect.value = 'equal';
        if(currentSettlement) itemCurrencySelect.value = currentSettlement.base_currency;
        handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs, splitAmountAInput, splitAmountBInput);
        itemNameInput.focus();
    }

    function downloadExcel() {
        if (!currentSettlement || currentSettlement.expenses.length === 0) { alert(locales[currentLang]?.noDataToExport || 'No expense data to export.'); return; }
        const { title, participants, expenses, base_currency } = currentSettlement;
        const [userA, userB] = participants;
        const translations = locales[currentLang] || {};
        const dataForExport = [];
        
        const header = [
            translations.tableHeaderItem || 'Item',
            translations.tableHeaderTotal || 'Total Amount',
            translations.tableHeaderPayer || 'Payer',
            (translations.shareOf || '{name} Share').replace('{name}', userA),
            (translations.shareOf || '{name} Share').replace('{name}', userB),
        ];
        dataForExport.push(header);
    
        expenses.forEach(exp => {
            let excelAmountStr = `${formatNumber(exp.original_amount, 2)} ${exp.currency}`;
            if (exp.currency !== base_currency) {
                const appliedRate = exp.amount / exp.original_amount;
                excelAmountStr += ` (적용환율: ${formatNumber(appliedRate, 4)})`;
            }
            dataForExport.push([
                exp.name, excelAmountStr, exp.payer,
                `${formatNumber(exp.shares[userA] || 0, 2)} ${base_currency}`,
                `${formatNumber(exp.shares[userB] || 0, 2)} ${base_currency}`,
            ]);
        });

        const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const amountPaidByA = expenses.filter(exp => exp.payer === userA).reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const totalOwedByA = expenses.reduce((sum, exp) => sum + (exp.shares[userA] || 0), 0);
        const balanceA = amountPaidByA - totalOwedByA;

        let resultString = translations.settlementDone || 'Settlement complete';
        if (balanceA > 0.01) resultString = `${userB} → ${userA}: ${formatNumber(balanceA, 2)} ${base_currency}`;
        else if (balanceA < -0.01) resultString = `${userA} → ${userB}: ${formatNumber(Math.abs(balanceA), 2)} ${base_currency}`;

        dataForExport.push([]); 
        dataForExport.push([translations.totalExpense || 'Total Expense', `${formatNumber(totalAmount, 2)} ${base_currency}`]);
        dataForExport.push([translations.settlementResult || 'Settlement Result', resultString]);

        const now = new Date();
        const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, '0'); const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0'); const minutes = String(now.getMinutes()).padStart(2, '0'); const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dataForExport);
    
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                if (!ws[cell_ref]) continue;
                if (R === 0) ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
                else ws[cell_ref].s = { alignment: { horizontal: "center", vertical: "center" } };
            }
        }
    
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
        const fileName = `${translations.expenseReport || 'Expense_Report'}_${title}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, fileName, { cellStyles: true });
    }

    initialize();
});