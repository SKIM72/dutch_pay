document.addEventListener('DOMContentLoaded', async () => {

    // --- Supabase Client Initialization ---
    const supabase = supabase.createClient(supabaseUrl, supabaseKey);

    // --- Global State ---
    let settlements = {}; // This will now be populated from Supabase
    let currentSettlement = null;
    let currentLang = 'ko';
    let currentEditingExpenseId = null;
    const exchangeRatesCache = {};
    const SUPPORTED_CURRENCIES = ['JPY', 'KRW', 'USD'];

    // --- Element References ---
    // (Element references remain the same as before)
    const languageSwitcher = document.getElementById('language-switcher');
    const sidebar = document.getElementById('left-pane');
    const appTitle = document.querySelector('header h1');
    const mainDatePicker = document.getElementById('main-date-picker');
    const settlementListContainer = document.getElementById('settlement-list-container');
    const addSettlementFab = document.getElementById('add-settlement-fab');
    const placeholderRightPane = document.getElementById('placeholder-right-pane');
    const calculatorView = document.getElementById('calculator');
    
    const addSettlementModal = document.getElementById('add-settlement-modal');
    const exchangeRateModal = document.getElementById('exchange-rate-modal');
    const editExpenseModal = document.getElementById('edit-expense-modal');

    const modalDateDisplay = document.getElementById('modal-date-display');
    const newSettlementTitleInput = document.getElementById('new-settlement-title');
    const newParticipantAInput = document.getElementById('new-participant-a');
    const newParticipantBInput = document.getElementById('new-participant-b');
    const baseCurrencySelect = document.getElementById('base-currency');
    const createSettlementBtn = document.getElementById('create-settlement-btn');

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
    const settlementDateBadge = document.getElementById('settlement-date-badge');
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

    // --- i18n (Localization) ---
    // (i18n functions remain the same)
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
        renderSettlementList(mainDatePicker.value);
    }

    function setLanguage(lang) {
        localStorage.setItem('preferredLang', lang);
        languageSwitcher.value = lang;
        updateUI(lang);
    }

    // --- Exchange Rate API ---
    // (Exchange rate function remains the same)
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

    // --- Initialization ---
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
        const { data, error } = await supabase
            .from('settlements')
            .select(`
                *,
                expenses (*)
            `);

        if (error) {
            console.error('Error loading data from Supabase:', error);
            return;
        }

        settlements = {};
        data.forEach(s => {
            const settlementDate = s.date;
            if (!settlements[settlementDate]) {
                settlements[settlementDate] = [];
            }
            settlements[settlementDate].push(s);
        });
        renderSettlementList(mainDatePicker.value);
    }

    function setInitialDate() {
        const todayString = new Date().toLocaleDateString('fr-CA', { timeZone: 'Asia/Tokyo' });
        mainDatePicker.value = todayString;
        mainDatePicker.dispatchEvent(new Event('change'));
    }

    // --- Event Listeners Setup ---
    // (Event listeners setup remains mostly the same, with async modifications)
    function setupEventListeners() {
        languageSwitcher.addEventListener('change', (e) => setLanguage(e.target.value));
        appTitle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
        mainDatePicker.addEventListener('change', () => renderSettlementList(mainDatePicker.value));
        addSettlementFab.addEventListener('click', () => {
            modalDateDisplay.textContent = mainDatePicker.value;
            addSettlementModal.classList.remove('hidden');
            newSettlementTitleInput.focus();
        });
        
        [addSettlementModal, exchangeRateModal, editExpenseModal].forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
            modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
        });

        createSettlementBtn.addEventListener('click', createSettlement);
        addExpenseBtn.addEventListener('click', addExpense);
        saveExpenseChangesBtn.addEventListener('click', saveExpenseChanges);
        settlementDateBadge.addEventListener('click', showExchangeRateModal);

        completeSettlementBtn.addEventListener('click', async () => {
            if (currentSettlement) {
                currentSettlement.is_settled = !currentSettlement.is_settled;
                const { error } = await supabase
                    .from('settlements')
                    .update({ is_settled: currentSettlement.is_settled })
                    .eq('id', currentSettlement.id);
                if (error) console.error('Error updating settlement state:', error);
                render();
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
                 }
            });
        });

        [editSplitAmountAInput, editSplitAmountBInput].forEach(input => {
            input.addEventListener('input', () => {
                 if (editSplitMethodSelect.value === 'amount') {
                    const amountA = parseFormattedNumber(editSplitAmountAInput.value);
                    const amountB = parseFormattedNumber(editSplitAmountBInput.value);
                    editItemAmountInput.value = formatNumber(amountA + amountB, 0);
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
    }

    // --- Settlement Management (Supabase Integrated) ---
    async function createSettlement() {
        const title = newSettlementTitleInput.value.trim();
        const date = mainDatePicker.value;
        const participantA = newParticipantAInput.value.trim() || 'A';
        const participantB = newParticipantBInput.value.trim() || 'B';
        const baseCurrency = baseCurrencySelect.value;

        if (!title || !date) return;

        const { data, error } = await supabase
            .from('settlements')
            .insert([{ title, date, participants: [participantA, participantB], base_currency: baseCurrency, is_settled: false }])
            .select();

        if (error) {
            console.error('Error creating settlement:', error);
            return;
        }
        
        const newSettlement = { ...data[0], expenses: [] };

        if (!settlements[date]) settlements[date] = [];
        settlements[date].push(newSettlement);
        
        renderSettlementList(date);
        selectSettlement(newSettlement);
        addSettlementModal.classList.add('hidden');
        newSettlementTitleInput.value = '';
        newParticipantAInput.value = 'A'; newParticipantBInput.value = 'B';
    }
    
    async function deleteSettlement(date, settlementId) {
        if (confirm(locales[currentLang]?.deleteSettlementConfirm)) {
            // First, delete all associated expenses
            const { error: expenseError } = await supabase
                .from('expenses')
                .delete()
                .eq('settlement_id', settlementId);

            if (expenseError) {
                console.error('Error deleting expenses:', expenseError);
                return;
            }

            // Then, delete the settlement itself
            const { error: settlementError } = await supabase
                .from('settlements')
                .delete()
                .eq('id', settlementId);
            
            if (settlementError) {
                console.error('Error deleting settlement:', settlementError);
                return;
            }
            
            settlements[date] = settlements[date].filter(s => s.id !== settlementId);
            if (currentSettlement && currentSettlement.id === settlementId) {
                currentSettlement = null;
                calculatorView.classList.add('hidden');
                placeholderRightPane.classList.remove('hidden');
            }
            renderSettlementList(date);
        }
    }

    function selectSettlement(settlement) {
        currentSettlement = settlement;
        placeholderRightPane.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        settlementDisplay.textContent = settlement.title;
        settlementDateBadge.textContent = settlement.date;
        itemCurrencySelect.value = settlement.base_currency;
        updateParticipantNames(settlement.participants);
        document.querySelectorAll('.settlement-item').forEach(item => item.classList.toggle('active', item.dataset.id == settlement.id));
        if (window.innerWidth <= 768) sidebar.classList.add('collapsed');
        render();
    }

    function renderSettlementList(date) {
        const list = settlements[date] || [];
        settlementListContainer.innerHTML = list.length === 0 
            ? `<p class="subtitle">${locales[currentLang]?.noHistory}</p>`
            : list.map(s => `
                <div class="settlement-item-wrapper">
                    <button class="settlement-item" data-id="${s.id}">
                        <div>
                            <span class="item-title">${s.title}</span>
                            <span class="item-participants">(${s.participants.join(', ')}) - ${s.base_currency}</span>
                        </div>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button class="delete-settlement-btn" data-date="${date}" data-id="${s.id}"><i class="fas fa-trash-alt"></i></button>
                </div>`).join('');
        
        settlementListContainer.querySelectorAll('.settlement-item').forEach(btn => btn.addEventListener('click', (e) => selectSettlement(list.find(s => s.id == e.currentTarget.dataset.id))));
        settlementListContainer.querySelectorAll('.delete-settlement-btn').forEach(btn => btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSettlement(e.currentTarget.dataset.date, parseInt(e.currentTarget.dataset.id))
        }));
    }

    function updateParticipantNames(participants) {
        const [userA, userB] = participants;
        const paidByString = locales[currentLang]?.paidBy;
        const shareOfString = locales[currentLang]?.shareOf;

        // Update options for all relevant selects
        [itemPayerSelect, editItemPayerSelect].forEach(select => {
            select.innerHTML = `<option value="${userA}">${paidByString.replace('{payer}', userA)}</option><option value="${userB}">${paidByString.replace('{payer}', userB)}</option>`;
        });
        
        document.getElementById('table-header-user-a').textContent = shareOfString.replace('{name}', userA);
        document.getElementById('table-header-user-b').textContent = shareOfString.replace('{name}', userB);

        // Update placeholders
        [splitAmountAInput, editSplitAmountAInput].forEach(input => input.placeholder = shareOfString.replace('{name}', userA));
        [splitAmountBInput, editSplitAmountBInput].forEach(input => input.placeholder = shareOfString.replace('{name}', userB));
    }

    // --- Expense Management (Supabase Integrated) ---
    async function addExpense() {
        if (!currentSettlement) return;
        const name = itemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(itemAmountInput.value);
        const currency = itemCurrencySelect.value;
        if (!name || originalAmount <= 0) { alert(locales[currentLang]?.invalidInput); return; }

        const rate = await getExchangeRate(currentSettlement.date, currency, currentSettlement.base_currency);
        if (rate === null) return;

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

        const { data, error } = await supabase
            .from('expenses')
            .insert([{ 
                settlement_id: currentSettlement.id, 
                name, 
                original_amount: originalAmount, 
                currency, 
                amount: convertedAmount, 
                payer, 
                split: splitMethod, 
                shares 
            }])
            .select();

        if (error) {
            console.error('Error adding expense:', error);
            return;
        }
        
        const newExpense = data[0];
        currentSettlement.expenses.push(newExpense);

        if (currentSettlement.is_settled) {
            currentSettlement.is_settled = false;
            const { error } = await supabase
                .from('settlements')
                .update({ is_settled: false })
                .eq('id', currentSettlement.id);
             if (error) console.error('Error updating settlement state:', error);
        }
        
        render();
        clearInputs();
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

        if (expense.split === 'amount') {
            const rate = expense.amount / expense.original_amount;
            const originalShareA = expense.shares[currentSettlement.participants[0]] / rate;
            const originalShareB = expense.shares[currentSettlement.participants[1]] / rate;
            editSplitAmountAInput.value = formatNumber(originalShareA, 0);
            editSplitAmountBInput.value = formatNumber(originalShareB, 0);
        }

        handleSplitMethodChange(editSplitMethodSelect, editItemAmountInput, editSplitAmountInputs, editSplitAmountAInput, editSplitAmountBInput);
        editExpenseModal.classList.remove('hidden');
    }

    async function saveExpenseChanges() {
        if (!currentSettlement || currentEditingExpenseId === null) return;

        const name = editItemNameInput.value.trim();
        const originalAmount = parseFormattedNumber(editItemAmountInput.value);
        const currency = editItemCurrencySelect.value;
        if (!name || originalAmount <= 0) { alert(locales[currentLang]?.invalidInput); return; }

        const rate = await getExchangeRate(currentSettlement.date, currency, currentSettlement.base_currency);
        if (rate === null) return;

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
        
        const { data, error } = await supabase
            .from('expenses')
            .update({ name, original_amount: originalAmount, currency, amount: convertedAmount, payer, split: splitMethod, shares })
            .eq('id', currentEditingExpenseId)
            .select();

        if (error) {
            console.error('Error saving expense changes:', error);
            return;
        }
        
        const updatedExpense = data[0];
        const expenseIndex = currentSettlement.expenses.findIndex(e => e.id === currentEditingExpenseId);
        if (expenseIndex > -1) {
            currentSettlement.expenses[expenseIndex] = updatedExpense;
        }

        if (currentSettlement.is_settled) {
             currentSettlement.is_settled = false;
            const { error } = await supabase
                .from('settlements')
                .update({ is_settled: false })
                .eq('id', currentSettlement.id);
             if (error) console.error('Error updating settlement state:', error);
        }

        render();
        editExpenseModal.classList.add('hidden');
        currentEditingExpenseId = null;
    }
    
    async function deleteExpense(expenseId) {
        if (confirm(locales[currentLang]?.deleteConfirm)) {
             const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', expenseId);
            
            if (error) {
                console.error('Error deleting expense:', error);
                return;
            }

            currentSettlement.expenses = currentSettlement.expenses.filter(exp => exp.id !== expenseId);
            if (currentSettlement.is_settled) {
                currentSettlement.is_settled = false;
                const { error: updateError } = await supabase
                    .from('settlements')
                    .update({ is_settled: false })
                    .eq('id', currentSettlement.id);
                if (updateError) console.error('Error updating settlement state:', updateError);
            }
            render();
        }
    }

    async function showExchangeRateModal() {
        if (!currentSettlement) return;
        const { date, base_currency } = currentSettlement;
        exchangeRateDate.textContent = `${date} ${locales[currentLang].baseDate}`;
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
            renderExpenses(); 
            updateSummary(); 
            toggleExpenseForm(currentSettlement.is_settled);
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

            row.innerHTML = `
                <td>${exp.name}</td>
                <td>${formatNumber(exp.original_amount, 2)} ${exp.currency}</td>
                <td>${exp.payer}</td>
                <td>${formatNumber(exp.shares[userA], 2)}</td>
                <td>${formatNumber(exp.shares[userB], 2)}</td>
                <td><button class="delete-expense-btn" data-id="${exp.id}"><i class="fas fa-trash-alt"></i></button></td>
            `;
            
            if (!isLocked) {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-expense-btn')) return;
                    openEditExpenseModal(exp.id);
                });
            }
        });
        expenseTableBody.querySelectorAll('.delete-expense-btn').forEach(btn => 
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteExpense(parseInt(e.currentTarget.dataset.id))
            })
        );
    }
    
    function updateSummary() {
        if (!currentSettlement) return;
        const { expenses, participants, base_currency, is_settled } = currentSettlement;
        const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        totalExpenseP.textContent = `${locales[currentLang]?.totalExpense}: ${formatNumber(totalAmount, 2)} ${base_currency}`;

        finalSettlementP.textContent = '';
        completeSettlementBtn.classList.add('hidden');

        if (is_settled) {
            const [userA, userB] = participants;
            const amountPaidByA = expenses.filter(exp => exp.payer === userA).reduce((sum, exp) => sum + exp.amount, 0);
            const totalOwedByA = expenses.reduce((sum, exp) => sum + exp.shares[userA], 0);
            const balanceA = amountPaidByA - totalOwedByA;

            let settlementText = locales[currentLang]?.settlementDone;
            const paysToString = ` ${locales[currentLang]?.paysTo} `;
            if (balanceA > 0.01) settlementText = `${userB}${paysToString}${userA}: ${formatNumber(balanceA)} ${base_currency}`;
            else if (balanceA < -0.01) settlementText = `${userA}${paysToString}${userB}: ${formatNumber(Math.abs(balanceA))} ${base_currency}`;
            finalSettlementP.textContent = settlementText;
            completeSettlementBtn.textContent = locales[currentLang]?.editSettlement;
            completeSettlementBtn.classList.add('edit-mode');
            completeSettlementBtn.classList.remove('hidden');
        } else {
            finalSettlementP.textContent = locales[currentLang]?.settlementInProgress;
            if (expenses.length > 0) {
                completeSettlementBtn.textContent = locales[currentLang]?.completeSettlement;
                completeSettlementBtn.classList.remove('edit-mode');
                completeSettlementBtn.classList.remove('hidden');
            }
        }
    }
    
    function toggleExpenseForm(isLocked) {
        expenseFormCard.classList.toggle('is-settled', isLocked);
        const formElements = expenseFormCard.querySelectorAll('input, select, button');
        formElements.forEach(el => el.disabled = isLocked);
        expenseTableBody.querySelectorAll('.delete-expense-btn').forEach(btn => {
            btn.disabled = isLocked;
            btn.style.pointerEvents = isLocked ? 'none' : 'auto';
            btn.style.opacity = isLocked ? 0.5 : 1;
        });
    }

    function clearInputs() {
        itemNameInput.value = ''; itemAmountInput.value = '';
        splitAmountAInput.value = ''; splitAmountBInput.value = '';
        splitMethodSelect.value = 'equal';
        if(currentSettlement) itemCurrencySelect.value = currentSettlement.base_currency;
        handleSplitMethodChange(splitMethodSelect, itemAmountInput, splitAmountInputs, splitAmountAInput, splitAmountBInput);
        itemNameInput.focus();
    }

    function downloadExcel() {
        if (!currentSettlement || currentSettlement.is_settled) return;
        alert(locales[currentLang]?.excelNotImplemented);
    }

    // --- Start the App ---
    initialize();
});